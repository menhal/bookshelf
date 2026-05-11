"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  bookId: string;
  chapterId: number;
  chapterContent: string;
}

type Scope = "current" | "all";

interface Candidate {
  pattern: string;
  count: number;
  context: string;
}

// Language-agnostic detection: find every length-SEED_LEN window that repeats
// >= MIN_COUNT times, then greedily extend each one outward — at every step
// pick the most common neighboring char among the surviving positions, stop
// when fewer than MIN_COUNT positions agree. The result is the maximal
// repeated substring covering each seed. Works for any obfuscation shape
// (ASCII, mixed CJK like "bg94点cc", garbled symbols) because it makes no
// assumption about character classes.
const SEED_LEN = 4;
const MIN_COUNT = 3;
const MAX_LEN = 200;
const MAX_RESULTS = 20;

function detectCandidates(text: string): Candidate[] {
  const seedPositions = new Map<string, number[]>();
  for (let i = 0; i + SEED_LEN <= text.length; i++) {
    const g = text.slice(i, i + SEED_LEN);
    let arr = seedPositions.get(g);
    if (!arr) {
      arr = [];
      seedPositions.set(g, arr);
    }
    arr.push(i);
  }

  const found = new Map<string, number>();
  const seenSeeds = new Set<string>();

  for (const [seed, positions] of seedPositions) {
    if (positions.length < MIN_COUNT) continue;
    if (seenSeeds.has(seed)) continue;

    let curPositions = positions.slice();
    let leftExt = 0;
    let rightExt = 0;

    const stepBest = (
      offsetFor: (p: number) => number
    ): { char: string; positions: number[] } | null => {
      const counts = new Map<string, number>();
      for (const p of curPositions) {
        const idx = offsetFor(p);
        if (idx < 0 || idx >= text.length) continue;
        const c = text[idx];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let bestChar: string | undefined;
      let bestCount = 0;
      for (const [c, n] of counts) {
        if (n > bestCount) {
          bestCount = n;
          bestChar = c;
        }
      }
      if (bestChar === undefined || bestCount < MIN_COUNT) return null;
      const survivors = curPositions.filter((p) => {
        const idx = offsetFor(p);
        return idx >= 0 && idx < text.length && text[idx] === bestChar;
      });
      return { char: bestChar, positions: survivors };
    };

    while (SEED_LEN + leftExt + rightExt < MAX_LEN) {
      const off = SEED_LEN + rightExt;
      const best = stepBest((p) => p + off);
      if (!best) break;
      curPositions = best.positions;
      rightExt++;
    }
    while (SEED_LEN + leftExt + rightExt < MAX_LEN) {
      const off = -leftExt - 1;
      const best = stepBest((p) => p + off);
      if (!best) break;
      curPositions = best.positions;
      leftExt++;
    }

    const start = curPositions[0] - leftExt;
    const end = curPositions[0] + SEED_LEN + rightExt;
    const substr = text.slice(start, end);
    const count = curPositions.length;

    const prev = found.get(substr) ?? 0;
    if (count > prev) found.set(substr, count);

    // Mark every seed inside this maximal repeat as visited — they would
    // converge to the same substring and just waste work.
    for (let k = 0; k + SEED_LEN <= substr.length; k++) {
      seenSeeds.add(substr.slice(k, k + SEED_LEN));
    }
  }

  // Drop pure-whitespace; drop entries that are strict substrings of another
  // entry with the same count (the longer one is the real boundary).
  const entries = [...found.entries()].filter(
    ([s]) => s.trim().length >= SEED_LEN
  );
  const candidates = entries.filter(
    ([s, c]) =>
      !entries.some(([s2, c2]) => s2 !== s && c2 === c && s2.includes(s))
  );

  // Rank by count × length so longer fixed strings (the typical watermark
  // shape) bubble above incidental 4-char Chinese phrases.
  const result: Candidate[] = candidates.map(([pattern, count]) => {
    const idx = text.indexOf(pattern);
    const ctxStart = Math.max(0, idx - 8);
    const ctxEnd = Math.min(text.length, idx + pattern.length + 8);
    const context = text.slice(ctxStart, ctxEnd).replace(/\s+/g, " ");
    return { pattern, count, context };
  });
  result.sort(
    (a, b) => b.count * b.pattern.length - a.count * a.pattern.length
  );
  return result.slice(0, MAX_RESULTS);
}

// Cross-paragraph signal: split chapter on blank lines, then find the longest
// substring that appears in AT LEAST ~70% of paragraphs. Strict "every
// paragraph" was wrong — short dialogue lines, scraper-missed lines, etc. can
// legitimately lack the watermark, and missing one paragraph would zero the
// match. Approach: at each length L (largest first), every paragraph emits
// its L-grams (deduped per paragraph), we count how many paragraphs each
// L-gram appears in, and return the first L-gram crossing the threshold.
const LCS_MIN_LEN = 4;
const LCS_MAX_LEN = 200;
const LCS_THRESHOLD_RATIO = 0.3;
const LCS_MIN_PARAGRAPHS = 3;

function findParagraphLCS(text: string): string | null {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length < LCS_MIN_PARAGRAPHS) return null;

  const threshold = Math.max(
    LCS_MIN_PARAGRAPHS,
    Math.ceil(paragraphs.length * LCS_THRESHOLD_RATIO)
  );

  let maxParaLen = 0;
  for (const p of paragraphs) {
    if (p.length > maxParaLen) maxParaLen = p.length;
  }
  const maxLen = Math.min(maxParaLen, LCS_MAX_LEN);

  for (let len = maxLen; len >= LCS_MIN_LEN; len--) {
    const counts = new Map<string, number>();
    for (const p of paragraphs) {
      if (p.length < len) continue;
      const seen = new Set<string>();
      for (let i = 0; i + len <= p.length; i++) {
        const sub = p.slice(i, i + len);
        if (seen.has(sub)) continue;
        seen.add(sub);
        counts.set(sub, (counts.get(sub) ?? 0) + 1);
      }
    }
    for (const [sub, c] of counts) {
      if (c >= threshold) return sub;
    }
  }
  return null;
}

