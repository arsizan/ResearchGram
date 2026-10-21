# Web Engineering testing assignment — raw results (working notes, 21 Oct 2026)

Not the report. Raw numbers so a later session can write/fix the report and the final doc/PDF.
Sizan asked (21 Oct): run every web-app test type (Week 12 slides = Pressman/Lowe ch. 15, plus types from
other sites), answer in chat first, no report file until he reviews; final doc/pdf later. 10 marks.
No password needed or used. System under test: commit 4598159 (= origin/main on 21 Oct).
Report v1 was sent in chat on 21 Oct (English report + Bangla notes); waiting for Sizan's corrections.
21 Oct correction from Sizan: v1 too long. Wanted format (v2, sent in chat): 3–4 pages (max 5); short intro;
the slide test types (plus a few useful extras: accessibility, regression/CI) each marked passed or not, written
as full sentences ("We have tested the UI ..."); scope/limitations/future work woven into the text; ONE table of
well-known benchmarks (Lighthouse, Core Web Vitals, SSL Labs, Observatory, W3C, WCAG/axe, npm audit, load p99);
short conclusion. No abstract, no separate scope/plan/approach sections, no Bangla/localization section, no defect
table, no defect IDs.
21 Oct second correction (v3, sent in chat): keep the same 12 numbered tests, but each test's work as a table
(What we tested | How we tested it | Result); highlight positive results (bold Passed; green in the doc); do not
raise minor issues. Kept only the two big ones as one "needs improvement" row each: Messages box hidden on phones
(UI table) and misleading pages when the database is unreachable (Database table). Benchmark table without the
W3C row. Offered to fix those two before submission so the report can say "fixed".

## Final counts (report v1)
- 635 automated checks, 632 passed: unit 45/45, fuzz 2/3 (60,000 inputs; FZ-02 fails), DB 470/470 assertions
  + storage script 20/20, repo E2E 65/65, extra E2E 30/32 (REL-01 and MOB-01 fail = defects D-02, D-01).
- Plus: DB fuzz 3,000 searches; 23 load runs = 249,530 requests (4,111 timeouts, all at >= 1,000 connections,
  0 HTTP errors); 6 PSI audits; Observatory 12 tests; SSL Labs; W3C 6 pages; 17 live URL probes; CI run #21.
- Defects: 14 (High 1, Medium 4, Low 9). Defect density ~0.4 per KLOC (~35.3 KLOC incl. SQL).

## Environment
- Local: Linux container 2 vCPU / 8 GB, Node 22.22, Next 16.4.1 production build (.next-e2e), fake Supabase
  (tests/e2e harness), Playwright 1.64 + Chromium 141, PGlite 0.5.8 (= PostgreSQL 18.3; production is PG 17),
  autocannon 8, axe-core, tsx + node:test coverage, codespell, detect-secrets, ESLint, tsc.
