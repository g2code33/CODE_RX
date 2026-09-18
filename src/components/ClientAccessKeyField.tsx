import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ACCESS_KEY_CODE_LENGTH, ACCESS_KEY_GROUP_LENGTH, ACCESS_KEY_GROUPS, ACCESS_KEY_PREFIX } from '../lib/accessKey';

/**
 * The three fixed key boxes.
 *
 * Why boxes rather than one field: the client reads the key off a letter in
 * three groups, so each group gets its own slot that never moves, never
 * re-flows and never reacts to what is typed next to it. `CRX` is printed as a
 * fixed prefix — it is not an input, so it can never interfere with the
 * characters the client is entering.
 *
 * Typing fills a box and moves on; Backspace steps back; the arrow keys walk
 * between boxes; a pasted key (in any shape, with or without the CRX prefix) is
 * distributed across the boxes at once and, because the boxes are then full,
 * verified immediately by the screen above.
 */
export const ClientAccessKeyField = ({
  boxes,
  onChange,
  onPasteKey,
  disabled = false,
  invalid = false,
  complete = false,
  describedBy,
  autoFocus = false,
}: {
  /** Exactly three values, one per box. */
  boxes: string[];
  onChange: (boxes: string[]) => void;
  /** A pasted key, already reduced to its compact body by the caller. */
  onPasteKey?: (body: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  complete?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusBox = (index: number, atEnd = true) => {
    const input = refs.current[index];
    if (!input) return;
    input.focus();
    if (atEnd) {
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        /* some embedded browsers refuse selection APIs on text inputs */
      }
    }
  };

  const writeBoxes = (next: string[], focusIndex?: number) => {
    onChange(next);
    if (focusIndex !== undefined) focusBox(focusIndex);
  };

  /** Keeps the letters, upper-cases them, and lets the next box take any overflow. */
  const handleInput = (index: number, raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const next = [...boxes];
    next[index] = cleaned.slice(0, ACCESS_KEY_GROUP_LENGTH);
    // The browser fills this box up to its limit; anything past it belongs to
    // the boxes after it, so a fast typist is never blocked mid-key.
    let overflow = cleaned.slice(ACCESS_KEY_GROUP_LENGTH);
    let cursor = index;
    while (overflow.length > 0 && cursor < ACCESS_KEY_GROUPS - 1) {
      cursor += 1;
      const combined = (next[cursor] || '') + overflow;
      next[cursor] = combined.slice(0, ACCESS_KEY_GROUP_LENGTH);
      overflow = combined.slice(ACCESS_KEY_GROUP_LENGTH);
    }
    const advance = next[index].length === ACCESS_KEY_GROUP_LENGTH && index < ACCESS_KEY_GROUPS - 1;
    onChange(next);
    if (advance) focusBox(index + 1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const input = event.currentTarget;
    if (event.key === 'Backspace' && !input.value && index > 0) {
      event.preventDefault();
      const next = [...boxes];
      next[index - 1] = next[index - 1].slice(0, -1);
      writeBoxes(next, index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && (input.selectionStart ?? 0) === 0 && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === 'ArrowRight' && (input.selectionStart ?? 0) >= input.value.length && index < ACCESS_KEY_GROUPS - 1) {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!text.trim() || !onPasteKey) return;
    event.preventDefault();
    onPasteKey(text);
  };

  return (
    <div className="flex items-stretch justify-center gap-1.5 sm:gap-2">
      {/* The prefix is fixed: it is a label, not a field, so it cannot compete
          with the characters the client is typing. */}
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-xl border-2 border-slate-200 bg-slate-100 px-2.5 font-mono text-base font-bold tracking-[0.05em] text-slate-500 sm:px-3.5 sm:text-xl"
      >
        {ACCESS_KEY_PREFIX}
      </span>
      {Array.from({ length: ACCESS_KEY_GROUPS }, (_, index) => {
        const isCode = index === ACCESS_KEY_GROUPS - 1;
        const filled = (boxes[index] || '').length === ACCESS_KEY_GROUP_LENGTH;
        return (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={boxes[index] || ''}
            onChange={(event) => handleInput(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={handlePaste}
            onFocus={(event) => {
              const end = event.currentTarget.value.length;
              try {
                event.currentTarget.setSelectionRange(end, end);
              } catch {
                /* selection APIs are optional */
              }
            }}
            disabled={disabled}
            maxLength={ACCESS_KEY_GROUP_LENGTH}
            inputMode="text"
            enterKeyHint={index === ACCESS_KEY_GROUPS - 1 ? 'go' : 'next'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={isCode
              ? `Project code, group ${index + 1} of ${ACCESS_KEY_GROUPS}, ${ACCESS_KEY_CODE_LENGTH} letters`
              : `Access key, group ${index + 1} of ${ACCESS_KEY_GROUPS}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={`w-full min-w-0 rounded-xl border-2 bg-slate-50 py-4 text-center font-mono text-lg font-bold uppercase tracking-[0.14em] text-slate-900 shadow-inner outline-none transition placeholder:text-slate-300 disabled:opacity-60 sm:text-xl ${
              invalid
                ? 'border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:bg-white'
                : complete && filled
                  ? 'border-emerald-300 bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50'
                  : 'border-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50'
            }`}
          />
        );
      })}
    </div>
  );
};
