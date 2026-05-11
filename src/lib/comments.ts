import { Redis } from "@upstash/redis";

export interface ParagraphComment {
  id: string;
  text: string;
  ts: number;
}

export type ChapterComments = Record<number, ParagraphComment[]>;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function key(bookId: string, chapterId: number) {
  return `comments:${bookId}:${chapterId}`;
}

function makeId(ts: number): string {
  const rand = Math.floor(Math.random() * 0xfffff)
    .toString(16)
    .padStart(5, "0");
  return `${ts}_${rand}`;
}

export async function getChapterComments(
  bookId: string,
  chapterId: number
): Promise<ChapterComments> {
  const value = await redis.get<ChapterComments>(key(bookId, chapterId));
  return value ?? {};
}

export async function addParagraphComment(
  bookId: string,
  chapterId: number,
  paraIndex: number,
  text: string
): Promise<ParagraphComment> {
  const existing = (await redis.get<ChapterComments>(key(bookId, chapterId))) ?? {};
  const ts = Date.now();
  const comment: ParagraphComment = { id: makeId(ts), text, ts };
  const list = existing[paraIndex] ?? [];
  existing[paraIndex] = [...list, comment];
  await redis.set(key(bookId, chapterId), existing);
  return comment;
}

export async function deleteParagraphComment(
  bookId: string,
  chapterId: number,
  paraIndex: number,
  commentId: string
): Promise<void> {
  const existing = await redis.get<ChapterComments>(key(bookId, chapterId));
  if (!existing) return;
  const list = existing[paraIndex];
  if (!list) return;
  const filtered = list.filter((c) => c.id !== commentId);
  if (filtered.length === 0) {
    delete existing[paraIndex];
  } else {
    existing[paraIndex] = filtered;
  }
  await redis.set(key(bookId, chapterId), existing);
}
