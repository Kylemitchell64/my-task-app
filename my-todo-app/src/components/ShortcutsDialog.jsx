import Modal from "./Modal.jsx";

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const SHORTCUTS = [
  { keys: ["N"], label: "New task" },
  { keys: ["/"], label: "Search" },
  { keys: [mod, "K"], label: "Command palette" },
  { keys: ["↑", "↓"], label: "Move between tasks", alt: ["K", "J"] },
  { keys: ["Enter"], label: "Open or close the selected task" },
  { keys: ["X"], label: "Mark the selected task done" },
  { keys: ["F"], label: "Start a focus session on the selected task" },
  { keys: ["Del"], label: "Delete the selected task" },
  { keys: [mod, "Z"], label: "Undo" },
  { keys: ["1", "…", "5"], label: "Today, Upcoming, All tasks, Done, Progress" },
  { keys: ["Esc"], label: "Close what is open" },
  { keys: ["?"], label: "Show this list" },
];

function Keys({ keys }) {
  return keys.map((key, index) => (key === "…" ? <span key={index}> … </span> : <kbd key={index}>{key}</kbd>));
}

export default function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} size="small" testId="shortcuts-dialog">
      <div className="modal__body">
        <dl className="shortcuts">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="shortcuts__row">
              <dt>{shortcut.label}</dt>
              <dd>
                <Keys keys={shortcut.keys} />
                {shortcut.alt && (
                  <>
                    <span className="shortcuts__or">or</span>
                    <Keys keys={shortcut.alt} />
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
