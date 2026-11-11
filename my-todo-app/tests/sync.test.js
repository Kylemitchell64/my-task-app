import { describe, expect, it } from "vitest";
import { ApiError, SignedOutError, createAuth } from "../src/lib/auth.js";
import { byManualOrder, createStore, liveTasks } from "../src/lib/store.js";
import { createSync } from "../src/lib/sync.js";
import { createFakeServer } from "./fakeServer.js";
import { fakeClock, memoryStorage } from "./helpers.js";

const noTimers = { setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };

/** One browser on one device, talking to a shared fake server. */
async function device(server, { now = server.now, storage = memoryStorage(), signIn = true, online = () => true } = {}) {
  const auth = createAuth({ storage, fetchImpl: server.fetchImpl, apiBase: "https://api.test", now });
  const store = createStore({ storage, now });
  const sync = createSync({ store, auth, isOnline: online, timers: noTimers });
  if (signIn) {
    const user = await auth.devSignIn("a@example.com");
    store.setOwner(user.email);
  }
  const titles = () => liveTasks(store.getState().tasks).sort(byManualOrder).map((t) => t.title);
  return { auth, store, sync, storage, now, titles };
}

describe("syncing between devices", () => {
  it("moves a task from one device to another", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    const phone = await device(server);

    laptop.store.addTask({ title: "Read the docs" });
    await laptop.sync.syncNow();
    await phone.sync.syncNow();

    expect(phone.titles()).toEqual(["Read the docs"]);
    expect(laptop.sync.getStatus().phase).toBe("idle");
    expect(laptop.store.hasUnsynced()).toBe(false);
  });

  it("uploads what a guest made before signing in, and merges what the account already had", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    laptop.store.addTask({ title: "Already in the account" });
    await laptop.sync.syncNow();

    const phone = await device(server, { signIn: false });
    phone.store.addTask({ title: "Made on the phone before signing in" });
    await phone.sync.syncNow();
    expect(phone.sync.getStatus().phase).toBe("off");
    expect(server.tasks()).toHaveLength(1);

    const user = await phone.auth.devSignIn("a@example.com");
    phone.store.setOwner(user.email);
    await phone.sync.syncNow();
    await laptop.sync.syncNow();

    const everything = ["Already in the account", "Made on the phone before signing in"];
    expect(phone.titles().sort()).toEqual(everything);
    expect(laptop.titles().sort()).toEqual(everything);
  });

  it("lets the later edit win on every device", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const now = server.now;
    const laptop = await device(server);
    const phone = await device(server);

    const task = laptop.store.addTask({ title: "Original" });
    await laptop.sync.syncNow();
    await phone.sync.syncNow();

    now.advance(1000);
    phone.store.updateTask(task.id, { title: "Phone edit (earlier)" });
    now.advance(1000);
    laptop.store.updateTask(task.id, { title: "Laptop edit (later)" });

    // The laptop syncs first; the phone's older edit then arrives and must lose.
    await laptop.sync.syncNow();
    await phone.sync.syncNow();
    await laptop.sync.syncNow();

    expect(phone.titles()).toEqual(["Laptop edit (later)"]);
    expect(laptop.titles()).toEqual(["Laptop edit (later)"]);
    expect(phone.store.hasUnsynced()).toBe(false);
  });

  it("carries deletions, completions and focus time across", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    const phone = await device(server);

    const keep = laptop.store.addTask({ title: "Keep" });
    const remove = laptop.store.addTask({ title: "Remove" });
    await laptop.sync.syncNow();
    await phone.sync.syncNow();

    phone.store.deleteTask(remove.id);
    phone.store.toggleTask(keep.id);
    phone.store.addSession({ taskId: keep.id, startedAt: phone.now(), seconds: 1500 });
    await phone.sync.syncNow();
    await laptop.sync.syncNow();

    expect(laptop.titles()).toEqual(["Keep"]);
    expect(laptop.store.getState().tasks[keep.id].isCompleted).toBe(true);
    expect(Object.values(laptop.store.getState().sessions)).toHaveLength(1);
    // The deletion marker is gone from the device that made it.
    expect(phone.store.getState().tasks[remove.id]).toBeUndefined();
  });

  it("sends a large backlog in batches", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    for (let i = 0; i < 450; i++) laptop.store.addTask({ title: `Task ${i}` });

    await laptop.sync.syncNow();

    expect(server.tasks()).toHaveLength(450);
    expect(server.calls.filter((c) => c.path === "/api/sync").map((c) => c.body.tasks.length)).toEqual([200, 200, 50]);
    expect(laptop.store.hasUnsynced()).toBe(false);
  });

  it("re-uploads everything if the server loses its data", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    laptop.store.addTask({ title: "Precious" });
    await laptop.sync.syncNow();

    server.wipe();
    await laptop.sync.syncNow();

    expect(server.tasks().map((t) => t.title)).toEqual(["Precious"]);
    expect(laptop.titles()).toEqual(["Precious"]);
  });
});

