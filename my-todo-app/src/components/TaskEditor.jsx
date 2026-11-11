import { useEffect, useId, useRef, useState } from "react";
import { addDays, formatMinutes, isKey, REPEAT_LABELS } from "../lib/dates.js";
import { PRIORITY_LABELS } from "../lib/parse.js";
import { LIMITS, REPEATS } from "../lib/store.js";
import { PlayIcon, TrashIcon } from "./icons.jsx";

const ESTIMATE_PRESETS = [15, 25, 45, 60, 90];

/** A text field that keeps its own draft and saves when you leave it or press Enter. */
function useDraft(value, save) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  return {
    // While you are not typing, show the stored value (it may change from another device).
    value: editing ? draft : value,
    onFocus: () => {
      setDraft(value);
      setEditing(true);
    },
    onChange: (event) => setDraft(event.target.value),
    onBlur: () => {
      setEditing(false);
      if (draft !== value) save(draft);
    },
  };
}

/** The expanded form under a task: everything about it, saved as you go. */
export default function TaskEditor({ task, today, categories, focusedSeconds, isFocusing, onChange, onDelete, onFocus, onClose }) {
  const id = useId();
  const title = useDraft(task.title, (value) => {
    if (value.trim()) onChange({ title: value });
  });
  const notes = useDraft(task.description, (value) => onChange({ description: value }));
  const category = useDraft(task.category, (value) => onChange({ category: value }));
  const estimate = useDraft(String(task.estimatedMinutes), (value) => {
    const minutes = Math.round(Number(value));
    if (minutes >= LIMITS.minEstimate && minutes <= LIMITS.maxEstimate) onChange({ estimatedMinutes: minutes });
  });

  // Grow the notes box to fit what is in it.
  const notesRef = useRef(null);
  useEffect(() => {
    const element = notesRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight + 2, 320)}px`;
  }, [notes.value]);

  const setDue = (dueDate) => onChange({ dueDate, ...(dueDate ? {} : { repeat: "" }) });

  const dueShortcuts = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "Next week", value: addDays(today, 7) },
  ];

  return (
    <div
      className="editor"
      data-testid="task-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          // Blur first so the field being typed in saves its draft.
          document.activeElement?.blur?.();
          onClose();
        }
      }}
    >
      <label className="sr-only" htmlFor={`${id}-title`}>
        Title
      </label>
      <input
        id={`${id}-title`}
        className="editor__title"
        type="text"
        maxLength={LIMITS.title}
        data-testid="edit-title"
        {...title}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />

      <label className="sr-only" htmlFor={`${id}-notes`}>
        Notes
      </label>
      <textarea
        id={`${id}-notes`}
        ref={notesRef}
        className="editor__notes"
        rows={2}
        maxLength={LIMITS.description}
        placeholder="Notes, links, what done looks like…"
        data-testid="edit-notes"
        {...notes}
      />

      <div className="editor__grid">
        <div className="field">
          <label htmlFor={`${id}-due`}>Due</label>
          <div className="field__row">
            <input
              id={`${id}-due`}
              type="date"
              value={task.dueDate ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "") setDue(null);
                else if (isKey(value)) setDue(value);
              }}
              data-testid="edit-due"
            />
            <div className="chips">
              {dueShortcuts.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  className="chip"
                  aria-pressed={task.dueDate === shortcut.value}
                  onClick={() => setDue(task.dueDate === shortcut.value ? null : shortcut.value)}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field__label" id={`${id}-priority`}>
            Priority
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${id}-priority`}>
            {PRIORITY_LABELS.map((label, value) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={task.priority === value}
                data-priority={value}
                onClick={() => onChange({ priority: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${id}-estimate`}>Time estimate</label>
          <div className="field__row">
            <span className="input-suffix">
              <input
                id={`${id}-estimate`}
                type="number"
                inputMode="numeric"
                min={LIMITS.minEstimate}
                max={LIMITS.maxEstimate}
                data-testid="edit-estimate"
                {...estimate}
              />
              <span aria-hidden="true">min</span>
            </span>
            <div className="chips">
              {ESTIMATE_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="chip"
                  aria-pressed={task.estimatedMinutes === minutes}
                  onClick={() => onChange({ estimatedMinutes: minutes })}
                >
                  {formatMinutes(minutes)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${id}-category`}>Category</label>
          <input
            id={`${id}-category`}
            type="text"
            list={`${id}-categories`}
            maxLength={LIMITS.category}
            placeholder="e.g. React, C#, Databases"
            data-testid="edit-category"
            {...category}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <datalist id={`${id}-categories`}>
            {categories.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor={`${id}-repeat`}>Repeat</label>
          <select
            id={`${id}-repeat`}
            value={task.repeat}
            onChange={(event) => {
              const repeat = event.target.value;
              // A repeating task needs a date to repeat from.
              onChange({ repeat, ...(repeat && !task.dueDate ? { dueDate: today } : {}) });
            }}
            data-testid="edit-repeat"
          >
            {REPEATS.map((rule) => (
              <option key={rule} value={rule}>
                {REPEAT_LABELS[rule]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="editor__footer">
        <span className="editor__stat">
          {focusedSeconds > 0
            ? `${formatMinutes(focusedSeconds / 60)} focused of ${formatMinutes(task.estimatedMinutes)} planned`
            : `No focus time yet · ${formatMinutes(task.estimatedMinutes)} planned`}
        </span>
        <div className="editor__actions">
          <button type="button" className="btn btn--ghost btn--danger" onClick={onDelete} data-testid="delete-button">
            <TrashIcon size={16} /> Delete
          </button>
          {!task.isCompleted && (
            <button type="button" className="btn btn--soft" onClick={onFocus} disabled={isFocusing} data-testid="editor-focus">
              <PlayIcon size={14} /> {isFocusing ? "Focusing…" : "Start focus"}
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={onClose} data-testid="editor-close">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
