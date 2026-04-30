# My Learning Tracker

A full-stack task management app I built to track learning goals. React frontend, ASP.NET Core 8 REST API, PostgreSQL database. Deployed on Vercel (frontend) and Render (API + database).

**Live demo:** [task-app-frontend-alpha.vercel.app](https://task-app-frontend-alpha.vercel.app)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite, React Router |
| Backend | ASP.NET Core 8, EF Core 8 |
| Database | PostgreSQL (Render managed) |
| Auth | ASP.NET Core Identity, JWT Bearer, Google + GitHub OAuth |
| Containers | Docker (multi-stage builds), NGINX |
| Deployment | Vercel (frontend), Render (API) |

---

## Security & Authentication

### The incident

Shortly after deploying to Render I noticed unusual traffic in the logs — repeated POST requests with oversized payloads and script-injected content in task fields. Nothing was exploited, but it was a clear signal that an open, unauthenticated API with no input limits is a real target.

### Hardening

- **Input validation:** Data annotations on the `TodoTask` model (`[StringLength]`, `[Range]`, `[Required]`) combined with `ModelState.IsValid` checks in every POST/PUT action. The database schema enforces the same limits via EF Core migrations.
- **Rate limiting:** ASP.NET Core's built-in fixed-window rate limiter — 30 requests per minute per IP. Returns 429 on breach.
- **Request size cap:** Kestrel configured to reject bodies over 100 KB, cutting off payload flooding before it reaches the controller.
- **XSS overflow protection:** CSS `overflow-wrap: anywhere` and `word-break: break-word` on task content so injected long strings can't break the layout. Input `maxLength` attributes mirror the server-side limits.

### Authentication

Social login only — no passwords to store or manage. Users sign in with Google or GitHub.

**Stack:** ASP.NET Core Identity + JWT bearer tokens

**Flow:**
1. User clicks "Sign in with Google" or "Sign in with GitHub" on the login page
2. Browser navigates to `/api/auth/login/{provider}` on the API
3. API redirects to Google or GitHub for authorization
4. After the user approves, the provider redirects back to `/signin-{provider}` (handled by the ASP.NET middleware)
5. The middleware calls `/api/auth/callback` — the API looks up the user by email, creates an account on first login, and issues a signed JWT
6. The API redirects the browser to the frontend at `/auth/callback#token=...`
7. The frontend stores the token in localStorage and attaches it as a `Bearer` header on every API request

**Data isolation:** Every task has a `UserId` column. All queries filter by the user ID extracted from the JWT claim. Update and delete operations verify ownership server-side before touching any record — they return 404 instead of 403 to avoid leaking which IDs exist.

---

## Running Locally

**Prerequisites:** .NET 8 SDK, Node 22+, PostgreSQL

**Environment variables (backend):**
```
JWT_KEY=<64-byte base64 key — generate with: openssl rand -base64 64>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GITHUB_CLIENT_ID=<from GitHub Developer Settings>
GITHUB_CLIENT_SECRET=<from GitHub Developer Settings>
FRONTEND_URL=http://localhost:5173
```

**Start the API:**
```bash
cd TodoApi
dotnet run
```

**Start the frontend:**
```bash
cd my-todo-app
npm install
npm run dev
```

The frontend reads `VITE_API_URL` for the backend URL. If unset, it falls back to the Render deployment.

---

## Deployment

**Backend (Render):**
- Docker build via `TodoApi/Dockerfile`
- Set all env vars above in the Render environment tab
- EF Core migrations run automatically on startup

**Frontend (Vercel):**
- Root directory: `my-todo-app`
- Set `VITE_API_URL` to your Render backend URL
- `vercel.json` handles SPA routing so React Router works on direct URL loads
