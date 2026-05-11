import { NextResponse } from "next/server";
import {
  getBookMetaOverrides,
  setBookMetaOverrides,
  type BookMetaOverrides,
} from "@/lib/books";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const body: BookMetaOverrides = await request.json();

  const existing = (await getBookMetaOverrides(bookId)) || {};
  const merged: BookMetaOverrides = { ...existing };
  if (body.title !== undefined) merged.title = body.title;
  if (body.author !== undefined) merged.author = body.author;
  if (body.genre !== undefined) merged.genre = body.genre;
  if (body.description !== undefined) merged.description = body.description;
  if (body.private !== undefined) merged.private = body.private;

  await setBookMetaOverrides(bookId, merged);
  return NextResponse.json({ ok: true });
}
