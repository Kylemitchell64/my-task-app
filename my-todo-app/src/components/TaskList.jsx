import { memo, useState } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDue, formatMinutes } from "../lib/dates.js";
import { PRIORITY_LABELS } from "../lib/parse.js";
import TaskEditor from "./TaskEditor.jsx";
import { CalendarIcon, CheckIcon, ClockIcon, GripIcon, NoteIcon, PlayIcon, RepeatIcon, TimerIcon } from "./icons.jsx";

function dueTone(task, today) {
  if (task.isCompleted || !task.dueDate) return undefined;
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  return undefined;
}

const TaskRow = memo(function TaskRow({
  task, today, expanded, isNew, focusing, focusedSeconds, categories, actions, sortable,
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !sortable || expanded,
  });

  const tone = dueTone(task, today);
  const style = sortable ? { transform: CSS.Translate.toString(transform), transition } : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="task"
      data-testid="task-item"
      data-task-id={task.id}
      data-done={task.isCompleted || undefined}
      data-expanded={expanded || undefined}
      data-dragging={isDragging || undefined}
      data-new={isNew || undefined}
      data-focusing={focusing || undefined}
    >
      <div className="task__row">
        {sortable && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="task__grip"
            aria-label={`Reorder ${task.title}`}
            {...attributes}
            {...listeners}
          >
            <GripIcon size={16} />
          </button>
        )}

        <button
          type="button"
          role="checkbox"
          aria-checked={task.isCompleted}
          aria-label={task.isCompleted ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className="check"
          data-priority={task.priority || undefined}
          data-testid="task-complete-checkbox"
          onClick={() => actions.toggle(task.id)}
        >
          <CheckIcon size={14} strokeWidth={3} />
        </button>

        <button
          type="button"
          className="task__open"
          aria-expanded={expanded}
          onClick={() => actions.expand(expanded ? null : task.id)}
          data-testid="task-open"
        >
          <span className="task__title" data-testid="task-title">
            {task.title}
          </span>
          <span className="task__meta">
            {task.dueDate && !task.isCompleted && (
              <span className="meta" data-tone={tone} data-testid="task-due">
                <CalendarIcon size={13} />
                {formatDue(task.dueDate, today)}
              </span>
            )}
            {task.repeat && (
              <span className="meta" title="Repeats">
                <RepeatIcon size={13} />
                <span className="sr-only">Repeats</span>
              </span>
            )}
            {task.category && (
              <span className="meta meta--category" data-testid="task-category">
                {task.category}
              </span>
            )}
            {task.priority > 0 && (
              <span className="meta meta--priority" data-priority={task.priority}>
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            <span className="meta" data-testid="task-time">
              {focusedSeconds > 0 ? <TimerIcon size={13} /> : <ClockIcon size={13} />}
              {focusedSeconds > 0
                ? `${formatMinutes(focusedSeconds / 60)} / ${formatMinutes(task.estimatedMinutes)}`
                : formatMinutes(task.estimatedMinutes)}
            </span>
            {task.description && (
              <span className="meta" title="Has notes">
                <NoteIcon size={13} />
                <span className="sr-only">Has notes</span>
              </span>
            )}
          </span>
        </button>

        {!task.isCompleted && (
          <button
            type="button"
            className="icon-btn task__focus"
            aria-label={focusing ? `Focusing on ${task.title}` : `Start a focus session on ${task.title}`}
            title={focusing ? "Focusing now" : "Start focus"}
            disabled={focusing}
            onClick={() => actions.focus(task)}
            data-testid="task-focus"
          >
            <PlayIcon size={15} />
          </button>
        )}
      </div>

      {expanded && (
        <TaskEditor
          task={task}
          today={today}
          categories={categories}
          focusedSeconds={focusedSeconds}
          isFocusing={focusing}
          onChange={(patch) => actions.update(task.id, patch)}
          onDelete={() => actions.remove(task.id)}
          onFocus={() => actions.focus(task)}
          onClose={() => actions.expand(null)}
        />
      )}
    </li>
  );
});

function Section({ section, shared }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [announcement, setAnnouncement] = useState("");
  const ids = section.tasks.map((t) => t.id);

  function onDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(ids, from, to);
    shared.actions.move(active.id, moved[to - 1] ?? null, moved[to + 1] ?? null);
    setAnnouncement(`Moved to position ${to + 1} of ${ids.length}`);
  }

  const rows = section.tasks.map((task) => (
    <TaskRow
      key={task.id}
      task={task}
      today={shared.today}
      expanded={shared.expandedId === task.id}
      isNew={shared.newId === task.id}
      focusing={shared.focusingId === task.id}
      focusedSeconds={shared.focusSeconds.get(task.id) ?? 0}
      categories={shared.categories}
      actions={shared.actions}
      sortable={section.reorderable}
    />
  ));

  return (
    <section className="section" data-tone={section.tone} aria-label={section.title ?? "Tasks"}>
      {section.title && (
        <h2 className="section__title">
          {section.title} <span className="section__count">{section.tasks.length}</span>
        </h2>
      )}
      {/* Always present so rows can use the sortable hook; dragging is switched off per row. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!section.reorderable}>
          <ul className="task-list" data-testid="task-list">
            {rows}
          </ul>
        </SortableContext>
      </DndContext>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}

export default function TaskList({ sections, ...shared }) {
  return sections.map((section) => <Section key={section.id} section={section} shared={shared} />);
}