describe("when things go wrong", () => {
  it("keeps changes on the device while offline and sends them later", async () => {
    const server = createFakeServer({ now: fakeClock() });
    let online = false;
    const laptop = await device(server, { online: () => online });

    laptop.store.addTask({ title: "Written on a plane" });
    await laptop.sync.syncNow();
    expect(laptop.sync.getStatus().phase).toBe("offline");
    expect(server.tasks()).toHaveLength(0);
    expect(laptop.titles()).toEqual(["Written on a plane"]);

    online = true;
    await laptop.sync.syncNow();
    expect(server.tasks()).toHaveLength(1);
    expect(laptop.sync.getStatus().phase).toBe("idle");
  });

  it("treats a network failure as offline, not as an error to show", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    laptop.store.addTask({ title: "a" });

    server.failNext({ error: new TypeError("Failed to fetch") });
    await laptop.sync.syncNow();

    expect(laptop.sync.getStatus()).toMatchObject({ phase: "offline", message: null });
    expect(laptop.store.hasUnsynced()).toBe(true);
  });

  it("reports a server error and keeps the changes for the retry", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    laptop.store.addTask({ title: "a" });

    server.failNext({ status: 500, title: "Something broke" });
    await laptop.sync.syncNow();
    expect(laptop.sync.getStatus()).toMatchObject({ phase: "error", message: "Something broke" });

    await laptop.sync.syncNow();
    expect(server.tasks()).toHaveLength(1);
  });

  it("renews an expired access token without the user noticing", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const now = server.now;
    const laptop = await device(server);

    now.advance(20 * 60_000); // past the 15 minute lifetime
    laptop.store.addTask({ title: "a" });
    await laptop.sync.syncNow();

    expect(server.tasks()).toHaveLength(1);
    expect(server.calls.map((c) => c.path)).toContain("/api/auth/refresh");
  });

  it("renews and retries when the server rejects a token that looked valid", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    server.revokeAccessTokens();

    laptop.store.addTask({ title: "a" });
    await laptop.sync.syncNow();

    expect(server.tasks()).toHaveLength(1);
    expect(laptop.sync.getStatus().phase).toBe("idle");
  });

  it("asks for a new sign-in when the session has ended, and loses nothing", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    server.revokeEverything();

    laptop.store.addTask({ title: "Not lost" });
    await laptop.sync.syncNow();

    expect(laptop.sync.getStatus().phase).toBe("signed-out");
    expect(laptop.auth.isSignedIn()).toBe(false);
    expect(laptop.auth.needsSignIn()).toBe(true);
    expect(laptop.auth.getState().user.email).toBe("a@example.com");
    expect(laptop.titles()).toEqual(["Not lost"]);

    // Signing back in to the same account sends the waiting change.
    const user = await laptop.auth.devSignIn("a@example.com");
    expect(laptop.store.setOwner(user.email)).toBe("kept");
    await laptop.sync.syncNow();
    expect(server.tasks().map((t) => t.title)).toEqual(["Not lost"]);
  });

  it("folds overlapping sync calls into one follow-up", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    laptop.store.addTask({ title: "a" });

    const before = server.calls.length;
    await Promise.all([laptop.sync.syncNow(), laptop.sync.syncNow(), laptop.sync.syncNow()]);
    await laptop.sync.syncNow();

    expect(server.calls.length - before).toBeLessThanOrEqual(3);
    expect(server.tasks()).toHaveLength(1);
  });
});

describe("auth", () => {
  it("remembers the session across reloads", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const storage = memoryStorage();
    const first = await device(server, { storage });
    expect(first.auth.isSignedIn()).toBe(true);

    const second = createAuth({ storage, fetchImpl: server.fetchImpl, apiBase: "https://api.test", now: server.now });
    expect(second.isSignedIn()).toBe(true);
    expect(second.getState().user.name).toBe("Ada");
  });

  it("uses a token refreshed by another tab instead of spending the old one", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const storage = memoryStorage();
    const now = server.now;
    const tabA = await device(server, { storage });
    const tabB = createAuth({ storage, fetchImpl: server.fetchImpl, apiBase: "https://api.test", now });

    now.advance(20 * 60_000);
    await tabA.auth.authed("/api/sync", { method: "POST", body: { cursor: 0 } });
    const refreshes = () => server.calls.filter((c) => c.path === "/api/auth/refresh").length;
    expect(refreshes()).toBe(1);

    // Tab B still holds the old tokens in memory but finds the new ones in storage.
    await tabB.authed("/api/sync", { method: "POST", body: { cursor: 0 } });
    expect(refreshes()).toBe(1);
  });

  it("makes one refresh call for many simultaneous requests", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const now = server.now;
    const laptop = await device(server);
    now.advance(20 * 60_000);

    await Promise.all([1, 2, 3, 4].map(() => laptop.auth.authed("/api/sync", { method: "POST", body: { cursor: 0 } })));
    expect(server.calls.filter((c) => c.path === "/api/auth/refresh")).toHaveLength(1);
  });

  it("signs out locally even if the server cannot be reached", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const laptop = await device(server);
    server.failAll({ error: new TypeError("Failed to fetch") });

    await laptop.auth.signOut();
    expect(laptop.auth.getState()).toBeNull();
    expect(laptop.storage.dump()["lt.auth.v1"]).toBeUndefined();
  });

  it("refuses authed calls when signed out", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const guest = await device(server, { signIn: false });
    await expect(guest.auth.authed("/api/sync", { method: "POST", body: {} })).rejects.toBeInstanceOf(SignedOutError);
  });

  it("surfaces the server's message on a failed request", async () => {
    const server = createFakeServer({ now: fakeClock() });
    const guest = await device(server, { signIn: false });
    server.failNext({ status: 401, title: "This sign-in link has expired. Please sign in again." });

    await expect(guest.auth.signInWithCode("stale")).rejects.toMatchObject({
      status: 401,
      message: "This sign-in link has expired. Please sign in again.",
    });
    await expect(guest.auth.signInWithCode("ok")).resolves.toMatchObject({ email: "a@example.com" });
    expect(new ApiError(500, "x")).toBeInstanceOf(Error);
  });

  it("ignores corrupt saved sessions", () => {
    const auth = createAuth({ storage: memoryStorage({ "lt.auth.v1": "{broken" }) });
    expect(auth.getState()).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
  });
});
