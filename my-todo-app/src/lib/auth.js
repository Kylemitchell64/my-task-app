// Sign-in state and the calls that need it.
//
// Signing in is optional. Without it the app is fully usable and keeps data on this device.
// With it, a short-lived access token authorises requests and a long-lived refresh token
// gets new ones. Each refresh token is single-use: using it returns its replacement.

export const AUTH_KEY = "lt.auth.v1";

export const API_BASE = (import.meta.env.VITE_API_URL || "https://my-task-app-bt7p.onrender.com").replace(/\/+$/, "");

// The free API host sleeps when idle and can take most of a minute to wake.
const REQUEST_TIMEOUT_MS = 75_000;
const REFRESH_MARGIN_MS = 60_000;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Thrown when the session is over and the user has to sign in again. */
export class SignedOutError extends Error {}

export function createAuth({ storage, fetchImpl = (...args) => fetch(...args), apiBase = API_BASE, now = () => Date.now(), locks } = {}) {
  let state = load();
  const listeners = new Set();
  let refreshing = null;

  function load() {
    try {
      const saved = JSON.parse(storage?.getItem(AUTH_KEY) ?? "null");
      if (saved && typeof saved === "object" && saved.user?.email) {
        return {
          user: saved.user,
          accessToken: saved.accessToken ?? null,
          accessTokenExpiresAt: saved.accessTokenExpiresAt ?? 0,
          refreshToken: saved.refreshToken ?? null,
        };
      }
    } catch {
      // Unreadable storage is treated as signed out.
    }
    return null;
  }

  function set(next) {
    state = next;
    try {
      if (next) storage?.setItem(AUTH_KEY, JSON.stringify(next));
      else storage?.removeItem(AUTH_KEY);
    } catch {
      // The session still works for this visit.
    }
    for (const listener of listeners) listener();
  }

  async function request(path, { method = "GET", body, token } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${apiBase}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const problem = await response.json();
          if (typeof problem?.title === "string") message = problem.title;
        } catch {
          // No readable error body.
        }
        throw new ApiError(response.status, message);
      }
      return response.status === 204 ? null : await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function acceptTokens(tokens) {
    set({
      user: tokens.user,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
    });
    return tokens.user;
  }

  /** Finishes an OAuth sign-in with the single-use code from the redirect. */
  async function signInWithCode(code) {
    return acceptTokens(await request("/api/auth/exchange", { method: "POST", body: { code } }));
  }

  /** Local development and tests only. The server refuses this in production. */
  async function devSignIn(email, name) {
    return acceptTokens(await request("/api/auth/dev-login", { method: "POST", body: { email, name } }));
  }

  // The session is over but we keep who it was, so the UI can say "sign in again as …".
  function endSession() {
    if (state) set({ user: state.user, accessToken: null, accessTokenExpiresAt: 0, refreshToken: null });
  }

  /** @param {string|null} rejected an access token the server just refused, if any */
  async function refresh(rejected) {
    // Another tab may have refreshed while this one waited for the lock.
    const latest = load();
    if (
      latest?.accessToken &&
      latest.accessToken !== rejected &&
      latest.accessTokenExpiresAt - now() > REFRESH_MARGIN_MS
    ) {
      state = latest;
      for (const listener of listeners) listener();
      return latest.accessToken;
    }
    const refreshToken = latest?.refreshToken ?? state?.refreshToken;
    if (!refreshToken) throw new SignedOutError();

    try {
      acceptTokens(await request("/api/auth/refresh", { method: "POST", body: { refreshToken } }));
      return state.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        endSession();
        throw new SignedOutError();
      }
      if (error instanceof ApiError && error.status === 409) {
        // Another tab used this token a moment ago. Its new tokens are in storage.
        const other = load();
        if (other?.refreshToken && other.refreshToken !== refreshToken && other.accessToken) {
          state = other;
          for (const listener of listeners) listener();
          return other.accessToken;
        }
      }
      throw error;
    }
  }

  function refreshOnce(rejected = null) {
    if (!refreshing) {
      // The lock keeps two tabs from spending the same single-use refresh token.
      const run = locks ? locks.request("lt-auth-refresh", () => refresh(rejected)) : refresh(rejected);
      refreshing = Promise.resolve(run).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function accessToken({ rejected = null } = {}) {
    if (!state?.refreshToken) throw new SignedOutError();
    if (
      state.accessToken &&
      state.accessToken !== rejected &&
      state.accessTokenExpiresAt - now() > REFRESH_MARGIN_MS
    ) {
      return state.accessToken;
    }
    return refreshOnce(rejected);
  }

  /** A request as the signed-in user. Renews the access token when it has expired. */
  async function authed(path, options = {}) {
    const token = await accessToken();
    try {
      return await request(path, { ...options, token });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // The token may have been revoked early. One fresh token, one retry.
      const fresh = await accessToken({ rejected: token });
      try {
        return await request(path, { ...options, token: fresh });
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) {
          endSession();
          throw new SignedOutError();
        }
        throw retryError;
      }
    }
  }

  async function signOut() {
    const refreshToken = state?.refreshToken;
    set(null);
    if (refreshToken) {
      // Best effort: the device is signed out either way.
      try {
        await request("/api/auth/logout", { method: "POST", body: { refreshToken } });
      } catch {
        // The token will simply expire on the server.
      }
    }
  }

  async function deleteAccount() {
    await authed("/api/account", { method: "DELETE" });
    set(null);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reloadFromStorage() {
      state = load();
      for (const listener of listeners) listener();
    },
    isSignedIn: () => Boolean(state?.refreshToken),
    /** Signed in before, but the session ended and needs a new sign-in. */
    needsSignIn: () => Boolean(state && !state.refreshToken),
    signInWithCode,
    devSignIn,
    signOut,
    deleteAccount,
    authed,
    /** Which sign-in options the server offers. Also wakes a sleeping server. */
    providers: () => request("/api/auth/providers"),
    /** Wakes the server so it is ready by the time it is needed. */
    wake: () => fetchImpl(`${apiBase}/healthz`, { cache: "no-store" }).then(() => true, () => false),
    loginUrl: (provider) => `${apiBase}/api/auth/login/${encodeURIComponent(provider)}`,
  };
}
