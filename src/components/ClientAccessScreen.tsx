import { FormEvent, useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardPaste, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  ACCESS_KEY_BODY_LENGTH,
  ACCESS_KEY_PLACEHOLDER,
  formatAccessKey,
  messageForFailure,
  validateAccessKey,
} from '../lib/accessKey';
import { clientContact, clientSupportMailto, type ClientContact } from '../lib/linkAccess';
import { ClientPortalError } from '../lib/cloudflare';
import { ClientSupportContact } from './ClientSupportContact';

interface ClientAccessScreenProps {
  /** Exchanges the raw access key for a client session. */
  onSubmit: (accessKey: string) => Promise<void>;
  /** A message carried over from an ended session or a failed link, if any. */
  notice?: string | null;
  /** Small label above the heading. Defaults to CODE Rx SOCIETY. */
  eyebrow?: string;
  /** Heading override, used when the screen is reached through a link. */
  heading?: string;
  /** One line of context under the heading. */
  helper?: string;
  /** Icon shown beside the notice when it is not an error. */
  noticeIcon?: ReactNode;
  /** Offered when the screen was reached from a link the client can drop. */
  onAbandon?: () => void;
  abandonLabel?: string;
  /** Published site contact details; defaults to the society's own values. */
  contact?: ClientContact;
}

/** Longest text the field accepts: the server's own maximum body plus separators. */
const MAX_TYPED_LENGTH = 40;

/**
 * CLIENT ACCESS — the entry point of the client portal.
 *
 * The raw access key never leaves this component: it is held in state only for
 * the moment it takes to exchange it for a session, then cleared, and it is
 * never written to localStorage, sessionStorage, a URL or an analytics sink.
 *
 * The field is a plain text input that is never rewritten under the caret:
 * characters are only tidied into the canonical `CRX-XXXX-XXXX-XXXX-XXXX`
 * shape when the client leaves the field, pastes a key or submits. Guidance is
 * live, and a complete pasted key is verified immediately.
 */
