import { useMemo, useState } from "react";
import { formatDue } from "../lib/dates.js";
import { parseQuickAdd } from "../lib/parse.js";
import { LIMITS } from "../lib/store.js";
import { CalendarIcon, ClockIcon, CloseIcon, FlagIcon, HashIcon, PlusIcon, RepeatIcon } from "./icons.jsx";

const TOKEN_ICONS = {
  category: HashIcon,
  priority: FlagIcon,
  estimate: ClockIcon,
  repeat: RepeatIcon,
  due: CalendarIcon,
};

/**
 * The one-line task entry. What you type is parsed as you type, and each piece it
 * understood shows as a chip you can dismiss if it guessed wrong.
 */
export default function QuickAdd({ today, defaults, compact, onAdd }) {
  const [text, setText] = useState("");
  const [ignored, setIgnored] = useState([]);
  const [focused, setFocused] = useState(false);

  const parsed = useMemo(() => parseQuickAdd(text, { today, ignore: ignored }), [text, today, ignored]);

  function reset() {
    setText("");
    setIgnored([]);
  }

  function submit(event) {
    event.preventDefault();
    if (!parsed.title) return;
    onAdd({
      title: parsed.title,
      category: parsed.category ?? defaults.category ?? "",
      priority: parsed.priority ?? 0,
      estimatedMinutes: parsed.estimatedMinutes ?? defaults.estimatedMinutes,
      dueDate: parsed.dueDate ?? defaults.dueDate ?? null,
      repeat: parsed.repeat ?? "",
    });
    reset();
  }

  function onChange(event) {
    const value = event.target.value;
    setText(value);
    if (!value) setIgnored([]);
  }

  const tokenLabel = (token) => (token.type === "due" ? formatDue(token.value, today) : token.label);

  return (
    <form className="quick-add" onSubmit={submit} data-focused={focused || undefined}>
      <div className="quick-add__row">
        <PlusIcon className="quick-add__plus" size={20} />
        <input
          id="quick-add-input"
          className="quick-add__input"
          type="text"
          value={text}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (text) reset();
              else event.currentTarget.blur();
            }
          }}
          placeholder={compact ? "Add a task…" : "Add a task…   e.g. Read the docs 30m #react tomorrow !high"}
          aria-label="Add a task"
          aria-describedby="quick-add-hint"
          maxLength={LIMITS.title + 80}
          autoComplete="off"
          enterKeyHint="done"
          data-testid="new-task-title"
        />
        <button type="submit" className="btn btn--primary quick-add__submit" disabled={!parsed.title} data-testid="create-button">
          Add
        </button>
      </div>

      {parsed.tokens.length > 0 && (
        <ul className="quick-add__tokens" aria-label="Understood from what you typed">
          {parsed.tokens.map((token) => {
            const TokenIcon = TOKEN_ICONS[token.type];
            return (
              <li key={token.type} className="token" data-type={token.type} data-testid={`token-${token.type}`}>
                <TokenIcon size={13} />
                <span>{tokenLabel(token)}</span>
                <button
                  type="button"
                  className="token__remove"
                  aria-label={`Keep “${token.text}” as part of the title`}
                  title="Keep as plain text"
                  // Keep focus in the text box so typing continues uninterrupted.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setIgnored((current) => [...current, token.type])}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Always in the page (never toggled) so the list below does not jump as focus moves. */}
      <p id="quick-add-hint" className="sr-only">
        You can add details in the same line, such as 30m for a time estimate, #react for a category, tomorrow for a due date,
        !high for priority, or daily to repeat.
      </p>
    </form>
  );
}
