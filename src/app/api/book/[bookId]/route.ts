import { NextResponse } from "next/server";
import { deleteBook } from "@/lib/books";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  await deleteBook(bookId);
  return NextResponse.json({ ok: true });
}
