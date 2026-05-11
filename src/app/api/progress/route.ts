import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "missing bookId" }, { status: 400 });
  }
  const chapterId = await redis.get<number>(`progress:${bookId}`);
  return NextResponse.json({ chapterId });
}

export async function POST(req: NextRequest) {
  const { bookId, chapterId } = await req.json();
  if (!bookId || typeof chapterId !== "number") {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  await redis.set(`progress:${bookId}`, chapterId);
  await redis.set(`lastRead:${bookId}`, Date.now());
  return NextResponse.json({ ok: true });
}
