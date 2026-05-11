"use client";

import { useState } from "react";
import Link from "next/link";
import type { BookInfo } from "@/lib/books";

interface BookshelfProps {
  books: BookInfo[];
}

const CREDENTIAL_KEY = "biometric_credential_id";

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function verifyBiometric(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    alert("当前浏览器不支持 WebAuthn 指纹验证");
    return false;
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const storedId = localStorage.getItem(CREDENTIAL_KEY);

  try {
    if (!storedId) {
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Book Spider", id: window.location.hostname },
          user: { id: userId, name: "bookshelf", displayName: "Bookshelf" },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) return false;
      localStorage.setItem(CREDENTIAL_KEY, bufToB64(cred.rawId));
      return true;
    }

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: b64ToBuf(storedId) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (e) {
    console.error("Biometric verification failed:", e);
    return false;
  }
}

export default function Bookshelf({ books }: BookshelfProps) {
  const [showPrivate, setShowPrivate] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleTogglePrivate = async (checked: boolean) => {
    if (!checked) {
      setShowPrivate(false);
      return;
    }
    setVerifying(true);
    try {
      const ok = await verifyBiometric();
      if (ok) setShowPrivate(true);
    } finally {
      setVerifying(false);
    }
  };

  const visible = showPrivate
    ? books.filter((b) => b.meta.private)
    : books.filter((b) => !b.meta.private);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center gap-4">
        <h1 className="text-3xl font-bold">书架</h1>
        <label
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--muted)" }}
        >
          <input
            type="checkbox"
            checked={showPrivate}
            disabled={verifying}
            onChange={(e) => handleTogglePrivate(e.target.checked)}
          />
          {verifying ? "验证中…" : "显示私密"}
        </label>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {visible.map((book) => (
          <Link
            key={book.meta.bookId}
            href={`/book/${book.meta.bookId}`}
            className="group flex gap-4 rounded-lg border p-4 transition-shadow hover:shadow-lg"
            style={{
              backgroundColor: "var(--card-bg)",
              borderColor: "var(--border)",
            }}
          >
            <div className="relative flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/cover/${book.meta.bookId}`}
                alt={book.meta.title}
                className="h-48 w-36 rounded-lg object-cover shadow"
              />
              {book.meta.private && (
                <div
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="私密"
                  title="私密"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 className="text-lg font-semibold group-hover:text-[var(--accent)] line-clamp-2">
                {book.meta.title}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                {book.meta.author}
              </p>
              <p
                className="mt-2 line-clamp-3 text-sm leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                {book.meta.description}
              </p>
              <div
                className="mt-auto flex items-center gap-3 pt-3 text-xs"
                style={{ color: "var(--muted)" }}
              >
                <span>{book.meta.genre}</span>
                <span>·</span>
                <span>{book.meta.totalChapters} 章</span>
                {book.meta.status && (
                  <>
                    <span>·</span>
                    <span>{book.meta.status}</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
