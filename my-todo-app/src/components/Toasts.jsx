import { useStoreState } from "../app/hooks.js";
import { toasts } from "../app/services.js";
import { CloseIcon } from "./icons.jsx";

export default function Toasts() {
  const items = useStoreState(toasts);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false" data-testid="toasts">
      {items.map((item) => (
        <div key={item.id} className="toast" data-tone={item.tone} role="status" data-testid="toast">
          <span className="toast__message">{item.message}</span>
          {item.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                item.action.run();
                toasts.dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          )}
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => toasts.dismiss(item.id)}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
