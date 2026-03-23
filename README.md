# strapi-plugin-comments

[![npm version](https://img.shields.io/npm/v/strapi-plugin-comments.svg?style=flat-square)](https://www.npmjs.com/package/strapi-plugin-comments)
[![license](https://img.shields.io/npm/l/strapi-plugin-comments.svg?style=flat-square)](https://github.com/isomorph-agency/strapi-plugin-comments/blob/main/LICENSE)
[![tests](https://img.shields.io/github/actions/workflow/status/isomorph-agency/strapi-plugin-comments/ci.yml?label=tests&style=flat-square)](https://github.com/isomorph-agency/strapi-plugin-comments/actions)
[![strapi v5](https://img.shields.io/badge/strapi-v5-4945FF?style=flat-square)](https://strapi.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)](https://www.typescriptlang.org)

**The most complete comments system for Strapi V5.**

Threaded comments, built-in moderation panel, anti-profanity filter, Google reCAPTCHA V3, rate limiting, community reports, auto-avatar generation — production-ready out of the box.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Admin Panel](#admin-panel)
- [Frontend Integration](#frontend-integration)
- [Security](#security)
- [Freemium Model](#freemium-model)
- [Contributing](#contributing)
- [License](#license)
- [Credits](#credits)

---

## Features

- **Threaded comments** — Reply system with one level of depth (N-1), preventing infinite nesting while enabling natural conversation
- **Dedicated admin panel** — Full moderation interface built into the Strapi sidebar: comment list, filters, approve/block actions, report management and live stats
- **Manual moderation workflow** — Optional pre-moderation: every comment stays hidden until an admin approves it
- **Community reporting system** — Users can flag comments; configurable auto-blocking threshold when a comment accumulates too many reports
- **Anti-profanity filter** — Powered by `leo-profanity`, supports French and English dictionaries, configurable action: `reject` (400) or `flag` (send to moderation queue)
- **Google reCAPTCHA V3** — Server-side token verification with configurable score threshold, fail-closed by default
- **Rate limiting** — Sliding window per IP, injectable Redis store for multi-instance deployments
- **XSS sanitisation** — All user inputs sanitised server-side before processing, powered by `xss`
- **Auto-avatar generation** — Deterministic pastel colour assigned to each commenter from their first name, WCAG AA compliant (12-colour palette)
- **Automatic subscriber registration** — Commenters are silently registered as a configurable "Subscriber" user category
- **Admin replies (WYSIWYG)** — Admins can reply with rich-text content, displayed with a distinct "Team" badge on the frontend
- **Comment pinning** — Pin featured comments to the top of threads
- **Like / Unlike** — Lightweight engagement counter on comments
- **Author blocking** — Block a user at the account level: all their future comments are immediately rejected
- **Multi-collection support** — Attach comments to any Strapi collection, not just articles
- **Framework-agnostic** — Works with React, Vue, Angular, Svelte, Vanilla JS, Next.js, Nuxt, Astro or any HTTP client
- **TypeScript strict** — 100% typed, no `any`, full IntelliSense support
- **OWASP 2025 compliant** — Fail-closed architecture, Zod validation on every input, no secrets exposed to the client

---

## Quick Start

### Step 1 — Install the plugin

```bash
npm install strapi-plugin-comments
```

### Step 2 — Enable the plugin

In your Strapi project, create or update `config/plugins.ts`:

```ts
export default {
  comments: {
    enabled: true,
    config: {
      targetCollection: 'api::article.article',
    },
  },
};
```

### Step 3 — Add the reCAPTCHA secret key

In your `.env` file:

```env
RECAPTCHA_SECRET_KEY=your_google_recaptcha_v3_secret_key
```

Rebuild and restart Strapi. The plugin registers its content-types, creates the "Subscriber" user category and is ready to serve requests on `/api/comments/*`.

> **Disable reCAPTCHA for local development:** set `recaptcha.enabled: false` in your plugin config when running locally without a valid key.

---

## Configuration

All options are set in `config/plugins.ts` under the `comments` key. Every option has a sensible default and can be overridden.

```ts
// config/plugins.ts
export default {
  comments: {
    enabled: true,
    config: {
      // Target Strapi collection (UID format)
      targetCollection: 'api::article.article',

      // Moderation
      requireApproval: false,   // true = comments are hidden until admin approves
      allowDelete: false,       // true = authors can delete their own comments

      // Anti-profanity filter
      profanityFilter: {
        enabled: true,
        languages: ['fr', 'en'],  // Dictionaries loaded at bootstrap
        failOpen: true,           // true = filter error does NOT block submission
        action: 'reject',         // 'reject' (400) | 'flag' (send to moderation)
      },

      // Google reCAPTCHA V3
      recaptcha: {
        enabled: true,
        scoreThreshold: 0.5,    // Minimum score (0.0–1.0)
        failClosed: true,       // true = Google API error blocks submission
      },

      // Rate limiting
      rateLimit: {
        enabled: true,
        windowMs: 900_000,      // 15-minute sliding window
        max: 5,                 // Max submissions per window per IP
        // store: redisStore,   // Injectable store for multi-instance deployments
        // whitelist: ['1.2.3.4'],
      },

      // Auto-avatar
      avatar: {
        enabled: true,
        palette: [              // 12 WCAG AA-compliant pastel colours
          '#B5EAD7', '#C7CEEA', '#FFDAC1', '#FFB7B2',
          '#FF9AA2', '#E2F0CB', '#B5D5F5', '#FFF1BA',
          '#D4B8E0', '#B8E0D4', '#FAD4C0', '#C8E6C9',
        ],
      },

      // Automatic subscriber registration
      subscriber: {
        enabled: true,
        categoryName: 'Subscriber',
        categorySlug: 'subscriber',
      },

      // Community report auto-blocking
      reportThreshold: {
        enabled: true,
        count: 3,               // Block comment automatically after 3 pending reports
      },
    },
  },
};
```

### Custom rate-limit store (Redis — multi-instance)

Implement the `RateLimitStore` interface to replace the in-memory store:

```ts
import type { RateLimitStore } from 'strapi-plugin-comments/server';

const redisStore: RateLimitStore = {
  async increment(key, windowMs) {
    // your Redis INCR + EXPIRE logic
  },
  async reset(key) {
    // your Redis DEL logic
  },
};

export default {
  comments: {
    enabled: true,
    config: {
      rateLimit: {
        enabled: true,
        store: redisStore,
      },
    },
  },
};
```

### Custom profanity filter

```ts
import type { ProfanityFilterService } from 'strapi-plugin-comments/server';

const myFilter: ProfanityFilterService = {
  check(text: string): boolean {
    return /badword/i.test(text);
  },
};

export default {
  comments: {
    enabled: true,
    config: {
      profanityFilter: {
        enabled: true,
        customFilter: myFilter,
      },
    },
  },
};
```

---

## API Reference

All endpoints are prefixed with `/api/comments`.

### Content API (public)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | No | List approved, non-blocked comments for a document. Requires `relatedDocumentId` query param. |
| `GET` | `/:id` | No | Get a single comment (approved and not blocked). |
| `POST` | `/` | No | Submit a new comment. Runs sanitise → reCAPTCHA → rate-limit. |
| `POST` | `/:id/reply` | No | Reply to an existing comment (N-1 depth only). |
| `POST` | `/:id/like` | No | Increment the like counter. |
| `POST` | `/:id/unlike` | No | Decrement the like counter (minimum 0). |
| `DELETE` | `/:id` | Yes | Delete own comment (requires `allowDelete: true`). |
| `POST` | `/reports` | No | Submit a community report on a comment. |

#### GET `/api/comments` — Query params

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `relatedDocumentId` | `string` | Yes | The `documentId` of the target entity (e.g. article). |
| `relatedCollection` | `string` | No | Override the default target collection UID. |

#### POST `/api/comments` — Request body

```json
{
  "firstname": "John",
  "email": "john@example.com",
  "content": "Great article!",
  "relatedDocumentId": "abc123xyz",
  "relatedCollection": "api::article.article",
  "recaptchaToken": "03AGdBq25..."
}
```

#### POST `/api/comments` — Response

```json
{
  "data": {
    "id": 42,
    "documentId": "k8zqp1ab",
    "firstname": "John",
    "content": "Great article!",
    "approved": true,
    "blocked": false,
    "avatarColor": "#B5EAD7",
    "likesCount": 0,
    "isAdminReply": false,
    "createdAt": "2026-03-23T10:00:00.000Z"
  }
}
```

#### POST `/api/comments/reports` — Request body

```json
{
  "commentId": 42,
  "reason": "spam",
  "description": "This comment is advertising an unrelated product.",
  "reporterEmail": "user@example.com"
}
```

Accepted `reason` values: `offensive`, `spam`, `harassment`, `misinformation`, `other`.

---

### Admin API (protected — Strapi admin token required)

All admin endpoints are protected by the `is-admin` policy. They are prefixed with `/comments/admin`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/stats` | Aggregated dashboard stats (total, pending, blocked, reports). |
| `GET` | `/config` | Read the current plugin configuration. |
| `GET` | `/comments` | Paginated list of all comments with filters. |
| `GET` | `/comments/:id` | Full comment detail with author, parent and children. |
| `POST` | `/comments/:id/reply` | Create an admin reply with WYSIWYG content. |
| `PUT` | `/comments/:id/approve` | Approve a pending comment. |
| `PUT` | `/comments/:id/block` | Block a comment (hides it from the frontend). |
| `PUT` | `/comments/:id/unblock` | Unblock a comment and its author. |
| `PUT` | `/comments/:id/block-author` | Block the comment author (all future comments rejected). |
| `PUT` | `/comments/:id/pin` | Toggle pin on a comment. |
| `DELETE` | `/comments/:id` | Permanently delete a comment and its replies (cascade). |
| `GET` | `/reports` | Paginated list of reports with status filter. |
| `PUT` | `/reports/:id/review` | Mark a report as reviewed. |
| `PUT` | `/reports/:id/dismiss` | Dismiss a report (mark as unfounded). |
| `GET` | `/settings` | Read persisted plugin settings. |
| `PUT` | `/settings` | Update persisted plugin settings. |

---

## Admin Panel

The plugin registers a dedicated section in the Strapi sidebar under the **Comments** icon.

### Dashboard

![Admin panel — dashboard](./admin/screenshot-placeholder-dashboard.png)
*[TODO: replace with actual screenshot]*

The dashboard displays live aggregated stats:
- Total published comments
- Pending approval count (badge indicator in the sidebar)
- Blocked comments
- Open reports awaiting review

### Comment moderation list

![Admin panel — moderation list](./admin/screenshot-placeholder-list.png)
*[TODO: replace with actual screenshot]*

Filter and sort all comments by status (pending / approved / blocked), by collection or by date. Bulk-approve or bulk-block from the list view.

### Report management

Review community reports, consult the reported comment in context, then mark the report as reviewed or dismiss it. When the report threshold is reached, the comment is automatically blocked and appears in the blocked queue for final review.

### Admin reply

Respond to any comment directly from the admin panel using a WYSIWYG editor. Admin replies are always published immediately (bypass moderation) and displayed with a distinct **Team** badge on the frontend.

---

## Frontend Integration

The plugin is framework-agnostic. Any HTTP client that can reach the Strapi API can integrate it.

### React / Next.js example

```tsx
import { useState, useEffect } from 'react';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL;

type Comment = {
  id: number;
  firstname: string;
  content: string;
  contentHtml: string | null;
  avatarColor: string;
  isAdminReply: boolean;
  likesCount: number;
  createdAt: string;
  children: Comment[];
};

async function fetchComments(documentId: string): Promise<Comment[]> {
  const url = new URL(`${STRAPI_URL}/api/comments`);
  url.searchParams.set('relatedDocumentId', documentId);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch comments');

  const json = await res.json();
  return json.data;
}

async function submitComment(payload: {
  firstname: string;
  email: string;
  content: string;
  relatedDocumentId: string;
  recaptchaToken: string;
}) {
  const res = await fetch(`${STRAPI_URL}/api/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message ?? 'Failed to submit comment');
  }

  return res.json();
}

export function CommentList({ documentId }: { documentId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    fetchComments(documentId).then(setComments).catch(console.error);
  }, [documentId]);

  return (
    <ul>
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </ul>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <li>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: '50%',
          backgroundColor: comment.avatarColor,
          color: '#333',
          fontWeight: 600,
          fontSize: 16,
        }}
        aria-hidden="true"
      >
        {comment.firstname.charAt(0).toUpperCase()}
      </span>

      <strong>{comment.firstname}</strong>
      {comment.isAdminReply && <span className="badge">Team</span>}

      {/*
        Admin replies may contain HTML produced by the WYSIWYG editor.
        Always sanitise server-produced HTML on the client with DOMPurify
        before rendering, as a defence-in-depth measure.

        import DOMPurify from 'dompurify';
        const safeHtml = DOMPurify.sanitize(comment.contentHtml);
      */}
      <p>{comment.content}</p>

      <small>{new Date(comment.createdAt).toLocaleDateString()}</small>

      {comment.children.length > 0 && (
        <ul>
          {comment.children.map((reply) => (
            <CommentItem key={reply.id} comment={reply} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

### Submitting a report

```ts
await fetch(`${STRAPI_URL}/api/comments/reports`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    commentId: 42,
    reason: 'spam',
    reporterEmail: 'user@example.com',
  }),
});
```

---

## Security

Security is built into every layer of the plugin, not bolted on as an afterthought.

| Layer | Mechanism |
|-------|-----------|
| **Input validation** | Zod schemas on every controller — unknown fields are stripped, malformed requests return 400 |
| **XSS sanitisation** | `xss` library sanitises `firstname`, `email` and `content` server-side before any processing |
| **Profanity filter** | `leo-profanity` (FR + EN) — configurable: reject or send to moderation queue |
| **Bot protection** | Google reCAPTCHA V3 — server-side verification, score threshold configurable |
| **Rate limiting** | Sliding window per IP — injectable Redis store for multi-instance deployments |
| **Admin isolation** | All admin routes protected by `is-admin` policy — zero public exposure |
| **Author blocking** | Blocked users are rejected at the service layer before any DB write |
| **No secrets exposed** | `RECAPTCHA_SECRET_KEY` is server-side only — never serialised in API responses |
| **OWASP 2025** | Fail-closed architecture: reCAPTCHA errors block submission by default |

---

## Freemium Model

`strapi-plugin-comments` follows a freemium model. The Community version is fully functional for most use cases.

| Feature | Community (free) | Pro | Enterprise |
|---------|:---:|:---:|:---:|
| Threaded comments (N-1) | Yes | Yes | Yes |
| Admin moderation panel | Yes | Yes | Yes |
| Anti-profanity filter (FR + EN) | Yes | Yes | Yes |
| Google reCAPTCHA V3 | Yes | Yes | Yes |
| Rate limiting (in-memory) | Yes | Yes | Yes |
| Community reports | Yes | Yes | Yes |
| Auto-avatar generation | Yes | Yes | Yes |
| Like / Unlike | Yes | Yes | Yes |
| Admin replies (WYSIWYG) | Yes | Yes | Yes |
| Comment pinning | Yes | Yes | Yes |
| Redis store for rate limiting | No | Yes | Yes |
| Custom profanity dictionaries | No | Yes | Yes |
| Email notifications on new comment | No | Yes | Yes |
| Webhook on moderation events | No | Yes | Yes |
| Custom avatar upload | No | Yes | Yes |
| Priority support (SLA 24h) | No | No | Yes |
| White-label admin panel | No | No | Yes |
| Custom SLA & dedicated onboarding | No | No | Yes |

> Pro and Enterprise licences are available at [isomorph.fr](https://isomorph.fr). Contact: contact@isomorph.fr

---

## Contributing

Contributions are welcome. Please follow the steps below.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes — TypeScript strict, no `any`, comments in English
4. Run the test suite: `npm test`
5. Run the linter: `npm run lint`
6. Commit using conventional commits: `feat: add your feature`
7. Open a pull request against `develop`

### Development setup

```bash
# Clone the repository
git clone https://github.com/isomorph-agency/strapi-plugin-comments.git
cd strapi-plugin-comments

# Install dependencies
npm install

# Watch TypeScript compilation
npm run watch

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test your changes against a real Strapi V5 project

```bash
# In the plugin directory
npm run build

# In your Strapi project, install the local version
npm install /path/to/strapi-plugin-comments
```

### Code standards

- TypeScript strict mode — no `any`, no type assertions without justification
- All functions must have explicit return types
- Controllers contain no business logic — validation + service call + HTTP format only
- Tests follow the AAA pattern (Arrange / Act / Assert)
- One test per logical concept

---

## License

MIT — see [LICENSE](./LICENSE).

You are free to use, modify and distribute this plugin in commercial and non-commercial projects.

---

## Credits

Built and maintained by [ISOMORPH](https://isomorph.fr) — Web, SaaS, Mobile & AI agency based in Paris and Toulon, France.

- GitHub: [github.com/isomorph-agency](https://github.com/isomorph-agency)
- npm: [npmjs.com/~isomorph-agency](https://www.npmjs.com/~isomorph-agency)
- Contact: contact@isomorph.fr

---

*If this plugin saves you time, consider giving it a star on GitHub. It helps visibility and motivates continued maintenance.*
