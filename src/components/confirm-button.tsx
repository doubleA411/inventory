"use client";

import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A destructive action that asks in the page instead of in a browser dialog.
 *
 * The app used `window.confirm` in ten places. It's the wrong tool here for
 * three reasons: the text is unstyled and easy to dismiss without reading, it
 * can't explain a consequence in more than one line, and on a phone it appears
 * detached from the thing being acted on. Worse, a browser dialog offers only
 * "OK" — a word that tells a non-technical user nothing about what is about to
 * happen. Here the confirm button repeats the verb ("Delete invoice"), and the
 * way out is labelled "Keep it" rather than "Cancel", which on a screen full of
 * invoices reads as an action of its own.
 *
 * Replaces the trigger in place rather than opening below it, so it stays put
 * inside a flex-wrap toolbar instead of pushing the layout around.
 */
export function ConfirmButton({
  label,
  icon,
  question,
  detail,
  confirmLabel,
  busyLabel,
  onConfirm,
  className,
  disabled,
  compact,
  triggerTitle,
}: {
  /** The resting button's text. */
  label: string;
  icon?: ReactNode;
  /** Asked when armed — a question, naming the thing. */
  question: string;
  /** What actually happens. Say the irreversible part plainly. */
  detail?: string;
  /** Repeats the verb; never "OK". */
  confirmLabel: string;
  busyLabel?: string;
  onConfirm: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
  /**
   * For an icon button inside a table row, where a full panel would blow the
   * row's height out. Drops the detail line and tightens the spacing — but
   * keeps real verbs on both buttons, because "Yes/No" in a row of twenty
   * identical rows is exactly the ambiguity this component exists to remove.
   */
  compact?: boolean;
  /** Rendered instead of `label` when resting — for icon-only triggers. */
  triggerTitle?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        className={cn("btn-ghost", className)}
        disabled={disabled || pending}
        title={triggerTitle}
        onClick={() => setArmed(true)}
      >
        {icon}
        {label}
      </button>
    );
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <button
          type="button"
          className="btn-ghost px-1.5 py-1 text-xs text-(--color-danger)"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await onConfirm();
              setArmed(false);
            })
          }
        >
          {pending ? (busyLabel ?? "Working…") : confirmLabel}
        </button>
        <button
          type="button"
          className="btn-ghost px-1.5 py-1 text-xs"
          disabled={pending}
          onClick={() => setArmed(false)}
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2">
      <span className="text-sm">
        <span className="font-medium">{question}</span>
        {detail && <span className="ml-1 text-xs text-(--color-muted)">{detail}</span>}
      </span>
      <button
        type="button"
        className="btn-outline text-(--color-danger)"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await onConfirm();
            setArmed(false);
          })
        }
      >
        {pending ? (busyLabel ?? "Working…") : confirmLabel}
      </button>
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() => setArmed(false)}
      >
        Keep it
      </button>
    </span>
  );
}
