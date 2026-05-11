import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function makeToken() {
  const password = process.env.AUTH_PASSWORD ?? "";
  const data = new TextEncoder().encode(`book-spider:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行登录页和登录接口
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;
  const expected = await makeToken();

  if (token !== expected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
