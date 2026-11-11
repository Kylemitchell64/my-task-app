// A small in-memory stand-in for the API's sync and auth endpoints, following the same rules
// as the real server (TodoApi/Services/SyncService.cs), so client logic can be tested
// with several "devices" and no network.

export function createFakeServer({ now = () => Date.now() } = {}) {
  const tasks = new Map(); // id -> { row, version }
  const sessions = new Map();
  let version = 0;
  let refreshCounter = 0;
  const validRefresh = new Set();
  const validAccess = new Set(["access-0"]);
  const calls = [];
  let failure = null;

  function sync(body) {
    if (body.cursor > version) return { cursor: 0, reset: true, tasks: [], sessions: [], rejected: [], serverTime: now() };

    const next = version + 1;
    const accepted = new Set();
    const stale = new Set();
    for (const task of body.tasks ?? []) {
      const existing = tasks.get(task.id);
      if (existing && task.updatedAt <= existing.row.updatedAt) {
        stale.add(task.id);
        continue;
      }
      tasks.set(task.id, { row: { ...task }, version: next });
      accepted.add(task.id);
    }
    for (const session of body.sessions ?? []) {
      if (sessions.has(session.id)) continue;
      sessions.set(session.id, { row: { ...session }, version: next });
      accepted.add(session.id);
    }
    if (accepted.size > 0) version = next;

    return {
      cursor: version,
      reset: false,
      tasks: [...tasks.entries()]
        .filter(([id, t]) => (t.version > body.cursor || stale.has(id)) && !accepted.has(id))
        .map(([, t]) => ({ ...t.row })),
      sessions: [...sessions.entries()]
        .filter(([id, s]) => s.version > body.cursor && !accepted.has(id))
        .map(([, s]) => ({ ...s.row })),
      rejected: [],
      serverTime: now(),
    };
  }

  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  function tokens() {
    refreshCounter++;
    const refreshToken = `refresh-${refreshCounter}`;
    const accessToken = `access-${refreshCounter}`;
    validRefresh.add(refreshToken);
    validAccess.add(accessToken);
    return {
      accessToken,
      accessTokenExpiresAt: now() + 15 * 60_000,
      refreshToken,
      user: { id: "user-1", email: "a@example.com", name: "Ada" },
    };
  }

  async function fetchImpl(url, options = {}) {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    const token = options.headers?.Authorization?.replace("Bearer ", "");
    calls.push({ path, body, token });

    if (failure) {
      const current = failure;
      if (current.once) failure = null;
      if (current.error) throw current.error;
      return json(current.status, { title: current.title });
    }

    if (path === "/api/auth/dev-login" || path === "/api/auth/exchange") return json(200, tokens());
    if (path === "/api/auth/refresh") {
      // Single use: a refresh token is spent the moment it is traded in.
      if (!validRefresh.delete(body.refreshToken)) {
        return json(401, { title: "Your session has ended. Please sign in again." });
      }
      return json(200, tokens());
    }
    if (path === "/api/auth/logout") return json(204, null);
    if (path === "/api/sync") {
      if (!validAccess.has(token)) return json(401, {});
      return json(200, sync(body));
    }
    if (path === "/api/account") return json(204, null);
    return json(404, {});
  }

  return {
    now,
    fetchImpl,
    calls,
    tasks: () => [...tasks.values()].map((t) => t.row),
    sessions: () => [...sessions.values()].map((s) => s.row),
    /** Makes the server forget everything, as if its database had been replaced. */
    wipe() {
      tasks.clear();
      sessions.clear();
      version = 0;
    },
    revokeAccessTokens: () => validAccess.clear(),
    revokeEverything() {
      validAccess.clear();
      validRefresh.clear();
    },
    failNext: (f) => {
      failure = { ...f, once: true };
    },
    failAll: (f) => {
      failure = f ? { ...f, once: false } : null;
    },
  };
}