- Live (read-only, public pages, Sizan's PC browser pane, Chrome 152): PageSpeed Insights (Lighthouse 13.5),
  MDN HTTP Observatory, Qualys SSL Labs, W3C Nu validator, GitHub Actions page. Sandbox could not reach these
  hosts directly (proxy), so they were run from the browser pane.
- Firefox download blocked in sandbox -> Firefox/Safari/Edge/phones = manual checks for Sizan.

## Static
- ESLint 158 files 0 errors 0 warnings; tsc --noEmit 0 errors (11.5 s); codespell 0.
- detect-secrets: 4 files, all test/demo: scripts/seedResearchGramDemoData.mjs L18 DEFAULT_PASSWORD "ResearchGram@12345"
  (demo emails @researchgram.test — Sizan to confirm none exist in production Auth), test JWT/keys in tests/.
- npm audit: production deps 0 vulns (36 prod deps); all deps 6 high, all dev-only lint tooling
  (eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces; brace-expansion).
- Size: 199 tracked files, ~30.2k lines TS/TSX app code, 10 SQL migrations (~5.1k lines), tests 3.6k lines.

## Unit (component) — testing/unit/components.test.ts: 45/45 pass
- UT-01 passwordProblem BVA 7/8/9, EP classes; UT-02 sameSitePath (open redirect classes); UT-03 safeFilterTerm
  BVA 59/60/61; UT-04 upload limits BVA (5 MB image, 50 MB file, 25 MB chat, 0/1 byte); UT-05 friendly errors;
  UT-06 legal constants; UT-07 OpenAlex query; UT-08 rate limit 20/21 search, 15/16 assistant (window 1 hour);
  UT-09 basis path sameSitePath: 5 predicates -> V(G) = 6; 5 feasible paths tested; path 6 (path without "//"
  that still leaves the site) infeasible — never reached in 2,000,000 random inputs (testing/unit/path6.mjs).
- Coverage of tested lib files: 76.69% lines / 85.71% branches / 68.46% functions.
- Fuzz (testing/unit/fuzz.test.ts, fixed seeds, 20,000 inputs each): FZ-01 sameSitePath pass; FZ-03
  passwordProblem pass; FZ-02 safeFilterTerm: 0 filter-syntax chars survive (security OK) but 1,035/20,000
  (5.2%) outputs end with a space (trim() before slice()) -> D-11.
- DB fuzz: 3,000 hostile search texts (SQL/tsquery syntax, Unicode, 10k chars) -> 0 errors, 0 private-post leaks;
  NUL byte rejected by Postgres ("invalid byte sequence").

## Database (PGlite, repo suites) — all pass
- phase3 77, phase4-legacy 29, phase4 214, phase5 150 = 470 assertions, 74 s; storage backup script 20 checks.
- Verified 21 Oct: signed-in user B reads user A's profiles.email; anon gets permission denied. Public buckets:
  content-files, content-images, profile-avatars; private: chat-attachments, restricted-papers, workspace-files.
- Benchmark 20,000 posts / 2,000 profiles: candidate search with GIN/trigram indexes vs forced seq scan:
  'graph' 714 vs 7,216 ms (10x); 'bangladesh flood' 272 vs 7,556 (28x); 'transformer model' 178 vs 7,124 (40x);
  no-match 11 vs 7,240 (650x). Full search_posts: 8–15 ms rare/no match, 0.5–1.2 s common words (ranking
  recomputes tsvector per match; PGlite is WASM single-thread). People search 38–147 ms; typo 'rahmn' works.
  Results = independent count for all terms (incl. reversed word order).
- Bangla: rg_search_text keeps Bangla; rg_keyword_text/rg_tsquery drop it (a-z0-9 only) -> only "contains"
  path. 'বাংলা ভাষা' finds 1 of 3 posts, 'ভাষা বাংলা' 0 of 3; English 'Bangla language' / 'language Bangla'
  find 3 of 3 -> D-04. Production check (read-only): select public.rg_search_text('গবেষণা সহযোগিতা');

## Repo E2E (Playwright, fake Supabase): 65/65 pass, 178 s
- a11y 11, admin 3, auth 10, feed 2, messages 10, phase5 19, profile 6, requests 1, workspace 3.

## Extra E2E for the assignment (tests/e2e/zz-assignment.spec.mjs, scratch worktree only): 32 tests, 30 pass
- NAV-01 crawl 22 pages 0 broken; NAV-02 titles; NAV-03 404 + "Go to feed"; NAV-04 back/forward; NAV-05 noindex.
- COMP-01 7 viewports (320,375,390,412,768,1366,1920) x 10 pages: no horizontal scroll. COMP-02 JS off: public
  pages show h1/content. COMP-03 throttling (final run, FCP / load): Slow 3G 2.87–3.00 s / 7.28–7.55 s; Fast 3G
  0.96–0.99 / 1.94–2.02; 4G 0.37–0.50 / 0.51–0.67; ~296–313 KB transferred.
- SEC-01 stored XSS: 0 dialogs, 0 injected scripts. SEC-02 cookie sb-<ref>-auth-token: SameSite Lax, httpOnly
  false, no Secure (library default), 400 days. SEC-03 API: no session 401, forged token 401, bad q 400,
  21st search in an hour 429 (Retry-After), assistant empty 400 / no session 401.
- REL-01 DB unreachable: /feed -> onboarding ("Loading profile setup..." or empty form, 9%), /messages
  "Loading…" forever, /network /workspace /notifications false empty states; no crash, no raw errors -> D-02.
- FORM-01 7 invalid sign-up classes each get a clear message; FORM-02 empty login/forgot; FORM-03 keyboard-only
  login; FORM-04 double-click Publish -> 1 post.
- CI-01/02/03: run #21 failure = timing race. Focused runs at x10 CPU: error thrown before hydration reported
  0/3, after hydration 3/3; in the full-suite run the early error was reported 1/1 -> timing-dependent (flaky).
  ErrorReporter adds listeners in useEffect (after hydration) -> D-03.
- MOB-01: message box AND "Send message" button covered by fixed bottom nav "Pages" at 320, 375, 390, 412,
  768 px (all < 1024 px); fine at 1366. Cause: app/messages/UI.tsx height calc(100vh - 60px) + AppNav
  fixed bottom nav (lg:hidden) -> D-01 (High).
- MOB-02 (390 px): voice-message button 16x16 (< 24x24 WCAG 2.2 SC 2.5.8); author-name links 20 px tall;
  smallest text 9 px (badge numbers); bottom nav 7 items; assistant FAB overlaps card buttons -> D-12.
- PUSH-01 Realtime: new message appears in 72 ms without reload. COOKIE-01 logout removes cookie; /feed then
  -> /auth/login?next=%2Ffeed; Back shows login. COOKIE-02 cookies blocked: login silently ends on
  /auth/login?next=%2Fprofile, no message (D-10). I18N-01 Bangla post (conjuncts + emoji) saved and shown exactly.
- A11Y-01 axe WCAG 2.1 A/AA: 0 violations on 12 more pages (/, privacy, terms, signup, reset-password,
  onboarding, discover, researchers, recommendations, mentorship, topic, 404).

## Load / stress (autocannon vs local production build, 15 s runs; generator + server share 2 vCPU)
- '/' (prerendered): ~760–800 req/s for N=10..500, p99 29 ms (N=10) .. 886 ms (N=500); N=1000 0 errors p99 1.99 s;
  N=2000 1,885 timeouts (>10 s). '/feed' SSR + ES256 session check: ~470–485 req/s, p99 36 ms (N=10), 281 ms
  (N=100), 680 ms (N=250); N=1000 874 timeouts (12%). HS256 session (calls Supabase Auth each request): ~375–394
  req/s (~20% lower). login page 728 req/s, privacy 651 req/s at N=50.
- Spike N=1500 on /feed: 26% timeouts; recovery at N=10 right after: p50 25 ms, 0 errors.
- Soak N=50 on /feed 180 s: 78,787 requests, 0 errors, p99 178 ms, RSS flat ~767–769 MB (no leak). RSS 234 MB
  idle -> ~765 MB after high-concurrency runs (heap high-water mark).
- Rate limiter under 100 concurrent requests (300 total, one user): exactly 20 allowed, 280 x 429 (no race).
- Pressman P = N x T x D, e.g. /feed N=100, T=4.68 req/s/user, D=31.5 KB -> ~14.4 MB/s.

## Live (production, read-only)
- PSI mobile/desktop (Perf/A11y/BP/SEO; FCP, LCP, TBT, CLS, SI):
  '/' mobile 97/100/100/100, 0.9 s, 2.4 s, 10 ms, 0, 2.7 s; desktop 100x4, 0.2, 0.5, 0, 0, 1.0.
  '/auth/login' mobile 99/100/100/100, 1.1, 1.9, 20 ms, 0, 2.8; desktop 100x4, 0.3, 0.4, 0, 0, 0.3.
  '/privacy' mobile 99/100/100/100, 0.9, 2.1, 80 ms, 0, 1.9; desktop 100x4, 0.2, 0.6, 30 ms, 0, 0.4.
  No CrUX field data. Hints: unused JS ~85 KiB, legacy JS 14 KiB, render-blocking ~270–320 ms (mobile).
- MDN Observatory: B+ (80/100), 11/12 tests pass; only CSP fails (script-src 'unsafe-inline', -20) -> D-08.
- SSL Labs: A; TLS 1.3 + 1.2 only, PQC X25519MLKEM768, CAA, cert *.vercel.app RSA 2048 (Google WR1) valid to
  27 Nov 2026; no Heartbleed/ROBOT/POODLE; IE11 Win7/8.1 and Safari <= 8 cannot connect (no TLS 1.0/1.1).
  SSL Labs said HSTS "No" but the header is present (browser + Observatory raw headers) and vercel.app is preloaded.
- Headers live: CSP, HSTS max-age=63072000; includeSubDomains, X-Frame-Options DENY + frame-ancestors 'none',
  nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, COOP same-origin; served from
  bom1 (Mumbai) CDN cache HIT. No X-Powered-By. Access-Control-Allow-Origin * on public HTML (harmless).
- Probes (signed out): /.env, /.env.local, /package.json, /next.config.ts -> 404; /.git/config, /admin, /feed,
  unknown URLs -> login?next=...; /api/research no q 400, with q no auth 401; /api/assistant GET 405.
- robots.txt allows / disallows /api/, sitemap 5 public URLs; /, privacy, terms have no canonical link (minor).
- W3C: '/' 4 errors (h4 inside role="img" mock-up x2, heading level skips x2) + 5 warnings; login, signup,
  privacy, terms, forgot-password 0 errors (only React trailing-slash infos) -> D-06.
- GitHub Actions run #21 (4598159): lint/type/build OK, DB tests OK, audit OK, browser tests FAIL
  (phase5.spec.mjs:191 error-log test, also failed on retry).

## Content findings
- Landing claims "Accepted requests open a dedicated chat and shared workspace automatically" — accepting only
  opens a chat (respond_to_research_request -> open_research_conversation); workspaces are created on the
  Workspace page. "Secure & private by default" vs emails visible to signed-in users and public file URLs.
  Mock-up shows researchgram.app/feed (domain not owned). Title/H1 mismatch: "Log in"/"Login",
  "Sign up"/"Sign Up", "Forgot password"/"Reset password".

## Defect list (as numbered in report v1)
D-01 High Messages composer hidden < 1024 px. D-02 Medium DB errors shown as onboarding/empty/loading.
D-03 Medium early client errors unreported + CI #21 red (flaky). D-04 Medium Bangla multi-word search.
D-05 Medium every signed-in user can read all emails (known open decision). D-06 Low landing HTML validity.
D-07 Low landing claims. D-08 Low CSP unsafe-inline. D-09 Low cookie no Secure flag, 400 days (lib default).
D-10 Low cookies blocked -> silent return to login. D-11 Low safeFilterTerm trailing space. D-12 Low small /
crowded touch targets, FAB overlap. D-13 Low title vs heading wording. D-14 Low demo password in public seed script.
Observations: in-memory per-instance rate limit (documented), search ranking cost on common words, no Node
"engines" pin, dev-only audit findings, signed-out unknown URLs go to login (by design), public file URLs
(disclosed in Privacy Policy).

## Pending for Sizan (manual)
Phone check of Messages (D-01) and Firefox/Edge/Safari; UAT/SUS with ~5 classmates (Pressman step 10);
confirm no @researchgram.test demo accounts in production; optional read-only SQL for Bangla; student ID,
teacher name for the cover page.
