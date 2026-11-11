import { useRef, useState } from "react";
import { useStoreState, useSyncStatus } from "../app/hooks.js";
import { auth, prefs, store, sync, toasts } from "../app/services.js";
import { syncSummary } from "../app/syncText.js";
import Modal from "./Modal.jsx";
import { DownloadIcon, KeyboardIcon, LogOutIcon, SyncIcon, UploadIcon } from "./icons.jsx";

const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function Toggle({ label, description, checked, onChange, testId }) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} data-testid={testId} />
    </label>
  );
}

export default function SettingsDialog({ onClose, onSignIn, onSignOut, onDeleteAccount, onShowShortcuts, onClearDevice }) {
  const settings = useStoreState(prefs);
  const session = useStoreState(auth);
  const status = useSyncStatus(sync);
  const fileRef = useRef(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(session?.refreshToken);

  function exportData() {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `learning-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("That file is too large to be a Learning Tracker export.");
      const result = store.importData(JSON.parse(await file.text()));
      toasts.show(
        result.tasks + result.sessions === 0
          ? "Nothing new in that file."
          : `Imported ${result.tasks} ${result.tasks === 1 ? "task" : "tasks"} and ${result.sessions} focus ${result.sessions === 1 ? "session" : "sessions"}.`,
        { tone: "success" }
      );
    } catch (error) {
      toasts.show(error instanceof SyntaxError ? "That file is not valid JSON." : error.message, { tone: "danger" });
    }
  }

  async function enableNotifications(enabled) {
    if (!enabled) {
      prefs.set({ notifications: false });
      return;
    }
    if (typeof Notification === "undefined") {
      toasts.show("This browser does not support notifications.", { tone: "danger" });
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") prefs.set({ notifications: true });
    else toasts.show("Notifications are blocked for this site in your browser settings.", { tone: "danger" });
  }

  async function run(action) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <Modal title="Settings" onClose={onClose} testId="settings-dialog">
      <div className="modal__body settings">
        <section>
          <h3>Account</h3>
          {session ? (
            <div className="account">
              {session.user.avatarUrl ? (
                <img className="avatar avatar--large" src={session.user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="avatar avatar--large" aria-hidden="true">
                  {(session.user.name || session.user.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="account__text">
                <strong>{session.user.name}</strong>
                <span>{session.user.email}</span>
                <span className="account__status" data-testid="sync-summary">
                  {syncSummary(status, signedIn)}
                </span>
              </div>
            </div>
          ) : (
            <p className="settings__note" data-testid="sync-summary">
              You are not signed in. Everything is saved in this browser and nowhere else. Sign in to back it up and use it on
              other devices.
            </p>
          )}
          <div className="settings__actions">
            {!signedIn && (
              <button type="button" className="btn btn--primary" onClick={onSignIn} data-testid="settings-signin">
                {session ? "Sign in again" : "Sign in to sync"}
              </button>
            )}
            {signedIn && (
              <button type="button" className="btn btn--soft" onClick={() => sync.syncNow()} disabled={status.phase === "syncing"}>
                <SyncIcon size={15} /> Sync now
              </button>
            )}
            {session && (
              <button type="button" className="btn btn--ghost" onClick={onSignOut} data-testid="signout">
                <LogOutIcon size={15} /> Sign out
              </button>
            )}
          </div>
        </section>

        <section>
          <h3>Appearance</h3>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme.id}
                onClick={() => prefs.set({ theme: theme.id })}
                data-testid={`theme-${theme.id}`}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Focus timer</h3>
          <label className="field field--inline">
            <span>Default length when a task has no estimate to use</span>
            <span className="input-suffix">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={180}
                value={settings.focusMinutes}
                onChange={(event) => prefs.set({ focusMinutes: event.target.value })}
              />
              <span aria-hidden="true">min</span>
            </span>
          </label>
          <Toggle label="Chime when a session ends" checked={settings.sound} onChange={(sound) => prefs.set({ sound })} testId="toggle-sound" />
          <Toggle
            label="Notify me when a session ends"
            description="Useful when this tab is in the background."
            checked={settings.notifications}
            onChange={enableNotifications}
            testId="toggle-notifications"
          />
        </section>

        <section>
          <h3>Your data</h3>
          <p className="settings__note">Your tasks belong to you. Download them any time as a plain JSON file.</p>
          <div className="settings__actions">
            <button type="button" className="btn btn--soft" onClick={exportData} data-testid="export">
              <DownloadIcon size={15} /> Export
            </button>
            <button type="button" className="btn btn--soft" onClick={() => fileRef.current?.click()}>
              <UploadIcon size={15} /> Import
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importData} data-testid="import-file" />
            <button type="button" className="btn btn--ghost" onClick={onShowShortcuts}>
              <KeyboardIcon size={15} /> Keyboard shortcuts
            </button>
          </div>
        </section>

        <section className="settings__danger">
          <h3>Danger zone</h3>
          {signedIn ? (
            confirming === "account" ? (
              <div className="confirm" role="alertdialog" aria-label="Confirm deleting your account">
                <p>This permanently deletes your account and every task and focus session in it, on all devices. It cannot be undone.</p>
                <div className="settings__actions">
                  <button type="button" className="btn btn--danger-solid" disabled={busy} onClick={() => run(onDeleteAccount)} data-testid="confirm-delete-account">
                    {busy ? "Deleting…" : "Delete everything"}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn--ghost btn--danger" onClick={() => setConfirming("account")} data-testid="delete-account">
                Delete my account
              </button>
            )
          ) : confirming === "device" ? (
            <div className="confirm" role="alertdialog" aria-label="Confirm erasing this device">
              <p>This erases every task and focus session saved in this browser. It cannot be undone.</p>
              <div className="settings__actions">
                <button type="button" className="btn btn--danger-solid" onClick={() => run(onClearDevice)} data-testid="confirm-clear-device">
                  Erase everything
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn--ghost btn--danger" onClick={() => setConfirming("device")} data-testid="clear-device">
              Erase all data on this device
            </button>
          )}
        </section>

        <footer className="settings__about">
          Learning Tracker · built by{" "}
          <a href="https://kylehmitchell.com" target="_blank" rel="noreferrer">
            Kyle Mitchell
          </a>{" "}
          ·{" "}
          <a href="https://github.com/Kylemitchell64/my-task-app" target="_blank" rel="noreferrer">
            Source
          </a>
        </footer>
      </div>
    </Modal>
  );
}
