import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons.jsx";

/**
 * A dialog built on the browser's own <dialog>, which handles focus trapping,
 * the Escape key and screen-reader semantics for us.
 */
export default function Modal({ title, onClose, children, size = "medium", testId, hideHeader = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      data-size={size}
      data-testid={testId}
      aria-label={title}
      onClose={onClose}
      onCancel={(event) => {
        // Close through React so state stays the single source of truth.
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        // A press on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal__panel">
        {!hideHeader && (
          <header className="modal__header">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon size={18} />
            </button>
          </header>
        )}
        {children}
      </div>
    </dialog>
  );
}
