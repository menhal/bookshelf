"use client";

import { useEffect } from "react";

export default function RecordProgress({
  bookId,
  chapterId,
}: {
  bookId: string;
  chapterId: number;
}) {
  useEffect(() => {
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, chapterId }),
    });
  }, [bookId, chapterId]);

  return null;
}
