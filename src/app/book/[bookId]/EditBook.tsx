"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EditBookProps {
  bookId: string;
  meta: {
    title: string;
    author: string;
    genre: string;
    description: string | null;
    private: boolean;
  };
}

export default function EditBook({ bookId, meta }: EditBookProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(meta.title);
  const [author, setAuthor] = useState(meta.author);
  const [genre, setGenre] = useState(meta.genre);
  const [description, setDescription] = useState(meta.description || "");
  const [isPrivate, setIsPrivate] = useState(meta.private);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const handleOpen = () => {
    setTitle(meta.title);
    setAuthor(meta.author);
    setGenre(meta.genre);
    setDescription(meta.description || "");
    setIsPrivate(meta.private);
    setCoverFile(null);
    setCoverPreview(null);
    setConfirmDelete(false);
    setOpen(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/book/${bookId}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/book/${bookId}/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, genre, description, private: isPrivate }),
      });

      if (coverFile) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.readAsDataURL(coverFile);
        });
        await fetch(`/api/cover/${bookId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: base64, mime: coverFile.type }),
        });
      }

      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-block rounded-lg border px-6 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      >
        修改
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-lg p-6 shadow-xl"
            style={{ backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">修改书籍信息</h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--muted)" }}>
                  书名
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--muted)" }}>
                  作者
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--muted)" }}>
                  分类
                </label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--muted)" }}>
                  简介
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                  />
                  私密 (从书架隐藏)
                </label>
              </div>

              <div>
                <label className="mb-1 block text-sm" style={{ color: "var(--muted)" }}>
                  封面图片
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="text-sm"
                />
                {coverPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverPreview}
                    alt="Preview"
                    className="mt-2 h-32 rounded object-cover"
                  />
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "#ef4444" }}>
                      确认删除？
                    </span>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: "#ef4444" }}
                    >
                      {deleting ? "删除中..." : "确认"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg border px-3 py-1.5 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-lg px-3 py-1.5 text-sm"
                    style={{ color: "#ef4444" }}
                  >
                    删除书籍
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
