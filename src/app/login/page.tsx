"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("密码错误");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border p-6"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
      >
        <h1 className="text-xl font-bold text-center">登录</h1>
        <input
          type="text"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
          autoFocus
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-3 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
