import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCover, getBookCoverOverride, setBookCoverOverride } from "@/lib/books";

// Covers rarely change — let the browser keep them for a year and avoid
// re-downloading on every page navigation. ETag is the safety net so a
// changed cover (rare PUT) is still detected on the next conditional GET.
const COVER_CACHE_CONTROL = "public, max-age=31536000, must-revalidate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;

  let buffer: Buffer;
  let mime: string;

  const override = await getBookCoverOverride(bookId);
  if (override) {
    buffer = Buffer.from(override.data, "base64");
    mime = override.mime;
  } else {
    const cover = await getCover(bookId);
    if (!cover) return new NextResponse("No cover", { status: 404 });
    buffer = cover.data;
    mime = cover.mime;
  }

  const etag = `"${createHash("md5").update(buffer).digest("hex")}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": COVER_CACHE_CONTROL },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": COVER_CACHE_CONTROL,
      ETag: etag,
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const { data, mime } = await request.json();
  if (!data || !mime) {
    return NextResponse.json({ error: "missing data or mime" }, { status: 400 });
  }
  await setBookCoverOverride(bookId, data, mime);
  return NextResponse.json({ ok: true });
}
