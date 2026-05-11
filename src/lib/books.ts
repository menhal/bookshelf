import { cache } from "react";
import { createClient } from "@libsql/client";
import { Redis } from "@upstash/redis";

// B) Module-level singletons — keep undici dispatcher pool warm across calls
//    within the same Vercel function instance.
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// C) Retry once on transient socket errors. AWS infra occasionally closes
//    pooled keep-alive sockets that undici tries to reuse, surfacing as
//    UND_ERR_SOCKET / ECONNRESET / "fetch failed".
const TRANSIENT_CODES = new Set([
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "ECONNRESET",
  "EPIPE",
]);

function isTransient(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" && TRANSIENT_CODES.has(code);
}

async function withTursoRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransient(err)) throw err;
    return await fn();
  }
}

// D) Redis cache for Turso reads. Turso round-trip from Vercel can be 1–5s;
//    Upstash REST is sub-100ms. Long TTL with manual invalidation via
//    /api/cache/invalidate. Chapter content is immutable so it never expires.
const CACHE_TTL_LONG = 7 * 24 * 60 * 60; // 7 days for meta / chapter list

const cacheKey = {
  allBooks: "cache:allBooks",
  bookMeta: (bookId: string) => `cache:bookMeta:${bookId}`,
  chapterList: (bookId: string) => `cache:chapterList:${bookId}`,
  chapterIds: (bookId: string) => `cache:chapterIds:${bookId}`,
  chapter: (bookId: string, chapterId: number) =>
    `cache:chapter:${bookId}:${chapterId}`,
};

export async function getProgress(bookId: string): Promise<number | null> {
  return await redis.get<number>(`progress:${bookId}`);
}

export async function getLastReadTimes(
  bookIds: string[]
): Promise<Record<string, number>> {
  if (bookIds.length === 0) return {};
  const keys = bookIds.map((id) => `lastRead:${id}`);
  const values = await redis.mget<(number | null)[]>(...keys);
  const result: Record<string, number> = {};
  for (let i = 0; i < bookIds.length; i++) {
    if (values[i] != null) result[bookIds[i]] = values[i]!;
  }
  return result;
}

export interface BookMeta {
  title: string;
  author: string;
  bookId: string;
  genre: string;
  description: string | null;
  status: string | null;
  totalChapters: number;
  coverUrl: string | null;
  private: boolean;
}

export interface ChapterInfo {
  id: number;
  title: string;
}

export interface BookInfo {
  meta: BookMeta;
}

function rowsToMeta(
  rows: Array<Record<string, unknown>>,
  bookId: string
): BookMeta {
  const raw: Record<string, string> = {};
  for (const row of rows) {
    raw[row.key as string] = row.value as string;
  }
  return {
    title: raw.title || "",
    author: raw.author || "",
    bookId: raw.bookId || bookId,
    genre: raw.genre || "",
    description: raw.description || null,
    status: raw.status || null,
    totalChapters: parseInt(raw.totalChapters || "0", 10),
    coverUrl: raw.coverUrl || null,
    private: false,
  };
}

// A) cache() dedupes calls within a single React render pass, so
//    generateMetadata and the page component share the same Turso fetch.

export const getAllBooks = cache(async (): Promise<BookInfo[]> => {
  const cached = await redis.get<BookInfo[]>(cacheKey.allBooks);
  if (cached) return cached;

  const result = await withTursoRetry(() =>
    turso.execute("SELECT book_id, key, value FROM meta")
  );

  const booksMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of result.rows) {
    const bid = row.book_id as string;
    if (!booksMap[bid]) booksMap[bid] = [];
    booksMap[bid].push(row);
  }

  const books = Object.entries(booksMap).map(([bid, rows]) => ({
    meta: rowsToMeta(rows, bid),
  }));

  await redis.set(cacheKey.allBooks, books, { ex: CACHE_TTL_LONG });
  return books;
});

