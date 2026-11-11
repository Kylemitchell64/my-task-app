import { useMemo } from "react";
import { formatDay, formatMinutes } from "../lib/dates.js";
import { summarize } from "../lib/stats.js";
import { FlameIcon, PlayIcon } from "./icons.jsx";

/** Rounds the top of the scale up to a tidy number of minutes. */
function niceMax(minutes) {
  for (const step of [30, 60, 120, 180, 240]) if (minutes <= step) return step;
  return Math.ceil(minutes / 120) * 120;
}

function StatTile({ label, value, detail, icon, tone, testId }) {
  return (
    <div className="stat" data-tone={tone} data-testid={testId}>
      <span className="stat__label">
        {icon}
        {label}
      </span>
      <span className="stat__value">{value}</span>
      {detail && <span className="stat__detail">{detail}</span>}
    </div>
  );
}

function WeekChart({ week, today }) {
  const minutes = week.map((day) => Math.round(day.focusSeconds / 60));
  const top = niceMax(Math.max(...minutes, 1));
  const best = Math.max(...minutes);
  const ticks = [top, top / 2, 0];

  return (
    <figure className="chart">
      <figcaption className="chart__title">Focus time, last 7 days</figcaption>
      <div className="chart__body">
        <div className="chart__axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{tick === 0 ? "0" : formatMinutes(tick)}</span>
          ))}
        </div>
        <div className="chart__plot">
          <div className="chart__grid" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} />
            ))}
          </div>
          {best === 0 && <p className="chart__empty">No focus time in the last 7 days yet.</p>}
          <ol className="chart__bars">
            {week.map((day, index) => {
              const value = minutes[index];
              // Label only the bars the story is about: today and the best day.
              const labelled = value > 0 && (day.isToday || value === best);
              const summary = `${day.label}, ${formatDay(day.key, today)}: ${formatMinutes(value)} focused, ${day.done} ${day.done === 1 ? "task" : "tasks"} done`;
              return (
                <li key={day.key} className="chart__col" data-today={day.isToday || undefined} tabIndex={0} aria-label={summary}>
                  <div className="chart__slot">
                    {labelled && (
                      <span className="chart__value" style={{ bottom: `${(value / top) * 100}%` }} aria-hidden="true">
                        {formatMinutes(value)}
                      </span>
                    )}
                    <span
                      className="chart__bar"
                      style={{ height: `${(value / top) * 100}%` }}
                      data-empty={value === 0 || undefined}
                    />
                    <span className="chart__tip" role="presentation">
                      <strong>{formatMinutes(value)}</strong> focused
                      <br />
                      {day.done} {day.done === 1 ? "task" : "tasks"} done
                    </span>
                  </div>
                  <span className="chart__label" aria-hidden="true">
                    {day.isToday ? "Today" : day.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </figure>
  );
}

function CategoryBreakdown({ categories }) {
  const top = categories[0]?.seconds ?? 0;
  return (
    <section className="breakdown" aria-labelledby="breakdown-title">
      <h2 id="breakdown-title" className="chart__title">
        Where the time went, last 7 days
      </h2>
      <ul className="breakdown__list">
        {categories.slice(0, 6).map((category) => (
          <li key={category.name} className="breakdown__row">
            <span className="breakdown__name">{category.name}</span>
            <span className="breakdown__track">
              <span className="breakdown__bar" style={{ width: `${Math.max(2, (category.seconds / top) * 100)}%` }} />
            </span>
            <span className="breakdown__value">{formatMinutes(category.seconds / 60)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Progress({ tasks, sessions, today, focusMinutes, canStartFocus, onStartFocus }) {
  const summary = useMemo(() => summarize(tasks, Object.values(sessions), today), [tasks, sessions, today]);
  const isEmpty = summary.totalDone === 0 && summary.totalFocusSeconds === 0;

  const streakDetail =
    summary.streak === 0
      ? "Finish a task or focus session to start one"
      : summary.streakAtRisk
        ? "Do one thing today to keep it going"
        : "You've shown up today";

  return (
    <div className="progress" data-testid="progress">
      <div className="stats">
        <StatTile
          label="Streak"
          value={`${summary.streak} ${summary.streak === 1 ? "day" : "days"}`}
          detail={streakDetail}
          icon={<FlameIcon size={15} />}
          tone={summary.streak > 0 && !summary.streakAtRisk ? "accent" : undefined}
          testId="stat-streak"
        />
        <StatTile
          label="Focused today"
          value={formatMinutes(summary.focusTodaySeconds / 60)}
          detail={`${formatMinutes(summary.focusWeekSeconds / 60)} this week`}
          testId="stat-focus"
        />
        <StatTile
          label="Done today"
          value={String(summary.doneToday)}
          detail={`${summary.doneWeek} this week`}
          testId="stat-done"
        />
      </div>

      <WeekChart week={summary.week} today={today} />

      {summary.categories.length > 0 && <CategoryBreakdown categories={summary.categories} />}

      {/* The same numbers as a table, for screen readers and anyone who prefers one. */}
      <table className="sr-only">
        <caption>Focus time and tasks done, last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Minutes focused</th>
            <th scope="col">Tasks done</th>
          </tr>
        </thead>
        <tbody>
          {summary.week.map((day) => (
            <tr key={day.key}>
              <th scope="row">{formatDay(day.key, today)}</th>
              <td>{Math.round(day.focusSeconds / 60)}</td>
              <td>{day.done}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="progress__footer">
        <p>
          {isEmpty
            ? "Your week fills in as you finish tasks and run focus sessions."
            : `All time: ${formatMinutes(summary.totalFocusSeconds / 60)} focused, ${summary.totalDone} ${summary.totalDone === 1 ? "task" : "tasks"} done.`}
        </p>
        <button type="button" className="btn btn--soft" onClick={onStartFocus} disabled={!canStartFocus} data-testid="free-focus">
          <PlayIcon size={14} /> Start a {focusMinutes}-minute focus
        </button>
      </div>
    </div>
  );
}
