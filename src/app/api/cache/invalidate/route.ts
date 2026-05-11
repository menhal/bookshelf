import { NextRequest, NextResponse } from "next/server";
import { invalidateBookCache, invalidateAllCache } from "@/lib/books";

export async function POST(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("bookId");
  if (bookId) {
    await invalidateBookCache(bookId);
    return NextResponse.json({ ok: true, scope: "book", bookId });
  }
  const result = await invalidateAllCache();
  return NextResponse.json({ ok: true, scope: "all", ...result });
}
