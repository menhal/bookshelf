import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import {
  getBookByBookId,
  getChapterContent as getChapter,
  getChapterIds,
} from "@/lib/books";
import { getChapterComments } from "@/lib/comments";
import RecordProgress from "./RecordProgress";
import ChapterContent from "./ChapterContent";
import DetectWatermark from "./DetectWatermark";

// Chapters are immutable once downloaded. Cache the rendered HTML at the
// Vercel edge for a year so most reads never invoke the function at all
// (sin1 → hkg1 round-trip + 4 Redis reads disappears).
export const revalidate = 31536000;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}): Promise<Metadata> {
  const { bookId, chapterId: chapterIdStr } = await params;
  const chapterId = parseInt(chapterIdStr, 10);
  if (isNaN(chapterId)) return { title: "未找到章节" };
  const [book, chapter] = await Promise.all([
    getBookByBookId(bookId),
    getChapter(bookId, chapterId),
  ]);
  if (!book) return { title: "未找到书籍" };
  return {
    title: chapter
      ? `${book.meta.title} - ${chapter.title}`
      : book.meta.title,
  };
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId: chapterIdStr } = await params;
  const chapterId = parseInt(chapterIdStr, 10);
  if (isNaN(chapterId)) notFound();

  // Fan out all four reads in parallel — they have no dependencies on each
  // other. Saves ~3 round-trips × Redis-or-Turso latency.
  const [book, chapter, chapterIds, initialComments] = await Promise.all([
    getBookByBookId(bookId),
    getChapter(bookId, chapterId),
    getChapterIds(bookId),
    getChapterComments(bookId, chapterId),
  ]);
  if (!book) notFound();
  if (!chapter) notFound();

  const currentIndex = chapterIds.indexOf(chapterId);
  const prevChapterId = currentIndex > 0 ? chapterIds[currentIndex - 1] : null;
  const nextChapterId =
    currentIndex >= 0 && currentIndex < chapterIds.length - 1
      ? chapterIds[currentIndex + 1]
      : null;

  // Warm Redis with the next 3 chapters so flipping forward is instant.
  // Runs after the response is sent so it never blocks render.
  if (currentIndex >= 0) {
    const lookahead = chapterIds.slice(currentIndex + 1, currentIndex + 4);
    if (lookahead.length > 0) {
      after(async () => {
        await Promise.all(
          lookahead.map((id) => getChapter(bookId, id).catch(() => null))
        );
      });
    }
  }

  // Split content into paragraphs
  const paragraphs = chapter.content
    .split(/\n+/)
    .filter((p) => p.trim().length > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <RecordProgress bookId={bookId} chapterId={chapterId} />
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/" className="hover:underline" style={{ color: "var(--accent)" }}>
          书架
        </Link>
        <span>/</span>
        <Link
          href={`/book/${bookId}`}
          className="hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {book.meta.title}
        </Link>
      </div>

      {/* Chapter Title */}
      <h1 className="mb-8 text-2xl font-bold">{chapter.title}</h1>



      {/* Content */}
      <ChapterContent
        bookId={bookId}
        chapterId={chapterId}
        paragraphs={paragraphs}
        initialComments={initialComments}
      />

      <DetectWatermark
          bookId={bookId}
          chapterId={chapterId}
          chapterContent={chapter.content}
      />

      {/* Navigation */}
      <nav
        className="mt-12 flex items-center justify-between border-t pt-6"
        style={{ borderColor: "var(--border)" }}
      >
        {prevChapterId !== null ? (
          <Link
            href={`/book/${bookId}/${prevChapterId}`}
            className="text-sm hover:underline"
            style={{ color: "var(--accent)" }}
          >
            ← 上一章
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/book/${bookId}`}
          className="text-sm hover:underline"
          style={{ color: "var(--accent)" }}
        >
          目录
        </Link>
        {nextChapterId !== null ? (
          <Link
            href={`/book/${bookId}/${nextChapterId}`}
            className="text-sm hover:underline"
            style={{ color: "var(--accent)" }}
          >
            下一章 →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
