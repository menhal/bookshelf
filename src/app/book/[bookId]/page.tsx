import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import {
  getBookWithOverrides,
  getChapterContent,
  getChapterList,
  getProgress,
} from "@/lib/books";
import EditBook from "./EditBook";

// ISR: cached for 60s. "继续阅读" target chapter may lag by up to a minute.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): Promise<Metadata> {
  const { bookId } = await params;
  const book = await getBookWithOverrides(bookId);
  return { title: book ? book.meta.title : "未找到书籍" };
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = await getBookWithOverrides(bookId);
  if (!book) notFound();

    const chapters = await getChapterList(bookId);
    const lastChapterId = await getProgress(bookId);
    const startChapterId = lastChapterId ?? (chapters.length > 0 ? chapters[0].id : null);

    // Warm Redis with the chapter the "继续阅读" button will jump to.
    if (startChapterId != null) {
      after(async () => {
        await getChapterContent(bookId, startChapterId).catch(() => null);
      });
    }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/cover/${bookId}`}
          alt={book.meta.title}
          className="h-48 w-36 rounded-lg object-cover shadow"
        />
        <div className="flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-bold">{book.meta.title}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {book.meta.author}
            </p>
            <div
              className="mt-2 flex items-center gap-3 text-xs"
              style={{ color: "var(--muted)" }}
            >
              <span>{book.meta.genre}</span>
              <span>·</span>
              <span>{book.meta.totalChapters} 章</span>
              {book.meta.status && (
                <>
                  <span>·</span>
                  <span>{book.meta.status}</span>
                </>
              )}
            </div>
          </div>
          <p
            className="mt-3 line-clamp-4 text-sm leading-relaxed"
            style={{ color: "var(--muted)" }}
          >
            {book.meta.description}
          </p>
          <div className="mt-4 flex items-center gap-3">
            {startChapterId && (
              <Link
                href={`/book/${bookId}/${startChapterId}`}
                className="inline-block w-fit rounded-lg px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {lastChapterId ? "继续阅读" : "开始阅读"}
              </Link>
            )}
            <EditBook bookId={bookId} meta={book.meta} />
          </div>
        </div>
      </div>

      {/* Chapter List */}
      <h2 className="mb-4 text-xl font-semibold">目录</h2>
      <div
        className="rounded-lg border"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--border)",
        }}
      >
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {chapters.map((ch) => (
            <li key={ch.id}>
              <Link
                href={`/book/${bookId}/${ch.id}`}
                className="block px-4 py-3 text-sm transition-colors hover:bg-[var(--background)]"
              >
                {ch.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <Link
          href="/"
          className="text-sm hover:underline"
          style={{ color: "var(--accent)" }}
        >
          ← 返回书架
        </Link>
      </div>
    </main>
  );
}