export const getBookByBookId = cache(
  async (bookId: string): Promise<BookInfo | null> => {
    const cached = await redis.get<BookInfo>(cacheKey.bookMeta(bookId));
    if (cached) return cached;

    const result = await withTursoRetry(() =>
      turso.execute({
        sql: "SELECT key, value FROM meta WHERE book_id = ?",
        args: [bookId],
      })
    );
    if (result.rows.length === 0) return null;
    const book: BookInfo = { meta: rowsToMeta(result.rows, bookId) };
    await redis.set(cacheKey.bookMeta(bookId), book, { ex: CACHE_TTL_LONG });
    return book;
  }
);

export const getChapterList = cache(
  async (bookId: string): Promise<ChapterInfo[]> => {
    const cached = await redis.get<ChapterInfo[]>(cacheKey.chapterList(bookId));
    if (cached) return cached;

    const result = await withTursoRetry(() =>
      turso.execute({
        sql: "SELECT id, title FROM chapters WHERE book_id = ? ORDER BY id",
        args: [bookId],
      })
    );
    const chapters = result.rows.map((r) => ({
      id: Number(r.id),
      title: r.title as string,
    }));
    await redis.set(cacheKey.chapterList(bookId), chapters, {
      ex: CACHE_TTL_LONG,
    });
    return chapters;
  }
);

// Chapter pages only need adjacent IDs for prev/next nav, not full titles.
// For a 2000-chapter book this is ~10KB instead of ~150KB.
export const getChapterIds = cache(
  async (bookId: string): Promise<number[]> => {
    const cached = await redis.get<number[]>(cacheKey.chapterIds(bookId));
    if (cached) return cached;

    const result = await withTursoRetry(() =>
      turso.execute({
        sql: "SELECT id FROM chapters WHERE book_id = ? ORDER BY id",
        args: [bookId],
      })
    );
    const ids = result.rows.map((r) => Number(r.id));
    await redis.set(cacheKey.chapterIds(bookId), ids, { ex: CACHE_TTL_LONG });
    return ids;
  }
);

export const getChapterContent = cache(
  async (
    bookId: string,
    chapterId: number
  ): Promise<{ title: string; content: string } | null> => {
    const cached = await redis.get<{ title: string; content: string }>(
      cacheKey.chapter(bookId, chapterId)
    );
    if (cached) return cached;

    const result = await withTursoRetry(() =>
      turso.execute({
        sql: "SELECT title, content FROM chapters WHERE book_id = ? AND id = ?",
        args: [bookId, chapterId],
      })
    );
    if (result.rows.length === 0) return null;
    const data = {
      title: result.rows[0].title as string,
      content: result.rows[0].content as string,
    };
    // Chapters are immutable once written, so no TTL.
    await redis.set(cacheKey.chapter(bookId, chapterId), data);
    return data;
  }
);

/* ---- Delete book (Turso + Redis) ---- */

export async function deleteBook(bookId: string): Promise<void> {
  // 1. Delete from Turso
  await withTursoRetry(() =>
    turso.batch(
      [
        { sql: "DELETE FROM chapters WHERE book_id = ?", args: [bookId] },
        { sql: "DELETE FROM meta WHERE book_id = ?", args: [bookId] },
        { sql: "DELETE FROM cover WHERE book_id = ?", args: [bookId] },
      ],
      "write"
    )
  );

  // 2. Delete Redis overrides and progress
  const redisKeys: string[] = [
    `bookMeta:${bookId}`,
    `bookCover:${bookId}`,
    `progress:${bookId}`,
    `lastRead:${bookId}`,
  ];
  await redis.del(...(redisKeys as [string, ...string[]]));

  // 3. Invalidate caches
  await invalidateBookCache(bookId);

  // 4. Also scan and delete any chapter caches
  let cursor: string = "0";
  do {
    const result = (await redis.scan(cursor, {
      match: `cache:chapter:${bookId}:*`,
      count: 200,
    })) as [string, string[]];
    cursor = result[0];
    const keys = result[1];
    if (keys.length > 0) {
      await redis.del(...(keys as [string, ...string[]]));
    }
  } while (cursor !== "0");
}

