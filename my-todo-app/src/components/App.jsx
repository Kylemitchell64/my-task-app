import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery, useStoreState, useSyncStatus, useToday } from "../app/hooks.js";
import { auth, onFocusFinished, prefs, store, sync, timer, toasts, watchOtherTabs } from "../app/services.js";
import { notify, playChime, unlockSound } from "../app/sound.js";
import { addDays, formatDay, formatDayHeading, formatDue, formatMinutes, weekdayName } from "../lib/dates.js";
import { allCategories, categoryCounts, DEFAULT_ESTIMATE, focusSecondsByTask, liveTasks } from "../lib/store.js";
import { buildSections, countTasks, DONE_PAGE, SORTS, VIEWS } from "../lib/view.js";
import CommandPalette from "./CommandPalette.jsx";
import FocusBar from "./FocusBar.jsx";
import Modal from "./Modal.jsx";
import Progress from "./Progress.jsx";
import QuickAdd from "./QuickAdd.jsx";
import SettingsDialog from "./SettingsDialog.jsx";
import ShortcutsDialog from "./ShortcutsDialog.jsx";
import { Sidebar, TabBar, TopBar } from "./Sidebar.jsx";
import SignInDialog from "./SignInDialog.jsx";
import TaskList from "./TaskList.jsx";
import Toasts from "./Toasts.jsx";
import { CloseIcon, DoneIcon, SearchIcon } from "./icons.jsx";

const SIGN_IN_ERRORS = {
  oauth_failed: "Sign-in was cancelled or did not finish. Please try again.",
  no_email: "That account did not share an email address, so it cannot be used to sign in.",
  email_unverified: "That account's email address is not verified yet. Verify it with the provider, then try again.",
  provider_unavailable: "That sign-in option is not available right now.",
  create_failed: "Your account could not be created. Please try again.",
  link_failed: "That sign-in could not be linked to your account. Please try again.",
};

const VIEW_LABELS = Object.fromEntries(VIEWS.map((view) => [view.id, view.label]));

// React runs effects twice in development. The sign-in code only works once.
let handledAuthCallback = false;

