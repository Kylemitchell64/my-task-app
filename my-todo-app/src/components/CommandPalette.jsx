import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { SearchIcon } from "./icons.jsx";

const MAX_RESULTS = 8;

/**
 * Ctrl/Cmd+K: type to jump to a task or run a command without leaving the keyboard.
 * `commands` are { id, label, hint?, run }. `tasks` are searched by title.
 */
export default function CommandPalette({ commands, tasks, onOpenTask, onClose }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchedCommands = commands.filter((command) => !needle || command.label.toLowerCase().includes(needle));
    const matchedTasks = needle
      ? tasks
          .filter((task) => task.title.toLowerCase().includes(needle))
          .slice(0, MAX_RESULTS)
          .map((task) => ({
            id: `task-${task.id}`,
            label: task.title,
            hint: task.isCompleted ? "Done" : "Task",
            run: () => onOpenTask(task),
          }))
      : [];
    return [...matchedTasks, ...matchedCommands].slice(0, needle ? MAX_RESULTS + 4 : 12);
  }, [query, commands, tasks, onOpenTask]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function run(result) {
    onClose();
    result.run();
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(results.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[index]) run(results[index]);
    }
  }

  return (
    <Modal title="Command palette" onClose={onClose} size="palette" hideHeader testId="palette">
      <div className="palette">
        <div className="palette__search">
          <SearchIcon size={18} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search tasks or type a command…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[index] ? `palette-${results[index].id}` : undefined}
            aria-label="Search tasks or type a command"
            autoComplete="off"
            data-testid="palette-input"
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-results" ref={listRef} className="palette__results" role="listbox" aria-label="Results">
          {results.map((result, position) => (
            <li
              key={result.id}
              id={`palette-${result.id}`}
              role="option"
              aria-selected={position === index}
              className="palette__item"
              onMouseMove={() => setIndex(position)}
              onClick={() => run(result)}
            >
              <span className="palette__label">{result.label}</span>
              {result.hint && <span className="palette__hint">{result.hint}</span>}
            </li>
          ))}
          {results.length === 0 && <li className="palette__empty">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </Modal>
  );
}
