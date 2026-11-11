// Short messages that appear at the bottom of the screen, optionally with one action.

export function createToasts() {
  let items = [];
  let nextId = 1;
  const listeners = new Set();
  const timers = new Map();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  function dismiss(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    items = items.filter((item) => item.id !== id);
    emit();
  }

  /**
   * @param {string} message
   * @param {{ tone?: "info"|"success"|"danger", duration?: number,
   *           action?: { label: string, run: () => void } }} options
   */
  function show(message, { tone = "info", duration = 5000, action } = {}) {
    const id = nextId++;
    // Keep the stack short: the newest three are enough.
    for (const old of items.slice(0, Math.max(0, items.length - 2))) dismiss(old.id);
    items = [...items, { id, message, tone, action }];
    timers.set(id, setTimeout(() => dismiss(id), duration));
    emit();
    return id;
  }

  return {
    getState: () => items,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show,
    dismiss,
  };
}
