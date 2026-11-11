import { useEffect } from "react";
import { useNow } from "../app/hooks.js";
import { formatClock, formatMinutes } from "../lib/dates.js";
import { elapsedSeconds, remainingSeconds } from "../lib/timer.js";
import { CheckIcon, CloseIcon, PauseIcon, PlayIcon, StopIcon } from "./icons.jsx";

const RADIUS = 15;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({ fraction }) {
  return (
    <svg className="ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle className="ring__track" cx="20" cy="20" r={RADIUS} />
      <circle
        className="ring__value"
        cx="20"
        cy="20"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)))}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

/**
 * The floating bar for the focus timer. While a session runs it shows the countdown and
 * controls; when one ends it offers the obvious next steps.
 */
export default function FocusBar({ timerState, task, result, onPause, onResume, onExtend, onStop, onDiscard, onMarkDone, onAgain, onDismiss }) {
  const running = timerState?.segmentStart != null;
  const now = useNow(running, 250);

  const remaining = timerState ? remainingSeconds(timerState, now) : 0;
  const title = timerState ? (task?.title ?? "Focus session") : null;

  // Show the countdown in the tab title so it is visible from other tabs.
  useEffect(() => {
    if (!timerState) return undefined;
    const original = "Learning Tracker";
    document.title = `${formatClock(remaining)} · ${title}`;
    return () => {
      document.title = original;
    };
  }, [timerState, remaining, title]);

  if (timerState) {
    const elapsed = elapsedSeconds(timerState, now);
    return (
      <div className="focus-bar" role="region" aria-label="Focus timer" data-testid="focus-bar" data-paused={!running || undefined}>
        <Ring fraction={elapsed / timerState.durationSec} />
        <div className="focus-bar__text">
          <span className="focus-bar__time" role="timer" aria-live="off" data-testid="focus-time">
            {formatClock(remaining)}
          </span>
          <span className="focus-bar__title">{running ? title : `Paused · ${title}`}</span>
        </div>
        <div className="focus-bar__actions">
          {running ? (
            <button type="button" className="icon-btn" onClick={onPause} aria-label="Pause" title="Pause" data-testid="focus-pause">
              <PauseIcon size={16} />
            </button>
          ) : (
            <button type="button" className="icon-btn" onClick={onResume} aria-label="Resume" title="Resume" data-testid="focus-resume">
              <PlayIcon size={16} />
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => onExtend(5)} title="Add five minutes">
            +5m
          </button>
          <button type="button" className="btn btn--soft btn--small" onClick={onStop} title="End now and keep the time" data-testid="focus-stop">
            <StopIcon size={13} /> Finish
          </button>
          <button type="button" className="icon-btn" onClick={onDiscard} aria-label="Discard this session" title="Discard" data-testid="focus-discard">
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    const minutes = formatMinutes(result.seconds / 60);
    return (
      <div className="focus-bar focus-bar--result" role="status" data-testid="focus-result">
        <span className="focus-bar__badge">
          <CheckIcon size={18} strokeWidth={3} />
        </span>
        <div className="focus-bar__text">
          <span className="focus-bar__headline">{minutes} of focus logged</span>
          <span className="focus-bar__title">{task ? task.title : "Nice work."}</span>
        </div>
        <div className="focus-bar__actions">
          {task && !task.isCompleted && (
            <button type="button" className="btn btn--primary btn--small" onClick={onMarkDone} data-testid="focus-mark-done">
              Mark done
            </button>
          )}
          <button type="button" className="btn btn--soft btn--small" onClick={onAgain} data-testid="focus-again">
            Go again
          </button>
          <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Dismiss">
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
