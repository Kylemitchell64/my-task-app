# Learning Tracker

Plan what to learn, time your focus, and watch the streak grow.

**Live:** [task-app-frontend-alpha.vercel.app](https://task-app-frontend-alpha.vercel.app)

It opens instantly, works offline, and needs no account. Sign in only if you want your tasks on more than one device.

React 19 frontend, ASP.NET Core 8 API, PostgreSQL. Free to run.

---

## What it does

- **Type one line, get a full task.** `Read EF Core docs 45m #csharp tomorrow !high` becomes a 45-minute, high-priority task in the *csharp* category, due tomorrow. Each piece it understood shows as a chip you can dismiss if it guessed wrong.
- **Focus timer built in.** Press play on a task to start a countdown. Time is logged against the task, so you can see estimate versus actual.
- **Progress you can see.** A streak, time focused today, and a seven-day chart with a breakdown by category.
- **Views that match how you plan.** Today, Upcoming, All, and Done (a dated record of what you finished).
- **Repeating tasks.** Daily, weekdays, weekly, monthly. Finishing one schedules the next.
- **Fast with a keyboard.** `N` new task, `J`/`K` move, `X` done, `F` focus, `Ctrl+K` command palette, `Ctrl+Z` undo, `?` for the full list.
- **Drag to reorder,** undo for every destructive action, search, category filters.
- **Light and dark themes** with a one-click toggle, or follow the system.
- **Installable** on a phone or desktop, and fully usable with no network.
- **Your data is yours.** Export and import as JSON. Delete your account and everything in it from Settings.

---

## How it works

The app is **local-first**. Your tasks live in the browser, and every action reads and writes that local copy, so nothing ever waits on a server.

```
┌──────────────────── Browser ────────────────────┐        ┌────────── API ──────────┐
│                                                  │        │                         │
│  UI  ──reads/writes──▶  local store              │  POST  │  SyncService            │
│                         (localStorage)           │ /api/  │   merge by last edit    │
│                              │                   │  sync  │   version per account   │
│                              ▼                   │ ─────▶ │          │              │
│                         sync engine ─────────────┼────────┼──────────▼              │
│                         (background, retries)    │ ◀───── │     PostgreSQL          │
│                                                  │        │                         │
│  service worker: caches the app for offline use  │        │                         │
└──────────────────────────────────────────────────┘        └─────────────────────────┘
```

**Sync is one request.** The device sends the rows it changed plus the last version number it saw. The server merges them and returns every row the device has not seen. That is the whole protocol.

- **Conflicts:** when two devices edit the same task, the later edit wins. Every edit is stamped later than the version it replaced, so a device with a slow clock cannot lose its own edit.
- **Ordering:** each account has a version counter. A sync locks the account's row, so versions are handed out in commit order and a device can never skip a row. This is tested with a dozen devices syncing at once.
- **Deletes** are kept as markers so other devices learn about them. The task's content is erased from the server straight away.
- **Focus sessions** are append-only, so they never conflict.
- **If the server loses data** (a free database gets replaced), the device notices its version is ahead and sends everything again.

**No cold start for the user.** The API runs on a free host that sleeps when idle. That no longer matters to the person using the app: the interface loads from a CDN and a service worker, and works from local data. Sync happens in the background whenever the server is reachable. A scheduled GitHub Action also pings the API every ten minutes so sign-in is quick.

---

## Security

### The incident

Shortly after the first deploy I saw unusual traffic in the logs: repeated POSTs with oversized payloads and script tags in task fields. Nothing was exploited, but it showed that an open API with no limits is a target. Everything below came out of that.

### What is in place

| Area | What the app does |
| --- | --- |
| **Input** | Every incoming row is trimmed and clamped on the server: lengths, number ranges, allowed values. Bad values are cleaned rather than rejected, so one bad row cannot block a device's sync. Request bodies over 1 MB are refused before they are read. |
| **Output** | Task text is only ever rendered as text. A test adds `<img onerror>` and `<script>` payloads and checks nothing runs. A Content-Security-Policy allows scripts from this site only. |
| **Data isolation** | The user comes from the signed token, never from the request body. Every query filters by that user. A test has one user send another user's task id and checks it cannot touch the original. |
| **Sign-in** | Google or GitHub only, so there are no passwords to store. After sign-in the browser gets a **single-use code** that is valid for two minutes, not a token in the URL. |
| **Sessions** | Access tokens last 15 minutes. Refresh tokens are single-use and rotate. Only their hashes are stored. If an old refresh token is replayed, every session descended from it is revoked. |
| **Rate limits** | Signed-in endpoints are limited per account, sign-in endpoints per IP address. Both return `429` with `Retry-After`. |
| **CORS** | Only the known frontend origins. No cookies are used, so credentials are off. |
| **Headers** | `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, HSTS, and `Cache-Control: no-store` on every API response. |
| **Secrets** | None in the repository. The API refuses to start in Production with the placeholder signing key. |
| **Account deletion** | One call removes the user, their tasks, sessions and tokens in a single transaction. |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, plain CSS, dnd-kit, Workbox (via vite-plugin-pwa) |
| Backend | ASP.NET Core 8, EF Core 8, ASP.NET Core Identity |
| Database | PostgreSQL |
| Auth | Google and GitHub OAuth, JWT access tokens, rotating refresh tokens |
| Tests | xUnit against real PostgreSQL, Vitest, Playwright, axe |
| Hosting | Vercel (frontend), Render (API), any free PostgreSQL such as Neon |

---

## Running locally

**You need:** .NET 8 SDK, Node 22+, PostgreSQL.

```bash
# 1. A database (the defaults expect user postgres / password postgres on localhost)
createdb tasks_dev

# 2. The API, on http://localhost:8080
cd TodoApi
dotnet run

# 3. The frontend, on http://localhost:5173
cd my-todo-app
npm install
npm run dev
```

No OAuth setup is needed for development. With no provider credentials, the sign-in dialog offers a **development sign-in** that takes any email. That option does not exist in Production.

Or run everything in containers:

```bash
docker compose up --build      # http://localhost:8081
```

### Tests

```bash
# API: integration tests against a real PostgreSQL (each test class gets its own database)
dotnet test

# Frontend: unit tests for the store, sync, parser, timer and stats
cd my-todo-app && npm test

# Browser: the real app against the real API and database
cd my-todo-app && npx playwright install chromium && npm run e2e
```

The API tests read `TEST_DATABASE` for the server to use. The default is `Host=localhost;Username=postgres;Password=postgres`.

---

## Configuration

### API

| Variable | Required | Purpose |
| --- | --- | --- |
| `ConnectionStrings__DefaultConnection` or `DATABASE_URL` | yes | PostgreSQL. A `postgres://` URL works in either. |
| `JWT_KEY` | yes | Token signing key, 32+ characters. Generate with `openssl rand -base64 64`. |
| `FRONTEND_URL` | yes | Where to send the browser after sign-in, and an allowed CORS origin. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Turns on Google sign-in. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | no | Turns on GitHub sign-in. |
| `CORS_ORIGINS` | no | Extra allowed origins, comma separated. |
| `Auth__DevLogin` | no | `true` enables the development sign-in. Ignored in Production. |

OAuth redirect URIs to register with the providers: `https://<api-host>/signin-google` and `https://<api-host>/signin-github`.

### Frontend

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | The API's address, set at build time. Empty means the same origin as the page. |

### API endpoints

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/sync` | token | Send changed rows, receive unseen rows. The only data endpoint. |
| `GET /api/auth/providers` | none | Which sign-in options are switched on. |
| `GET /api/auth/login/{provider}` | none | Start a Google or GitHub sign-in. |
| `POST /api/auth/exchange` | none | Trade the single-use code for tokens. |
| `POST /api/auth/refresh` | none | Trade a refresh token for a new pair. |
| `POST /api/auth/logout` | none | End this device's session. |
| `GET /api/auth/me` | token | The signed-in user. |
| `DELETE /api/account` | token | Delete the account and all its data. |
| `GET /healthz` | none | Liveness. No database access. |
| `GET /api/diagnostic/health` | none | Health including the database. |

Swagger UI is available at `/swagger` in Development.

---

## Deploying for free

- **Frontend on Vercel.** Root directory `my-todo-app`. `vercel.json` sets the security headers and cache rules.
- **API on Render** (free web service). Docker build from `TodoApi/Dockerfile`. Migrations run on startup.
- **Database on Neon** or any free PostgreSQL that does not expire. Paste its connection URL into `DATABASE_URL`.
- **Keeping the API awake.** `.github/workflows/keep-warm.yml` pings it every ten minutes. Set the repository variable `API_URL` if your API lives somewhere else.

---

## Project layout

```
TodoApi/                 ASP.NET Core API
  Controllers/           auth, sync, account, diagnostics
  Services/              SyncService (merge logic), TokenService (tokens and codes)
  Models/, Data/         entities and the EF Core context
  Migrations/
TodoApi.Tests/           integration tests (real PostgreSQL)
my-todo-app/             React frontend
  src/lib/               framework-free logic: store, sync, auth, parser, timer, stats
  src/components/        the interface
  src/app/               wiring: shared services, hooks, sound
  tests/                 unit tests
  e2e/                   Playwright tests
k8s/                     Kubernetes manifests from an earlier AKS deployment
.github/workflows/       CI and the keep-warm ping
```