function EmptyState({ icon, title, children }) {
  return (
    <div className="empty" data-testid="empty-state">
      {icon}
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export default function App() {
  const data = useStoreState(store);
  const settings = useStoreState(prefs);
  const session = useStoreState(auth);
  const status = useSyncStatus(sync);
  const timerState = useStoreState(timer);
  const today = useToday();
  const isWide = useMediaQuery("(min-width: 900px)");
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [newId, setNewId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [focusResult, setFocusResult] = useState(null);
  const [doneLimit, setDoneLimit] = useState(DONE_PAGE);

  const searchRef = useRef(null);

  const view = settings.view;
  const tasks = liveTasks(data.tasks);
  const categories = categoryCounts(data.tasks);
  const categoryNames = allCategories(data.tasks);
  const focusSeconds = focusSecondsByTask(data.sessions);
  const counts = useMemo(() => countTasks(tasks, today), [tasks, today]);

  // A category filter only makes sense while something still uses that category.
  const activeCategory = category && categoryNames.includes(category) ? category : null;
  const searching = query.trim() !== "";
  const showingList = view !== "progress" || searching;

  const list = useMemo(
    () => buildSections({ tasks, view, sort: settings.sort, query, category: activeCategory, today, doneLimit }),
    [tasks, view, settings.sort, query, activeCategory, today, doneLimit]
  );

  // ---------- Theme ----------

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Tint the browser chrome to match the page.
    const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.removeAttribute("media");
      if (color) meta.setAttribute("content", color);
    });
  }, [theme]);

  const toggleTheme = useCallback(() => prefs.set({ theme: theme === "dark" ? "light" : "dark" }), [theme]);

  // ---------- Background services ----------

  useEffect(() => {
    const stopSync = sync.start({ window, document });
    const stopWatching = watchOtherTabs();
    return () => {
      stopSync();
      stopWatching();
    };
  }, []);

  const finishSignIn = useCallback((user) => {
    const hadTasks = liveTasks(store.getState().tasks).length > 0;
    const outcome = store.setOwner(user.email);
    setDialog(null);
    toasts.show(
      outcome === "adopted" && hadTasks
        ? `Signed in as ${user.name}. Your tasks are being backed up.`
        : `Signed in as ${user.name}.`,
      { tone: "success" }
    );
    sync.syncNow();
  }, []);

  // Returning from Google or GitHub: the address is /auth/callback#code=… or #error=…
  useEffect(() => {
    if (handledAuthCallback || window.location.pathname !== "/auth/callback") return;
    handledAuthCallback = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    // Remove the code from the address bar and the history before doing anything else.
    window.history.replaceState(null, "", "/");

    const error = params.get("error");
    const code = params.get("code");
    if (error || !code) {
      toasts.show(SIGN_IN_ERRORS[error] ?? "Sign-in did not finish. Please try again.", { tone: "danger", duration: 9000 });
      return;
    }

    const pending = toasts.show("Finishing sign-in…", { duration: 90_000 });
    auth.signInWithCode(code).then(
      (user) => {
        toasts.dismiss(pending);
        finishSignIn(user);
      },
      (failure) => {
        toasts.dismiss(pending);
        toasts.show(failure?.status === 401 ? failure.message : "Could not reach the sync server. Please try signing in again.", {
          tone: "danger",
          duration: 9000,
        });
      }
    );
  }, [finishSignIn]);

  // ---------- Focus timer ----------

  const timerRunning = timerState?.segmentStart != null;

  useEffect(() => {
    // Finish a countdown that ran out while the page was closed.
    timer.tick();
    return onFocusFinished((result) => {
      if (!result.recorded) {
        toasts.show("That session was under a minute, so it was not logged.");
        return;
      }
      setFocusResult(result);
      if (result.completed) {
        const current = prefs.getState();
        if (current.sound) playChime();
        if (current.notifications) {
          const task = store.getState().tasks[result.taskId];
          notify("Focus session complete", task ? task.title : `${formatMinutes(result.seconds / 60)} logged`);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = setInterval(() => timer.tick(), 1000);
    let worker = null;
    try {
      worker = new Worker(new URL("../app/tick.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = () => timer.tick();
    } catch {
      // The interval alone still works; it is just less punctual in a background tab.
    }
    return () => {
      clearInterval(interval);
      worker?.terminate();
    };
  }, [timerRunning]);

  const startFocus = useCallback((task) => {
    unlockSound();
    const sessionLength = prefs.getState().focusMinutes;
    let minutes = sessionLength;
    if (task) {
      const spent = (focusSecondsByTask(store.getState().sessions).get(task.id) ?? 0) / 60;
      const left = task.estimatedMinutes - spent;
      // Work in sessions of the preferred length, or less if the task needs less.
      minutes = left >= 5 ? Math.min(left, sessionLength) : sessionLength;
    }
    setFocusResult(null);
    timer.start(task?.id ?? null, minutes);
  }, []);

  // ---------- Task actions ----------

  const focusQuickAdd = useCallback(() => {
    if (["progress", "done"].includes(prefs.getState().view)) prefs.set({ view: "all" });
    setQuery("");
    // The input may not be on screen until the view has switched.
    requestAnimationFrame(() => document.getElementById("quick-add-input")?.focus());
  }, []);

  const undo = useCallback(() => {
    if (store.undo()) toasts.show("Undone.");
  }, []);

  const setView = useCallback((next) => {
    prefs.set({ view: next });
    setExpandedId(null);
    setDoneLimit(DONE_PAGE);
    window.scrollTo({ top: 0 });
  }, []);

  const actions = useMemo(
    () => ({
      toggle(id) {
        const task = store.getState().tasks[id];
        if (!task) return;
        const next = store.toggleTask(id);
        setExpandedId((current) => (current === id ? null : current));
        if (task.isCompleted) return;

        // Finishing the task you are timing ends the session and keeps its time.
        if (timer.getState()?.taskId === id) timer.stop();
        toasts.show(next ? `Done. Next one is due ${formatDue(next.dueDate).toLowerCase()}.` : "Task completed.", {
          tone: "success",
          action: { label: "Undo", run: () => store.undo() },
        });
      },
      expand: setExpandedId,
      update: (id, patch) => store.updateTask(id, patch),
      remove(id) {
        if (timer.getState()?.taskId === id) timer.stop();
        store.deleteTask(id);
        setExpandedId((current) => (current === id ? null : current));
        toasts.show("Task deleted.", { action: { label: "Undo", run: () => store.undo() } });
      },
      move: (id, previousId, nextId) => store.moveTask(id, previousId, nextId),
      focus: startFocus,
    }),
    [startFocus]
  );

  function addTask(fields) {
    // "#react" should join an existing "React" category, not start a second one.
    const existing = categoryNames.find((name) => name.toLowerCase() === fields.category.toLowerCase());
    const task = store.addTask(existing ? { ...fields, category: existing } : fields);
    setNewId(task.id);
    setTimeout(() => setNewId((current) => (current === task.id ? null : current)), 1600);

    const inView =
      view === "all" ||
      (view === "today" && task.dueDate != null && task.dueDate <= today) ||
      (view === "upcoming" && task.dueDate != null && task.dueDate > today);
    const inFilter = !activeCategory || task.category === activeCategory;
    if (!inView || !inFilter) {
      toasts.show(`Added to ${task.dueDate ? formatDayHeading(task.dueDate, today) : "All tasks"}.`, {
        tone: "success",
        action: {
          label: "Show",
          run: () => {
            setCategory(null);
            setView(task.dueDate && task.dueDate > today ? "upcoming" : task.dueDate ? "today" : "all");
          },
        },
      });
    }
  }

  const openTask = useCallback(
    (task) => {
      setQuery("");
      setCategory(null);
      setView(task.isCompleted ? "done" : "all");
      setExpandedId(task.id);
    },
    [setView]
  );

  // Bring a task into view when it is opened.
  useEffect(() => {
    if (!expandedId) return;
    document.querySelector(`[data-task-id="${expandedId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expandedId]);

  // ---------- Account actions ----------

  async function devSignIn(email) {
    finishSignIn(await auth.devSignIn(email, email.split("@")[0]));
  }

  async function leaveAccount() {
    timer.cancel();
    setFocusResult(null);
    await auth.signOut();
    store.clearAll();
    setDialog(null);
    toasts.show("Signed out. Nothing is left on this device.");
  }

  async function signOut() {
    if (auth.isSignedIn() && navigator.onLine !== false) {
      // Give waiting changes a moment to upload before deciding anything is at risk.
      await Promise.race([sync.syncNow(), new Promise((resolve) => setTimeout(resolve, 4000))]);
    }
    if (store.hasUnsynced()) setDialog("confirm-signout");
    else await leaveAccount();
  }

  async function deleteAccount() {
    try {
      await auth.deleteAccount();
    } catch (error) {
      toasts.show(`Could not delete the account: ${error.message}`, { tone: "danger" });
      return;
    }
    timer.cancel();
    setFocusResult(null);
    store.clearAll();
    setDialog(null);
    toasts.show("Your account and all its data have been deleted.");
  }

  function clearDevice() {
    timer.cancel();
    setFocusResult(null);
    store.clearAll();
    setDialog(null);
    toasts.show("This device has been erased.");
  }

  const openAccount = () => setDialog(session?.refreshToken ? "settings" : "signin");

  // ---------- Keyboard ----------

  // The key handler is attached once, so it reads the current values through a ref.
  const latest = useRef({});
  useEffect(() => {
    latest.current = { dialog, expandedId, query, undo, setView, actions, focusQuickAdd };
  });

  useEffect(() => {
    const focusedTaskId = () => document.activeElement?.closest?.("[data-task-id]")?.dataset.taskId ?? null;
    const rows = () => [...document.querySelectorAll(".task__open")];

    function moveFocus(step) {
      const all = rows();
      if (all.length === 0) return false;
      const index = all.indexOf(document.activeElement?.closest?.("[data-task-id]")?.querySelector(".task__open"));
      const next = index < 0 ? (step > 0 ? 0 : all.length - 1) : Math.min(all.length - 1, Math.max(0, index + step));
      all[next].focus();
      return true;
    }

    // Acts on the focused task, then moves focus to its neighbour since the row may leave the list.
    function onFocusedTask(run) {
      const id = focusedTaskId();
      if (!id) return false;
      const all = rows();
      const index = all.findIndex((row) => row.closest("[data-task-id]").dataset.taskId === id);
      const neighbour = (all[index + 1] ?? all[index - 1])?.closest("[data-task-id]").dataset.taskId;
      run(id);
      requestAnimationFrame(() => {
        const stillThere = document.querySelector(`[data-task-id="${id}"] .task__open`);
        (stillThere ?? document.querySelector(`[data-task-id="${neighbour}"] .task__open`))?.focus();
      });
      return true;
    }

    function onKeyDown(event) {
      const state = latest.current;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (mod && key === "k") {
        event.preventDefault();
        setDialog((current) => (current === "palette" ? null : "palette"));
        return;
      }
      // Open dialogs handle their own keys.
      if (state.dialog) return;

      const target = event.target;
      const typing =
        target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

      if (mod && key === "z" && !event.shiftKey && !typing) {
        event.preventDefault();
        state.undo();
        return;
      }
      if (typing || mod || event.altKey) return;
      // Inside an open task's form, letters belong to the form. It handles Escape itself.
      if (target instanceof HTMLElement && target.closest(".editor")) return;

      let handled = true;
      switch (key) {
        case "n":
          state.focusQuickAdd();
          break;
        case "/":
          searchRef.current?.focus();
          break;
        case "?":
          setDialog("shortcuts");
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
          state.setView(VIEWS[Number(key) - 1].id);
          break;
        case "j":
        case "ArrowDown":
          handled = moveFocus(1);
          break;
        case "k":
        case "ArrowUp":
          handled = moveFocus(-1);
          break;
        case "x":
          handled = onFocusedTask((id) => state.actions.toggle(id));
          break;
        case "f": {
          const task = store.getState().tasks[focusedTaskId()];
          handled = Boolean(task && !task.isCompleted);
          if (handled) state.actions.focus(task);
          break;
        }
        case "Delete":
          handled = onFocusedTask((id) => state.actions.remove(id));
          break;
        case "Escape":
          if (state.expandedId) setExpandedId(null);
          else if (state.query) setQuery("");
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---------- Command palette ----------

  const commands = useMemo(() => {
    const dark = theme === "dark";
    return [
      { id: "new", label: "New task", hint: "N", run: () => focusQuickAdd() },
      ...VIEWS.map((item, index) => ({ id: `view-${item.id}`, label: `Go to ${item.label}`, hint: String(index + 1), run: () => setView(item.id) })),
      { id: "focus", label: `Start a ${settings.focusMinutes}-minute focus session`, run: () => startFocus(null) },
      { id: "theme", label: dark ? "Switch to light theme" : "Switch to dark theme", run: toggleTheme },
      { id: "undo", label: "Undo last action", run: undo },
      { id: "settings", label: "Open settings", run: () => setDialog("settings") },
      { id: "shortcuts", label: "Show keyboard shortcuts", hint: "?", run: () => setDialog("shortcuts") },
      session?.refreshToken
        ? { id: "sync", label: "Sync now", run: () => sync.syncNow() }
        : { id: "signin", label: "Sign in to sync across devices", run: () => setDialog("signin") },
    ];
  }, [theme, toggleTheme, settings.focusMinutes, session?.refreshToken, setView, startFocus, undo, focusQuickAdd]);

  // ---------- Render ----------

  const focusTask = timerState?.taskId ? data.tasks[timerState.taskId] : null;
  const resultTask = focusResult?.taskId ? data.tasks[focusResult.taskId] : null;
  const firstRun = tasks.length === 0;
  // What is left to do: each open task's estimate minus the focus time already spent on it.
  const plannedMinutes = tasks.reduce(
    (sum, task) => (task.isCompleted ? sum : sum + Math.max(0, task.estimatedMinutes - (focusSeconds.get(task.id) ?? 0) / 60)),
    0
  );
  const hasPending = Object.keys(data.meta.dirtyTasks).length + Object.keys(data.meta.dirtySessions).length > 0;

  const subtitle = searching
    ? `${list.total} ${list.total === 1 ? "match" : "matches"}`
    : {
        today: `${weekdayName(today)}, ${formatDay(today, today)}`,
        upcoming: `${counts.upcoming} scheduled`,
        all: counts.all > 0 ? `${counts.all} open · ${formatMinutes(plannedMinutes)} planned` : "Nothing open",
        done: `${counts.done} finished`,
        progress: "Your week at a glance",
      }[view];

  function renderEmpty() {
    if (searching) {
      return (
        <EmptyState icon={<SearchIcon size={28} />} title={`No tasks match “${query.trim()}”`}>
          <button type="button" className="btn btn--soft" onClick={() => setQuery("")}>
            Clear search
          </button>
        </EmptyState>
      );
    }
    if (firstRun && view !== "done") {
      return (
        <EmptyState icon={<DoneIcon size={28} />} title="What do you want to learn?">
          <p>
            Type a task above and press Enter. Add a time, a topic or a date in the same line, then hit play to focus on it.
            Everything is saved on this device straight away. No account needed.
          </p>
          <button type="button" className="btn btn--soft" onClick={() => store.addSampleTasks(today)} data-testid="add-samples">
            Show me with a few examples
          </button>
        </EmptyState>
      );
    }
    if (activeCategory) {
      return (
        <EmptyState icon={<DoneIcon size={28} />} title={`Nothing here in ${activeCategory}`}>
          <button type="button" className="btn btn--soft" onClick={() => setCategory(null)}>
            Show all categories
          </button>
        </EmptyState>
      );
    }
    switch (view) {
      case "today":
        return (
          <EmptyState icon={<DoneIcon size={28} />} title="Nothing due today">
            <p>{counts.all > 0 ? "Pick something from your list, or enjoy the clear day." : "Add a task above to get going."}</p>
            {counts.all > 0 && (
              <button type="button" className="btn btn--soft" onClick={() => setView("all")}>
                See all {counts.all} open {counts.all === 1 ? "task" : "tasks"}
              </button>
            )}
          </EmptyState>
        );
      case "upcoming":
        return (
          <EmptyState icon={<DoneIcon size={28} />} title="Nothing scheduled ahead">
            <p>Give a task a date, like “friday” or “in 3 days”, and it shows up here.</p>
          </EmptyState>
        );
      case "done":
        return (
          <EmptyState icon={<DoneIcon size={28} />} title="Nothing finished yet">
            <p>Finished tasks collect here, grouped by day, as a record of what you have learned.</p>
          </EmptyState>
        );
      default:
        return (
          <EmptyState icon={<DoneIcon size={28} />} title="All clear">
            <p>Everything is done. Add the next thing whenever you are ready.</p>
          </EmptyState>
        );
    }
  }

  return (
    <div className="app" data-layout={isWide ? "wide" : "narrow"} data-has-bar={Boolean(timerState || focusResult) || undefined}>
      <a className="skip-link" href="#main">
        Skip to tasks
      </a>

      {isWide ? (
        <Sidebar
          view={view}
          counts={counts}
          categories={categories}
          category={activeCategory}
          session={session}
          status={status}
          pending={hasPending}
          onView={setView}
          onCategory={setCategory}
          theme={theme}
          onAccount={openAccount}
          onSettings={() => setDialog("settings")}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <TopBar
          session={session}
          status={status}
          pending={hasPending}
          theme={theme}
          onAccount={openAccount}
          onSettings={() => setDialog("settings")}
          onToggleTheme={toggleTheme}
        />
      )}

      <main className="main" id="main" tabIndex={-1}>
        <div className="main__inner">
          <header className="view-header">
            <div className="view-header__titles">
              <h1 data-testid="view-title">{searching ? "Search" : VIEW_LABELS[view]}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="view-header__tools">
              <label className="search">
                <SearchIcon size={16} />
                <span className="sr-only">Search tasks</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setQuery("");
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="Search"
                  data-testid="search"
                />
              </label>
              {(view === "all" || view === "today") && !searching && (
                <label className="sort">
                  <span className="sr-only">Sort by</span>
                  <select value={settings.sort} onChange={(event) => prefs.set({ sort: event.target.value })} data-testid="sort">
                    {SORTS.map((sort) => (
                      <option key={sort.id} value={sort.id}>
                        {sort.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </header>

          {showingList && view !== "done" && !searching && (
            <QuickAdd
              compact={!isWide}
              today={today}
              defaults={{
                category: activeCategory,
                estimatedMinutes: DEFAULT_ESTIMATE,
                dueDate: view === "today" ? today : view === "upcoming" ? addDays(today, 1) : null,
              }}
              onAdd={addTask}
            />
          )}

          {showingList && !isWide && categories.length > 0 && (
            <div className="chips chips--scroll" role="group" aria-label="Filter by category">
              {categories.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="chip"
                  aria-pressed={activeCategory === item.name}
                  onClick={() => setCategory(activeCategory === item.name ? null : item.name)}
                >
                  #{item.name} <span className="chip__count">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          {showingList && isWide && activeCategory && (
            <div className="filter-note">
              Showing <strong>#{activeCategory}</strong>
              <button type="button" className="icon-btn" onClick={() => setCategory(null)} aria-label="Clear category filter">
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {view === "today" && !searching && !activeCategory && counts.overdue > 0 && (
            <div className="notice" data-testid="overdue-notice">
              <span>
                {counts.overdue} overdue {counts.overdue === 1 ? "task" : "tasks"}
              </span>
              <button
                type="button"
                className="btn btn--soft btn--small"
                onClick={() => {
                  const moved = store.rescheduleOverdue(today);
                  toasts.show(`Moved ${moved} ${moved === 1 ? "task" : "tasks"} to today.`, {
                    action: { label: "Undo", run: () => store.undo() },
                  });
                }}
                data-testid="reschedule-overdue"
              >
                Move to today
              </button>
            </div>
          )}

          {!showingList ? (
            <Progress
              tasks={tasks}
              sessions={data.sessions}
              today={today}
              focusMinutes={settings.focusMinutes}
              canStartFocus={!timerState}
              onStartFocus={() => startFocus(null)}
            />
          ) : list.sections.length === 0 ? (
            renderEmpty()
          ) : (
            <>
              <TaskList
                sections={list.sections}
                today={today}
                expandedId={expandedId}
                newId={newId}
                focusingId={timerState?.taskId ?? null}
                focusSeconds={focusSeconds}
                categories={categoryNames}
                actions={actions}
              />
              {list.hidden > 0 && (
                <button type="button" className="btn btn--soft show-more" onClick={() => setDoneLimit((limit) => limit + DONE_PAGE)}>
                  Show {Math.min(DONE_PAGE, list.hidden)} more
                </button>
              )}
            </>
          )}
        </div>
      </main>

      {!isWide && <TabBar view={view} counts={counts} onView={setView} />}

      <FocusBar
        timerState={timerState}
        task={focusTask ?? resultTask}
        result={focusResult}
        onPause={() => timer.pause()}
        onResume={() => {
          unlockSound();
          timer.resume();
        }}
        onExtend={(minutes) => timer.extend(minutes)}
        onStop={() => timer.stop()}
        onDiscard={() => {
          timer.cancel();
          toasts.show("Focus session discarded.");
        }}
        onMarkDone={() => {
          if (resultTask) actions.toggle(resultTask.id);
          setFocusResult(null);
        }}
        onAgain={() => startFocus(resultTask && !resultTask.isCompleted ? resultTask : null)}
        onDismiss={() => setFocusResult(null)}
      />

      <Toasts />

      {dialog === "signin" && (
        <SignInDialog onClose={() => setDialog(null)} onDevSignIn={devSignIn} returning={Boolean(session && !session.refreshToken)} />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          onClose={() => setDialog(null)}
          onSignIn={() => setDialog("signin")}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
          onClearDevice={clearDevice}
          onShowShortcuts={() => setDialog("shortcuts")}
        />
      )}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === "palette" && (
        <CommandPalette commands={commands} tasks={tasks} onOpenTask={openTask} onClose={() => setDialog(null)} />
      )}
      {dialog === "confirm-signout" && (
        <Modal title="Sign out without syncing?" onClose={() => setDialog(null)} size="small" testId="confirm-signout">
          <div className="modal__body">
            <p>
              Some changes on this device have not reached your account yet. Signing out clears this device, so those changes
              would be lost.
            </p>
            <div className="settings__actions">
              <button type="button" className="btn btn--danger-solid" onClick={leaveAccount}>
                Sign out anyway
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setDialog(null)}>
                Stay signed in
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
