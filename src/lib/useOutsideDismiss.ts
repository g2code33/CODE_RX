import { useEffect, useRef } from 'react';

/**
 * Close an open menu/drawer when the user clicks (or taps) ANYWHERE else.
 *
 * Every hamburger in this app opens a panel that covers part of the page, and
 * until now the only way to close it was to hit its own ✕ or its toggle again.
 * This hook makes the whole page an implicit "close" target:
 *
 *   useOutsideDismiss(open, () => setOpen(false), '.my-nav, .my-toggle');
 *
 * `ignoreSelector` protects the panel itself and its toggle — a click inside
 * the menu (or on the button that opened it) is not an "outside" click, so the
 * toggle keeps working as a toggle instead of closing and re-opening.
 *
 * It listens in the CAPTURE phase with pointerdown/mousedown/touchstart so the
 * panel closes even when the element underneath stops propagation, and Escape
 * closes it too. The listener only exists while the panel is open.
 */
export const useOutsideDismiss = (
  open: boolean,
  onDismiss: () => void,
  ignoreSelector?: string,
) => {
  // Keep the latest callback without re-binding listeners on every render.
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) => {
      if (!ignoreSelector) return false;
      const element = target as HTMLElement | null;
      if (!element || typeof element.closest !== 'function') return false;
      try { return Boolean(element.closest(ignoreSelector)); } catch { return false; }
    };
    const onPointer = (event: Event) => {
      if (isInside(event.target)) return;
      handler.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler.current();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('touchstart', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('touchstart', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ignoreSelector]);
};