export const ClientAccessScreen = ({
  onSubmit, notice, eyebrow, heading, helper, noticeIcon, onAbandon, abandonLabel, contact,
}: ClientAccessScreenProps) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  // A notice (an ended session, a failed link) is shown until the client starts
  // editing the field. It is derived rather than copied into state through an
  // effect, so the very first render already shows the correct state.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shownError = error ?? (noticeDismissed ? null : notice ?? null);
  const details = contact ?? clientContact(null);

  const formatted = formatAccessKey(value);
  const ambiguous = formatted.ignored;
  const filled = Math.min(formatted.body.length, ACCESS_KEY_BODY_LENGTH);
  const ready = validateAccessKey(value).ok;
  const showPasteButton = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * What the field shows while the client types: exactly their characters, in
   * the order they entered them. Grouping and upper-casing wait for blur, so
   * the caret never jumps and nothing silently disappears mid-word.
   */
  const handleChange = (raw: string) => {
    const next = raw.replace(/[^A-Za-z0-9-]/g, '').slice(0, MAX_TYPED_LENGTH);
    setValue(next);
    setPasteHint(null);
    if (error) setError(null);
    if (notice) setNoticeDismissed(true);
  };

  /** Tidies the key into its canonical groups once the field loses focus. */
  const handleBlur = () => {
    setFocused(false);
    setTouched(true);
    const parsed = formatAccessKey(value);
    // Never drop the characters the client typed: when the key contains a glyph
    // a key can never contain, keep it visible and let the guidance explain.
    if (!parsed.ignored.length && parsed.display !== value) setValue(parsed.display);
  };

  const submitKey = async (raw: string) => {
    if (submitting) return;
    const validation = validateAccessKey(raw);
    if (!validation.ok) {
      setError(validation.problem);
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    setPasteHint(null);
    setNoticeDismissed(true);
    setTouched(false);
    try {
      await onSubmit(validation.body);
      // Success hands control to the project room; the key is dropped here.
      setValue('');
    } catch (failure) {
      const status = failure instanceof ClientPortalError ? failure.status : -1;
      const code = failure instanceof ClientPortalError ? failure.code : null;
      setError(messageForFailure(status, code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitKey(value);
  };

  /**
   * A paste is an intention to use that key: the whole text is tidied at once
   * and, when it is a complete key, verified without another tap.
   */
  const applyPasted = (text: string) => {
    const parsed = formatAccessKey(text);
    if (!parsed.body) return false;
    setValue(parsed.display);
    setNoticeDismissed(true);
    setPasteHint(null);
    const validation = validateAccessKey(text);
    if (validation.ok) {
      void submitKey(text);
      return true;
    }
    if (parsed.ignored.length) setError(validateAccessKey(text).problem);
    inputRef.current?.focus();
    return true;
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!text || !applyPasted(text)) return; // an empty paste is left to the browser
    event.preventDefault();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !applyPasted(text)) {
        setPasteHint('Nothing to paste — copy your access key first, or type it in.');
        inputRef.current?.focus();
      }
    } catch {
      // Safari and some embedded browsers refuse clipboard reads without a prompt.
      setPasteHint('Press and hold the field, then choose Paste.');
      inputRef.current?.focus();
    }
  };

  // Guidance is one line, in one place, with the most useful message first.
  const hint = shownError
    ? null
    : ambiguous.length && touched
      ? `Access keys never contain ${ambiguous.join(', ')} — check the key.`
      : value && !ready
        ? `${filled} of ${ACCESS_KEY_BODY_LENGTH} characters — the key has four groups of four.`
        : ready
          ? `Looks complete${touched ? '' : ' — press Enter Project'}.`
          : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Code Rx Society" className="h-9 w-9 rounded-lg object-contain" />
            <div className="leading-tight">
              <p className="text-[13px] font-black tracking-[0.22em] text-slate-900">CODE Rx SOCIETY</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Client Project Portal</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 sm:inline-flex">
            <ShieldCheck className="h-4 w-4" /> Secure client access
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-5 py-14 sm:py-20">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] sm:p-10">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <KeyRound className="h-6 w-6" />
            </span>
            <p className="mt-5 text-[11px] font-black uppercase tracking-[0.32em] text-emerald-700">{eyebrow || 'CODE Rx SOCIETY'}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{heading || 'CLIENT ACCESS'}</h1>
            <p className="mt-3 text-sm font-medium text-slate-600">{helper || 'Enter your project access key'}</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8" noValidate aria-busy={submitting}>
            <label htmlFor="client-access-key" className="sr-only">Project access key</label>

            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-300 sm:block" aria-hidden="true" />
              <input
                id="client-access-key"
                ref={inputRef}
                value={value}
                onChange={(event) => handleChange(event.target.value)}
                onBlur={handleBlur}
                onFocus={() => setFocused(true)}
                onPaste={handlePaste}
                placeholder={ACCESS_KEY_PLACEHOLDER}
                inputMode="text"
                enterKeyHint="go"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={MAX_TYPED_LENGTH}
                disabled={submitting}
                aria-invalid={Boolean(shownError)}
                aria-describedby={shownError ? 'client-access-error' : hint || pasteHint ? 'client-access-hint' : undefined}
                className={`w-full rounded-2xl border-2 bg-slate-50/70 py-4 pl-3.5 pr-11 text-center font-mono text-[15px] font-bold uppercase tracking-[0.05em] text-slate-900 shadow-inner outline-none transition placeholder:font-mono placeholder:normal-case placeholder:tracking-[0.05em] placeholder:text-slate-300 disabled:opacity-60 sm:py-5 sm:pl-11 sm:text-xl sm:tracking-[0.12em] ${
                  shownError
                    ? 'border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:bg-white'
                    : ready && touched
                      ? 'border-emerald-300 bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50'
                      : 'border-slate-200 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50'
                }`}
              />
              {value && !submitting ? (
                <button
                  type="button"
                  onClick={() => {
                    setValue('');
                    setError(null);
                    setPasteHint(null);
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear the access key"
                  title="Clear"
                  className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* Four group markers: the key's shape, filled as the client types. */}
            <div className="mt-3 flex items-center gap-2" aria-hidden="true">
              {[0, 1, 2, 3].map((group) => {
                const done = filled >= (group + 1) * 4;
                const active = filled > group * 4 && !done;
                return (
                  <span
                    key={group}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      done ? 'bg-emerald-500' : active ? 'bg-emerald-200' : 'bg-slate-200'
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex min-h-[46px] items-start justify-between gap-3 pt-3">
              <div className="min-w-0 flex-1">
                {shownError ? (
                  <p id="client-access-error" role="alert" className="flex items-start gap-2 text-sm font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{shownError}</span>
                  </p>
                ) : notice && !noticeDismissed && noticeIcon ? (
                  <p className="flex items-start gap-2 text-sm font-semibold text-slate-600">{noticeIcon}<span>{notice}</span></p>
                ) : pasteHint ? (
                  <p id="client-access-hint" role="status" className="text-sm font-medium text-slate-500">{pasteHint}</p>
                ) : hint ? (
                  <p
                    id="client-access-hint"
                    className={`flex items-start gap-2 text-sm font-medium ${ambiguous.length && touched ? 'text-amber-700' : ready ? 'text-emerald-700' : 'text-slate-500'}`}
                  >
                    {ready && !ambiguous.length ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                    <span>{hint}</span>
                  </p>
                ) : focused ? (
                  <p className="text-sm font-medium text-slate-400">Type or paste the key Code Rx Society gave you.</p>
                ) : null}
              </div>
              {value && !ready ? (
                <span className="shrink-0 pt-0.5 font-mono text-[11px] font-bold text-slate-400" aria-hidden="true">
                  {filled}/{ACCESS_KEY_BODY_LENGTH}
                </span>
              ) : null}
            </div>

            {showPasteButton && !value && !submitting ? (
              <button
                type="button"
                onClick={() => void pasteFromClipboard()}
                className="mt-1 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500 underline-offset-4 transition hover:text-emerald-700 hover:underline"
              >
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /> Paste from clipboard
              </button>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-emerald-600/70"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying access key…
                </>
              ) : (
                <>
                  Enter Project <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {onAbandon ? (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={onAbandon}
                className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
              >
                {abandonLabel || 'Continue without this link'}
              </button>
            </div>
          ) : null}

          <div className="mt-8 border-t border-slate-100 pt-6">
            <ClientSupportContact
              contact={details}
              mailtoHref={clientSupportMailto(details.email, 'Client portal access')}
            />
          </div>
        </div>

        <p className="mt-6 max-w-md text-center text-xs font-medium leading-5 text-slate-500">
          Your access key is verified on Code Rx servers and is never stored in this browser.
          Only your published project documents are shown here.
        </p>
      </main>
    </div>
  );
};
