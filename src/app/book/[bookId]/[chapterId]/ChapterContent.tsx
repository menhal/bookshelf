"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterComments, ParagraphComment } from "@/lib/comments";

interface Props {
  bookId: string;
  chapterId: number;
  paragraphs: string[];
  initialComments: ChapterComments;
}

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 8;

export default function ChapterContent({
  bookId,
  chapterId,
  paragraphs,
  initialComments,
}: Props) {
  const [comments, setComments] = useState<ChapterComments>(initialComments);
  const [openParaIndex, setOpenParaIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  };

  const startLongPress = (e: React.PointerEvent, i: number) => {
    cancelLongPress();
    startRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      setOpenParaIndex(i);
      setDraft("");
      timerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const maybeCancelOnDrag = (e: React.PointerEvent) => {
    if (!startRef.current || !timerRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
      cancelLongPress();
    }
  };

  const closePanel = () => {
    setOpenParaIndex(null);
    setDraft("");
  };

  useEffect(() => {
    if (openParaIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenParaIndex(null);
        setDraft("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openParaIndex]);

  const handleAdd = async () => {
    if (openParaIndex === null) return;
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/book/${bookId}/chapter/${chapterId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paraIndex: openParaIndex, text }),
        }
      );
      if (!res.ok) throw new Error("save failed");
      const { comment } = (await res.json()) as { comment: ParagraphComment };
      const para = openParaIndex;
      setComments((prev) => {
        const list = prev[para] ?? [];
        return { ...prev, [para]: [...list, comment] };
      });
      setDraft("");
    } catch {
      alert("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (openParaIndex === null) return;
    const para = openParaIndex;
    const previous = comments;
    setComments((prev) => {
      const list = (prev[para] ?? []).filter((c) => c.id !== id);
      const next = { ...prev };
      if (list.length === 0) delete next[para];
      else next[para] = list;
      return next;
    });
    try {
      const res = await fetch(
        `/api/book/${bookId}/chapter/${chapterId}/comments`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paraIndex: para, id }),
        }
      );
      if (!res.ok) throw new Error("delete failed");
    } catch {
      setComments(previous);
      alert("删除失败");
    }
  };

  const currentList =
    openParaIndex !== null ? comments[openParaIndex] ?? [] : [];
  const currentParagraph =
    openParaIndex !== null ? paragraphs[openParaIndex]?.trim() ?? "" : "";

  return (
    <>
      <article className="leading-8 text-base">
        {paragraphs.map((p, i) => {
          const list = comments[i] ?? [];
          return (
            <p
              key={i}
              className="mb-4 indent-8 select-none"
              onPointerDown={(e) => startLongPress(e, i)}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerMove={maybeCancelOnDrag}
              onContextMenu={(e) => e.preventDefault()}
            >
              {p.trim()}
              {list.length > 0 && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenParaIndex(i);
                    setDraft("");
                  }}
                  className="ml-1 inline-flex items-center gap-0.5 align-middle rounded-full px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: "var(--accent)", color: "white" }}
                  aria-label={`查看 ${list.length} 条评论`}
                >
                  💬 {list.length}
                </button>
              )}
            </p>
          );
        })}
      </article>

      {openParaIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={closePanel}
        >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-lg p-5 shadow-xl sm:mx-4 sm:max-w-lg sm:rounded-lg"
            style={{
              backgroundColor: "var(--card-bg)",
              color: "var(--foreground)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-bold">段落评论</h2>
            <p
              className="mb-4 line-clamp-3 rounded p-2 text-sm"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--muted)",
              }}
            >
              {currentParagraph}
            </p>

            <div className="mb-4 space-y-2">
              {currentList.length === 0 && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  暂无评论
                </p>
              )}
              {currentList.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="flex-1 whitespace-pre-wrap break-words">
                    {c.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="shrink-0 text-xs hover:underline"
                    style={{ color: "var(--muted)" }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="写下你的评论..."
              className="w-full rounded border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
              }}
            />

            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePanel}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !draft.trim()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {saving ? "添加中..." : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