export default function DetectWatermark({
  bookId,
  chapterId,
  chapterContent,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<Scope>("current");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleOpen = () => {
    const found = detectCandidates(chapterContent);
    const initialSelected = new Set<string>();

    const lcs = findParagraphLCS(chapterContent);
    if (lcs) {
      if (!found.some((c) => c.pattern === lcs)) {
        const count = chapterContent.split(lcs).length - 1;
        const idx = chapterContent.indexOf(lcs);
        let context = "";
        if (idx >= 0) {
          const ctxStart = Math.max(0, idx - 8);
          const ctxEnd = Math.min(
            chapterContent.length,
            idx + lcs.length + 8
          );
          context = chapterContent
            .slice(ctxStart, ctxEnd)
            .replace(/\s+/g, " ");
        }
        found.unshift({ pattern: lcs, count, context });
      }
      initialSelected.add(lcs);
    }

    setCandidates(found);
    setSelected(initialSelected);
    setScope("current");
    setError(null);
    setEditing(null);
    setEditValue("");
    setOpen(true);
  };

  const toggle = (pattern: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pattern)) next.delete(pattern);
      else next.add(pattern);
      return next;
    });
  };

  const startEdit = (pattern: string) => {
    setEditing(pattern);
    setEditValue(pattern);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  const saveEdit = (orig: string) => {
    const next = editValue;
    if (!next || next === orig) {
      cancelEdit();
      return;
    }
    // Recount the new pattern in the current chapter so the row reflects the
    // edited string. Counts may legitimately be 0 if the user typed a pattern
    // that exists only in other chapters — still allow it.
    const count = chapterContent.split(next).length - 1;
    const idx = chapterContent.indexOf(next);
    let context = "";
    if (idx >= 0) {
      const ctxStart = Math.max(0, idx - 8);
      const ctxEnd = Math.min(chapterContent.length, idx + next.length + 8);
      context = chapterContent.slice(ctxStart, ctxEnd).replace(/\s+/g, " ");
    }
    setCandidates((prev) => {
      const collision = prev.some(
        (c) => c.pattern === next && c.pattern !== orig
      );
      if (collision) return prev.filter((c) => c.pattern !== orig);
      return prev.map((c) =>
        c.pattern === orig ? { pattern: next, count, context } : c
      );
    });
    setSelected((prev) => {
      const updated = new Set(prev);
      updated.delete(orig);
      updated.add(next);
      return updated;
    });
    cancelEdit();
  };

  const handleApply = async () => {
    if (selected.size === 0) return;
    const patterns = [...selected];
    setOpen(false);
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${bookId}/clean-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patterns, scope, chapterId }),
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          alert(
            `清除失败: 服务器返回非 JSON (${res.status}): ${raw.slice(0, 200) || "<空>"}`
          );
          return;
        }
      }
      if (!res.ok) {
        alert(`清除失败: ${data.error || `(${res.status})`}`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`清除失败: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={handleOpen}
          disabled={applying}
          className="rounded-lg border px-4 py-2 text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          {applying ? "清除中..." : "识别文字水印"}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !applying && setOpen(false)}
        >
          <div
            className="mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg p-6 shadow-xl"
            style={{
              backgroundColor: "var(--card-bg)",
              color: "var(--foreground)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-bold">识别文字水印</h2>

            {candidates.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  未在本章中识别到重复出现的疑似水印。
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    关闭
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
                  以下片段在本章重复出现,勾选后将从
                  {scope === "current" ? "当前章节" : "全部章节"}
                  中删除:
                </p>

                <div
                  className="mb-3 inline-flex overflow-hidden rounded border text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  {(["current", "all"] as Scope[]).map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      className="px-3 py-1 transition-colors"
                      style={
                        scope === s
                          ? {
                              backgroundColor: "var(--accent)",
                              color: "white",
                            }
                          : {
                              color: "var(--muted)",
                              borderLeft:
                                i > 0 ? "1px solid var(--border)" : undefined,
                            }
                      }
                    >
                      {s === "current" ? "当前章节" : "全部章节"}
                    </button>
                  ))}
                </div>
                <ul
                  className="mb-4 max-h-72 space-y-1 overflow-y-auto rounded border p-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  {candidates.map((c) => (
                    <li key={c.pattern}>
                      {editing === c.pattern ? (
                        <div className="flex items-center gap-2 p-1">
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(c.pattern);
                              else if (e.key === "Escape") cancelEdit();
                            }}
                            className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs outline-none"
                            style={{
                              borderColor: "var(--border)",
                              backgroundColor: "var(--background)",
                              color: "var(--foreground)",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(c.pattern)}
                            className="shrink-0 px-2 py-1 text-xs"
                            style={{ color: "var(--accent)" }}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="shrink-0 px-2 py-1 text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1">
                          <label className="flex flex-1 cursor-pointer items-start gap-2 rounded p-1 text-sm hover:bg-[var(--background)]">
                            <input
                              type="checkbox"
                              checked={selected.has(c.pattern)}
                              onChange={() => toggle(c.pattern)}
                              className="mt-1 shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block break-all font-mono text-xs">
                                {c.pattern}
                              </span>
                              <span
                                className="block text-xs"
                                style={{ color: "var(--muted)" }}
                              >
                                出现 {c.count} 次 · …{c.context}…
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => startEdit(c.pattern)}
                            className="shrink-0 px-2 py-1 text-xs hover:underline"
                            style={{ color: "var(--accent)" }}
                          >
                            编辑
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {error && (
                  <p className="mb-2 text-xs" style={{ color: "#dc2626" }}>
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={applying}
                    className="rounded-lg border px-4 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={applying || selected.size === 0}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {applying
                      ? "清除中..."
                      : `确认清除 (${selected.size})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
