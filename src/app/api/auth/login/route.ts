import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function makeToken() {
  const password = process.env.AUTH_PASSWORD ?? "";
  const data = new TextEncoder().encode(`book-spider:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const { password } = await request.json();

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const token = await makeToken();
  (await cookies()).set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true });
}
