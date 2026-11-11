import { VIEWS } from "../lib/view.js";
import { syncSummary } from "../app/syncText.js";
import {
  AlertIcon, CalendarIcon, ChartIcon, CloudIcon, CloudOffIcon, DoneIcon, HashIcon, ListIcon, Logo, MoonIcon, SlidersIcon, SunIcon,
  SyncIcon,
} from "./icons.jsx";

const VIEW_ICONS = { today: SunIcon, upcoming: CalendarIcon, all: ListIcon, done: DoneIcon, progress: ChartIcon };

/** A compact picture of where the data is: this device only, synced, syncing, or stuck. */
export function SyncBadge({ status, session, pending, onClick }) {
  const signedIn = Boolean(session?.refreshToken);
  let Icon = CloudIcon;
  let tone = "ok";
  let label = "Synced";

  if (!session) {
    Icon = CloudOffIcon;
    tone = "muted";
    label = "Sign in to sync";
  } else if (!signedIn || status.phase === "signed-out") {
    Icon = AlertIcon;
    tone = "warn";
    label = "Sign in again";
  } else if (status.phase === "syncing" || (pending && status.phase === "idle")) {
    // A change that is queued but not sent yet is not "synced".
    Icon = SyncIcon;
    tone = "busy";
    label = "Syncing…";
  } else if (status.phase === "offline") {
    Icon = CloudOffIcon;
    tone = "muted";
    label = "Offline";
  } else if (status.phase === "error") {
    Icon = AlertIcon;
    tone = "warn";
    label = "Sync paused";
  }

  return (
    <button
      type="button"
      className="sync-badge"
      data-tone={tone}
      onClick={onClick}
      title={syncSummary(status, signedIn)}
      data-testid="sync-badge"
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

/** One click between light and dark. Settings also offers "follow the system". */
export function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      data-testid="theme-toggle"
    >
      {dark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  );
}

function Avatar({ user }) {
  if (user.avatarUrl) return <img className="avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  return (
    <span className="avatar" aria-hidden="true">
      {(user.name || user.email).slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Sidebar({
  view, counts, categories, category, session, status, pending, theme, onView, onCategory, onAccount, onSettings, onToggleTheme,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={30} />
        <span className="brand__name">Learning Tracker</span>
      </div>

      <nav aria-label="Views">
        <ul className="nav">
          {VIEWS.map((item) => {
            const ViewIcon = VIEW_ICONS[item.id];
            const count = counts[item.id];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="nav__item"
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => onView(item.id)}
                  data-testid={`nav-${item.id}`}
                >
                  <ViewIcon size={17} />
                  <span className="nav__label">{item.label}</span>
                  {item.id === "today" && counts.overdue > 0 ? (
                    <span className="nav__count" data-tone="danger" title={`${counts.overdue} overdue`}>
                      {count}
                    </span>
                  ) : (
                    count > 0 && item.id !== "done" && <span className="nav__count">{count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {categories.length > 0 && (
        <nav aria-label="Categories" className="sidebar__categories">
          <h2 className="sidebar__heading">Categories</h2>
          <ul className="nav">
            {categories.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  className="nav__item"
                  aria-pressed={category === item.name}
                  onClick={() => onCategory(category === item.name ? null : item.name)}
                >
                  <HashIcon size={15} />
                  <span className="nav__label">{item.name}</span>
                  <span className="nav__count">{item.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="sidebar__footer">
        <SyncBadge status={status} session={session} pending={pending} onClick={onAccount} />
        <div className="sidebar__account">
          {session && (
            <button type="button" className="account-btn" onClick={onSettings} title={session.user.email}>
              <Avatar user={session.user} />
              <span className="account-btn__name">{session.user.name}</span>
            </button>
          )}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings" title="Settings" data-testid="open-settings">
            <SlidersIcon size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Phone layout: the same views as a tab bar along the bottom. */
export function TabBar({ view, counts, onView }) {
  return (
    <nav className="tabbar" aria-label="Views">
      {VIEWS.map((item) => {
        const ViewIcon = VIEW_ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            className="tabbar__item"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onView(item.id)}
            data-testid={`tab-${item.id}`}
          >
            <span className="tabbar__icon">
              <ViewIcon size={20} />
              {item.id === "today" && counts.today > 0 && (
                <span className="tabbar__dot" data-tone={counts.overdue > 0 ? "danger" : undefined} />
              )}
            </span>
            <span>{item.id === "all" ? "All" : item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Phone layout: brand, sync state and settings along the top. */
export function TopBar({ session, status, pending, theme, onAccount, onSettings, onToggleTheme }) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo size={26} />
        <span className="brand__name">Learning Tracker</span>
      </div>
      <div className="topbar__actions">
        <SyncBadge status={status} session={session} pending={pending} onClick={onAccount} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings" data-testid="open-settings-mobile">
          {session ? <Avatar user={session.user} /> : <SlidersIcon size={18} />}
        </button>
      </div>
    </header>
  );
}
