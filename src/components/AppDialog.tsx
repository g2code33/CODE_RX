import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * The Society's dialogs.
 *
 * Before this file the applications asked the browser for permission: 27 calls
 * to window.alert / confirm / prompt. Those boxes cannot be styled, cannot be
 * validated, ignore the site's own wording rules and look broken in the
 * installed app. This is their replacement, and it is deliberately small:
 *
 *   Modal        — one accessible dialog surface (Escape, focus moved in and
 *                  trapped, the page behind stops scrolling, focus returned).
 *   appDialog    — alert / confirm / prompt as promises, rendered by the host
 *                  below. Callers read almost exactly like the old calls:
 *                      if (!(await appDialog.confirm({...}))) return;
 *   AppDialogHost — mounted once in App, so any screen can use it.
 *
 * Colours are explicit hex values on purpose: the app shell remaps the slate
 * and emerald utility classes, and a dialog must look the same everywhere.
 */

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<Tone, { icon: typeof Info; ring: string; chip: string; iconColour: string; button: string }> = {
  info: { icon: Info, ring: '#15803d', chip: '#e8f5ee', iconColour: '#15803d', button: '#15803d' },
  success: { icon: CheckCircle2, ring: '#15803d', chip: '#e8f5ee', iconColour: '#15803d', button: '#15803d' },
  warning: { icon: AlertTriangle, ring: '#b45309', chip: '#fef3c7', iconColour: '#b45309', button: '#b45309' },
  danger: { icon: AlertTriangle, ring: '#be123c', chip: '#ffe4e6', iconColour: '#be123c', button: '#be123c' },
};

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * The behaviour every dialog must have, for the hand-rolled modals that keep
 * their own layout: Escape closes, the page behind stops scrolling, Tab stays
 * inside the panel, focus starts inside and returns to where it came from.
 *
 *   const panel = useRef<HTMLDivElement>(null);
 *   useModalBehaviour(isOpen, close, panel);
 */
export const useModalBehaviour = (open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) => {
  // The close handler changes on every render of the caller; keeping it in a ref
  // means the dialog does not re-lock the page or steal focus again each time.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const restoreTo = (document.activeElement as HTMLElement) || null;
    const previousOverflow = document.body.style.overflow;
    // The page behind a dialog must not scroll under it (mobile especially).
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (!focusable.length) {
        event.preventDefault();
        panel.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const moveFocus = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]')
        || panel.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button')
        || panel.current;
      target?.focus?.();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.clearTimeout(moveFocus);
      document.body.style.overflow = previousOverflow;
      restoreTo?.focus?.();
    };
  }, [open, panel]);
};

