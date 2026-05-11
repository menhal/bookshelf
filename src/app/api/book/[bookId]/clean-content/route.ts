import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { invalidateBookCache } from "@/lib/books";

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const maxDuration = 300;

interface ApplyRequestBody {
  patterns: string[];
  scope?: "current" | "all";
  chapterId?: number;
}

function applyPatterns(
  origTitle: string,
  origContent: string,
  patterns: string[]
): { newTitle: string; newContent: string; hits: number } {
  let newTitle = origTitle;
  let newContent = origContent;
  let hits = 0;
  for (const p of patterns) {
    const tParts = newTitle.split(p);
    const cParts = newContent.split(p);
    const tHits = tParts.length - 1;
    const cHits = cParts.length - 1;
    if (tHits + cHits === 0) continue;
    newTitle = tParts.join("");
    newContent = cParts.join("");
    hits += tHits + cHits;
  }
  return { newTitle, newContent, hits };
}

// Pull chapters one page at a time. Loading all chapters of a long book in a
// single SELECT made the libsql HTTP response large enough that the underlying
// undici socket would intermittently drop with "fetch failed".
const PAGE_SIZE = 50;

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;

    let body: ApplyRequestBody;
    try {
      body = (await request.json()) as ApplyRequestBody;
    } catch {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 }
      );
    }

    const patterns = (body.patterns || [])
      .map((p) => (typeof p === "string" ? p : ""))
      .filter((p) => p.length > 0);
    if (patterns.length === 0) {
      return NextResponse.json(
        { error: "patterns is required" },
        { status: 400 }
      );
    }

    const scope: "current" | "all" = body.scope === "all" ? "all" : "current";

    if (scope === "current") {
      if (typeof body.chapterId !== "number") {
        return NextResponse.json(
          { error: "chapterId required for scope=current" },
          { status: 400 }
        );
      }
      const chapterId = body.chapterId;

      const result = await withRetry(() =>
        turso.execute({
          sql: "SELECT id, title, content FROM chapters WHERE book_id = ? AND id = ?",
          args: [bookId, chapterId],
        })
      );
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "chapter not found" },
          { status: 404 }
        );
      }

      const row = result.rows[0];
      const { newTitle, newContent, hits } = applyPatterns(
        String(row.title ?? ""),
        String(row.content ?? ""),
        patterns
      );

      if (hits > 0) {
        await withRetry(() =>
          turso.execute({
            sql: "UPDATE chapters SET title = ?, content = ? WHERE book_id = ? AND id = ?",
            args: [newTitle, newContent, bookId, chapterId],
          })
        );
        await withRetry(() => invalidateBookCache(bookId, [chapterId]));
      }

      return NextResponse.json({
        chaptersScanned: 1,
        chaptersAffected: hits > 0 ? 1 : 0,
        occurrences: hits,
      });
    }

    let cursor = -1;
    let scanned = 0;
    let totalOccurrences = 0;
    const updatedIds: number[] = [];

    while (true) {
      const page = await withRetry(() =>
        turso.execute({
          sql: "SELECT id, title, content FROM chapters WHERE book_id = ? AND id > ? ORDER BY id LIMIT ?",
          args: [bookId, cursor, PAGE_SIZE],
        })
      );
      if (page.rows.length === 0) break;
      scanned += page.rows.length;

      const pageUpdates: Array<{
        id: number;
        newTitle: string;
        newContent: string;
      }> = [];

      for (const row of page.rows) {
        const id = Number(row.id);
        const { newTitle, newContent, hits } = applyPatterns(
          String(row.title ?? ""),
          String(row.content ?? ""),
          patterns
        );
        if (hits > 0) {
          pageUpdates.push({ id, newTitle, newContent });
          totalOccurrences += hits;
        }
      }

      if (pageUpdates.length > 0) {
        const stmts = pageUpdates.map((u) => ({
          sql: "UPDATE chapters SET title = ?, content = ? WHERE book_id = ? AND id = ?",
          args: [u.newTitle, u.newContent, bookId, u.id],
        }));
        await withRetry(() => turso.batch(stmts, "write"));
        for (const u of pageUpdates) updatedIds.push(u.id);
      }

      cursor = Number(page.rows[page.rows.length - 1].id);
      if (page.rows.length < PAGE_SIZE) break;
    }

    if (updatedIds.length > 0) {
      await withRetry(() => invalidateBookCache(bookId, updatedIds));
    }

    return NextResponse.json({
      chaptersScanned: scanned,
      chaptersAffected: updatedIds.length,
      occurrences: totalOccurrences,
    });
  } catch (err) {
    console.error("[clean-content] failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      { status: 500 }
    );
  }
}
