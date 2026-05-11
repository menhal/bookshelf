import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getChapterComments,
  addParagraphComment,
  deleteParagraphComment,
} from "@/lib/comments";

const MAX_TEXT_LENGTH = 2000;

async function parseParams(
  params: Promise<{ bookId: string; chapterId: string }>
) {
  const { bookId, chapterId: chapterIdStr } = await params;
  const chapterId = parseInt(chapterIdStr, 10);
  if (!bookId || isNaN(chapterId)) return null;
  return { bookId, chapterId };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  const parsed = await parseParams(params);
  if (!parsed) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const comments = await getChapterComments(parsed.bookId, parsed.chapterId);
  return NextResponse.json({ comments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  const parsed = await parseParams(params);
  if (!parsed) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const { paraIndex, text } = await req.json();
  if (typeof paraIndex !== "number" || paraIndex < 0) {
    return NextResponse.json({ error: "invalid paraIndex" }, { status: 400 });
  }
  if (typeof text !== "string") {
    return NextResponse.json({ error: "invalid text" }, { status: 400 });
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "empty text" }, { status: 400 });
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "text too long" }, { status: 400 });
  }
  const comment = await addParagraphComment(
    parsed.bookId,
    parsed.chapterId,
    paraIndex,
    trimmed
  );
  revalidatePath(`/book/${parsed.bookId}/${parsed.chapterId}`);
  return NextResponse.json({ comment });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> }
) {
  const parsed = await parseParams(params);
  if (!parsed) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const { paraIndex, id } = await req.json();
  if (typeof paraIndex !== "number" || typeof id !== "string" || !id) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  await deleteParagraphComment(parsed.bookId, parsed.chapterId, paraIndex, id);
  revalidatePath(`/book/${parsed.bookId}/${parsed.chapterId}`);
  return NextResponse.json({ ok: true });
}