export const Modal = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
  labelledBy?: string;
}) => {
  const panel = useRef<HTMLDivElement>(null);
  useModalBehaviour(open, onClose, panel);

  // Server rendering and any non-browser context simply has no dialog surface.
  if (!open || typeof document === 'undefined') return null;

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={closeOnBackdrop ? onClose : undefined}
        className={`fixed inset-0 bg-[#04120b]/70 ${closeOnBackdrop ? 'cursor-default' : 'cursor-default'}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'app-dialog-title'}
        tabIndex={-1}
        className={`relative my-auto w-full ${widths[size]} overflow-hidden rounded-2xl bg-white shadow-[0_28px_90px_rgba(2,20,12,0.45)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] px-6 py-5">
          <div className="min-w-0">
            <h2 id={labelledBy || 'app-dialog-title'} className="text-lg font-black text-[#0f172a]">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-[#475569]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#475569] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803d] focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="px-6 py-5">{children}</div> : null}
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8f0] bg-[#f8fafc] px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
};

// ---------------------------------------------------------------------------
// appDialog — alert / confirm / prompt as promises
// ---------------------------------------------------------------------------

type PromptOptions = {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
  /** Reject empty submissions with this message instead of accepting them. */
  requiredMessage?: string;
  tone?: Tone;
};

type Request = {
  id: number;
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: Tone;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  requiredMessage?: string;
  resolve: (value: any) => void;
};

let queue: Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => queue;

const push = (request: Omit<Request, 'id' | 'resolve' | 'cancelLabel' | 'confirmLabel' | 'tone'> & Partial<Request>) =>
  new Promise<any>((resolve) => {
    const complete = (value: any) => {
      queue = queue.filter((entry) => entry.id !== id);
      emit();
      resolve(value);
    };
    const id = nextId++;
    queue = [...queue, {
      id,
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
      tone: 'info',
      ...request,
      resolve: complete,
    } as Request];
    emit();
  });

export const appDialog = {
  alert: (options: { title: string; message?: string; confirmLabel?: string; tone?: Tone }) =>
    push({ kind: 'alert', title: options.title, message: options.message, confirmLabel: options.confirmLabel || 'OK', tone: options.tone || 'info' }) as Promise<void>,
  confirm: (options: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; tone?: Tone }) =>
    push({
      kind: 'confirm', title: options.title, message: options.message,
      confirmLabel: options.confirmLabel || 'Confirm', cancelLabel: options.cancelLabel || 'Cancel', tone: options.tone || 'warning',
    }) as Promise<boolean>,
  prompt: (options: PromptOptions) =>
    push({
      kind: 'prompt', title: options.title, message: options.message, tone: options.tone || 'info',
      label: options.label, placeholder: options.placeholder, initialValue: options.initialValue,
      multiline: options.multiline, requiredMessage: options.requiredMessage, confirmLabel: options.confirmLabel || 'Save',
    }) as Promise<string | null>,
};

// ---------------------------------------------------------------------------
// The host
// ---------------------------------------------------------------------------

const primaryButton = 'rounded-xl px-4 py-2.5 text-sm font-black text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#15803d]';
const secondaryButton = 'rounded-xl border border-[#cbd5e1] px-4 py-2.5 text-sm font-black text-[#334155] transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803d] focus-visible:ring-offset-2';

export const AppDialogHost = () => {
  const requests = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState('');
  const current = requests[0];
  const currentId = current?.id;

  useEffect(() => {
    setValue(current?.kind === 'prompt' ? current.initialValue || '' : '');
    setError('');
  }, [currentId, current?.kind, current?.initialValue]);

  const close = useCallback((result: any) => { current?.resolve(result); }, [current]);

  if (!current) return null;

  const tone = TONE_STYLES[current.tone] || TONE_STYLES.info;
  const ToneIcon = tone.icon;

  const submitPrompt = () => {
    if (current.kind !== 'prompt') return;
    const trimmed = value.trim();
    if (current.requiredMessage && !trimmed) {
      setError(current.requiredMessage);
      return;
    }
    close(trimmed);
  };

  return (
    <Modal
      open
      onClose={() => close(current.kind === 'confirm' ? false : current.kind === 'prompt' ? null : undefined)}
      title={current.title}
      description={current.message}
      size={current.multiline ? 'lg' : 'md'}
      labelledBy={`app-dialog-title-${current.id}`}
      closeOnBackdrop={current.kind !== 'prompt'}
      footer={
        current.kind === 'alert' ? (
          <button type="button" data-autofocus onClick={() => close(undefined)} className={primaryButton} style={{ background: tone.button }}>
            {current.confirmLabel}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => close(current.kind === 'prompt' ? null : false)}
              className={secondaryButton}
            >
              {current.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => (current.kind === 'prompt' ? submitPrompt() : close(true))}
              className={primaryButton}
              style={{ background: tone.button }}
            >
              {current.confirmLabel}
            </button>
          </>
        )
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: tone.chip, color: tone.iconColour }}>
          <ToneIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {current.kind === 'prompt' ? (
            <div>
              {current.label ? (
                <label htmlFor={`app-dialog-input-${current.id}`} className="mb-1.5 block text-[12px] font-black uppercase tracking-[0.12em] text-[#334155]">
                  {current.label}
                </label>
              ) : null}
              {current.multiline ? (
                <textarea
                  id={`app-dialog-input-${current.id}`}
                  data-autofocus
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setError(''); }}
                  placeholder={current.placeholder}
                  className="min-h-32 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-3 text-sm text-[#0f172a] outline-none transition placeholder:text-[#64748b] focus:border-[#15803d] focus:ring-4 focus:ring-[#16a34a]/15"
                />
              ) : (
                <input
                  id={`app-dialog-input-${current.id}`}
                  data-autofocus
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setError(''); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitPrompt(); } }}
                  placeholder={current.placeholder}
                  className="w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-3 text-sm text-[#0f172a] outline-none transition placeholder:text-[#64748b] focus:border-[#15803d] focus:ring-4 focus:ring-[#16a34a]/15"
                />
              )}
              {error ? <p className="mt-2 text-sm font-bold text-[#be123c]">{error}</p> : null}
            </div>
          ) : (
            <p className="text-sm leading-6 text-[#475569]">
              {current.kind === 'confirm' ? 'This action is recorded against your account.' : 'Press OK to continue.'}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
