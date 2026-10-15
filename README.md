# ResearchGram

An academic network for students, faculty and alumni: publish research notes and
papers, decide who may read the full text, find collaborators and mentors, run
project workspaces, message each other (text, files and voice messages), and
search 250 million published works with a research assistant.

Live: <https://research-gram.vercel.app>

## Stack

- [Next.js 16](https://nextjs.org) (App Router) and React 19, TypeScript, Tailwind CSS 4
- [Supabase](https://supabase.com): Postgres with Row Level Security on every table,
  Auth (sessions in cookies through `@supabase/ssr`), Storage and Realtime
- [OpenAlex](https://openalex.org) for published literature; Google Gemini (or
  Anthropic Claude) for the research assistant
- Hosted on Vercel

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open <http://localhost:3000>. `.env.example` lists every setting; only the two
`NEXT_PUBLIC_SUPABASE_*` values are required to start.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no output |
| `npm run test:db` | Database tests: every migration applied to an in-memory Postgres (PGlite), then the rules checked as each kind of user |
| `npm run test:e2e` | Browser tests (Playwright) against a production build with a fake Supabase |
| `npm test` | Both |
| `npm run check:apis` | Checks the OpenAlex and Semantic Scholar settings |
| `npm run check:ai` | Lists the Gemini models your key can use and runs one test call |

The browser tests need Chromium once: `npx playwright install chromium`. They build
the app into `.next-e2e/` with test settings, so a normal build is not touched.

GitHub Actions runs lint, typecheck, build, the database tests, the browser tests and
a dependency audit on every push to `main` and on pull requests.

## Database

The schema lives in `supabase/migrations/`, applied in file-name order with the
Supabase SQL editor. Each file starts with a comment saying what it changes and,
where it matters, whether to run it before or after deploying the app code. See
`supabase/README.md`.

Security model:

- The browser only ever holds the public (anon/publishable) key, so every rule is
  enforced in the database: Row Level Security policies, column privileges and
  `SECURITY DEFINER` functions for the few reads that need them (for example, the
  full text of an abstract-only paper is only returned to its owner and to readers
  whose access request was approved).
- Steps that belong together (a workspace and its owner and group chat, an answered
  request and the chat or connection it opens, a post and its files) are single
  database functions, so they succeed or fail together.
- The session is kept in cookies. `proxy.ts` checks it on the server before any
  private page is served and sends signed-out visitors to the login page.
- Every page is sent with a Content-Security-Policy and the other security headers
  (`next.config.ts`).
- The service-role key is only used by the scripts in `scripts/`, never by the app.

## Accounts, moderation and data

- **Admin console** (`/admin`): the reported-posts queue (dismiss or remove, the
  author is told why) and the audit log. Admins are added in SQL; see
  `supabase/README.md`.
- **Audit log**: admin actions, account deletions and data downloads, ORCID
  verifications, paper-access decisions and workspace membership changes.
- **Download my data** and **Delete my account** are on the profile page.
- **Verify with ORCID** proves an ORCID iD is yours before its publication numbers
  are shown (optional; needs an ORCID app, see `supabase/README.md`).
- Backups and incident handling: `docs/runbook.md`.

## Project layout

| Path | Contents |
|---|---|
| `app/` | Pages (one folder per route), API routes in `app/api/` |
| `components/` | Shared components: navigation, post cards, file viewer, assistant |
| `lib/` | Supabase client, post loading, feedback (toasts and dialogs), AI and scholar adapters |
| `proxy.ts` | Server-side sign-in check for private pages |
| `supabase/migrations/` | Database schema and security, in order |
| `tests/db/` | Database tests (PGlite) |
| `tests/e2e/` | Browser tests (Playwright) and the fake Supabase they use |
| `docs/` | Operations: backups, incidents, admin tasks |
| `scripts/` | One-off maintenance and API check scripts |

## Fonts and pictures

Plus Jakarta Sans and JetBrains Mono are served from `app/fonts/` under the
SIL Open Font License 1.1 (license texts in the same folder). The default profile
cover (`public/images/default-cover.svg`) is original artwork made for this project.