/* ---- Cache invalidation (called manually after spider runs) ---- */

export async function invalidateBookCache(
  bookId: string,
  chapterIds?: number[]
): Promise<void> {
  const keys: string[] = [
    cacheKey.allBooks,
    cacheKey.bookMeta(bookId),
    cacheKey.chapterList(bookId),
    cacheKey.chapterIds(bookId),
  ];
  if (chapterIds && chapterIds.length > 0) {
    for (const id of chapterIds) keys.push(cacheKey.chapter(bookId, id));
  }
  const CHUNK = 100;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK) as [string, ...string[]];
    await redis.del(...slice);
  }
}

export async function invalidateAllCache(): Promise<{ deleted: number }> {
  let cursor: string = "0";
  let deleted = 0;
  do {
    const result = (await redis.scan(cursor, {
      match: "cache:*",
      count: 200,
    })) as [string, string[]];
    cursor = result[0];
    const keys = result[1];
    if (keys.length > 0) {
      await redis.del(...(keys as [string, ...string[]]));
      deleted += keys.length;
    }
  } while (cursor !== "0");
  return { deleted };
}

export const getCover = cache(
  async (
    bookId: string
  ): Promise<{ data: Buffer; mime: string } | null> => {
    const result = await withTursoRetry(() =>
      turso.execute({
        sql: "SELECT data, mime FROM cover WHERE book_id = ?",
        args: [bookId],
      })
    );
    if (result.rows.length === 0) return null;
    const raw = result.rows[0].data;
    const data = Buffer.from(raw as unknown as ArrayBuffer);
    return { data, mime: result.rows[0].mime as string };
  }
);

/* ---- Redis overrides for book metadata & cover ---- */

export interface BookMetaOverrides {
  title?: string;
  author?: string;
  genre?: string;
  description?: string;
  private?: boolean;
}

export async function getBookMetaOverrides(
  bookId: string
): Promise<BookMetaOverrides | null> {
  return await redis.get<BookMetaOverrides>(`bookMeta:${bookId}`);
}

export async function setBookMetaOverrides(
  bookId: string,
  overrides: BookMetaOverrides
): Promise<void> {
  await redis.set(`bookMeta:${bookId}`, overrides);
}

export async function getBookCoverOverride(
  bookId: string
): Promise<{ data: string; mime: string } | null> {
  return await redis.get<{ data: string; mime: string }>(
    `bookCover:${bookId}`
  );
}

export async function setBookCoverOverride(
  bookId: string,
  base64Data: string,
  mime: string
): Promise<void> {
  await redis.set(`bookCover:${bookId}`, { data: base64Data, mime });
}

function applyOverrides(meta: BookMeta, overrides: BookMetaOverrides): void {
  if (overrides.title) meta.title = overrides.title;
  if (overrides.author) meta.author = overrides.author;
  if (overrides.genre) meta.genre = overrides.genre;
  if (overrides.description !== undefined)
    meta.description = overrides.description;
  if (overrides.private !== undefined) meta.private = overrides.private;
}

export async function getBookWithOverrides(
  bookId: string
): Promise<BookInfo | null> {
  const book = await getBookByBookId(bookId);
  if (!book) return null;
  const overrides = await getBookMetaOverrides(bookId);
  if (overrides) applyOverrides(book.meta, overrides);
  return book;
}

export async function getAllBooksWithOverrides(): Promise<BookInfo[]> {
  const books = await getAllBooks();
  if (books.length === 0) return books;
  const keys = books.map((b) => `bookMeta:${b.meta.bookId}`);
  const values = await redis.mget<(BookMetaOverrides | null)[]>(...keys);
  for (let i = 0; i < books.length; i++) {
    const overrides = values[i];
    if (overrides) applyOverrides(books[i].meta, overrides);
  }
  return books;
}
