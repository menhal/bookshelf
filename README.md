# Bookshelf · 个人书架

一个基于 Next.js 16 + Turso + Upstash Redis 构建的个人小说阅读应用，部署在 Vercel 上即开即用。

---

## 功能介绍

### 阅读体验

- **书架页**：卡片式封面墙，支持「最近阅读」自动置顶
- **目录与继续阅读**：进入书籍详情自动跳转到上次阅读章节
- **章节阅读器**：自适应暗色 / 亮色主题，章节内容支持清洗与水印检测
- **进度记录**：阅读位置自动写入 Redis，跨设备同步

### 私密 & 安全

- **密码登录**：基于 `AUTH_PASSWORD` 的 SHA-256 Cookie 鉴权（Middleware 全站拦截）
- **私密书籍**：可标记书籍为「私密」，默认不出现在书架上
- **WebAuthn 指纹解锁**：切换「显示私密」时通过浏览器指纹 / Face ID 二次验证

### 性能优化

- **ISR**：首页与书籍页 60 秒增量静态再生
- **多层缓存**：Turso → Redis（7 天 TTL）→ Next.js ISR
- **章节预热**：进入书籍页时通过 `after()` 异步预热「继续阅读」目标章节
- **瞬时错误重试**：自动重试 Turso 的 socket 类错误（`UND_ERR_SOCKET` 等）

---

## 项目截图

> 以下为占位图，可替换为实际截图。建议放在 `docs/screenshots/` 目录下。

| 书架 | 书籍详情 |
| --- | --- |
| ![书架](https://placehold.co/600x400/0a0a0a/ededed?text=Bookshelf) | ![详情](https://placehold.co/600x400/0a0a0a/ededed?text=Book+Detail) |

| 章节阅读 | 登录 |
| --- | --- |
| ![阅读](https://placehold.co/600x400/0a0a0a/ededed?text=Chapter+Reader) | ![登录](https://placehold.co/600x400/0a0a0a/ededed?text=Login) |

---

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | Next.js 16（App Router · Turbopack） |
| UI | React 19 + Tailwind CSS 4 |
| 数据库 | Turso（libSQL） |
| 缓存 / KV | Upstash Redis |
| 鉴权 | Middleware + Cookie + WebAuthn |
| 运行时 | Vercel Fluid Compute（Node.js 24） |

---

## 本地开发

```bash
pnpm install
cp .env.example .env.local   # 填入下面 4 组环境变量
pnpm dev
```

访问 <http://localhost:3000>。

---

## 部署到 Vercel

### 1. 准备外部资源

需要两个免费服务，注册后各拿到一组连接信息：

| 服务 | 用途 | 注册地址 |
| --- | --- | --- |
| **Turso** | 书籍 / 章节 / 封面存储 | <https://turso.tech> |
| **Upstash Redis** | 阅读进度 + 缓存 | <https://upstash.com> 或 Vercel Marketplace |

> 💡 推荐直接在 [Vercel Marketplace](https://vercel.com/marketplace) 安装 **Upstash for Redis** 集成，Vercel 会自动把 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 注入到项目环境变量。

### 2. 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_NAME/bookshelf)

部署时填入以下环境变量（参见 `.env.example`）：

| 变量 | 说明 |
| --- | --- |
| `AUTH_PASSWORD` | 站点登录密码（自己设置一个强密码） |
| `TURSO_DATABASE_URL` | Turso 数据库 URL，形如 `libsql://xxx.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso 访问令牌 |
| `KV_REST_API_URL` | Upstash Redis REST URL（装了 Marketplace 集成会自动注入） |
| `KV_REST_API_TOKEN` | Upstash Redis REST Token（同上） |

### 3. 初始化 Turso 表结构

在 Turso CLI 或 Web Shell 中执行：

```sql
CREATE TABLE meta (
  book_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT,
  PRIMARY KEY (book_id, key)
);

CREATE TABLE chapters (
  book_id TEXT NOT NULL,
  id      INTEGER NOT NULL,
  title   TEXT,
  content TEXT,
  PRIMARY KEY (book_id, id)
);

CREATE TABLE cover (
  book_id TEXT PRIMARY KEY,
  data    BLOB,
  mime    TEXT
);
```

### 4. 完成

打开 Vercel 分配的域名，输入 `AUTH_PASSWORD` 登录即可使用。

---

## 目录结构

```
src/
├── middleware.ts           # 全站密码鉴权
├── app/
│   ├── page.tsx            # 书架首页（ISR 60s）
│   ├── Bookshelf.tsx       # 客户端：私密切换 + WebAuthn
│   ├── login/              # 登录页
│   ├── book/[bookId]/      # 书籍详情 + 编辑
│   │   └── [chapterId]/    # 章节阅读
│   └── api/                # auth · book · cache · cover · progress
└── lib/
    ├── books.ts            # Turso + Redis 数据层
    └── comments.ts
```

---

## License

MIT
