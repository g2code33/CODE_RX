import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import {
  ACCESS_KEY_PLACEHOLDER,
  accessKeyHint,
  formatAccessKey,
  messageForFailure,
  validateAccessKey,
} from '../lib/accessKey';
import { ClientPortalError } from '../lib/cloudflare';

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
}

/**
 * CLIENT ACCESS — the entry point of the client portal.
 *
 * The raw access key never leaves this component: it is held in state only for
 * the moment it takes to exchange it for a session, then cleared, and it is
 * never written to localStorage, sessionStorage, a URL or an analytics sink.
 */
export const ClientAccessScreen = ({
  onSubmit, notice, eyebrow, heading, helper, noticeIcon, onAbandon, abandonLabel,
}: ClientAccessScreenProps) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A notice (an ended session, a failed link) is shown until the client starts
  // editing the field. It is derived rather than copied into state through an
  // effect, so the very first render already shows the correct state.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shownError = error ?? (noticeDismissed ? null : notice ?? null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (raw: string) => {
    const next = formatAccessKey(raw);
    setValue(next.display);
    setHint(accessKeyHint(next));
    // Feedback belongs to the key that produced it: clear it as soon as the
    // client edits the field, so a stale failure never sits under a new key.
    if (error) setError(null);
    if (notice) setNoticeDismissed(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const validation = validateAccessKey(value);
    if (!validation.ok) {
      setError(validation.problem);
      setHint(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setHint(null);
    setNoticeDismissed(true);
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

          <form onSubmit={handleSubmit} className="mt-8" noValidate>
            <label htmlFor="client-access-key" className="sr-only">Project access key</label>
            <input
              id="client-access-key"
              ref={inputRef}
              value={value}
              onChange={(event) => handleChange(event.target.value)}
              placeholder={ACCESS_KEY_PLACEHOLDER}
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={Boolean(shownError)}
              aria-describedby={shownError ? 'client-access-error' : hint ? 'client-access-hint' : undefined}
              className={`w-full rounded-xl border-2 bg-white px-4 py-4 text-center font-mono text-lg font-bold uppercase tracking-[0.18em] text-slate-900 outline-none transition placeholder:font-mono placeholder:tracking-[0.18em] placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-400 sm:text-xl ${
                shownError
                  ? 'border-rose-300 focus:border-rose-400'
                  : 'border-slate-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50'
              }`}
            />

            <div className="min-h-[46px] pt-3">
              {shownError ? (
                <p id="client-access-error" role="alert" className="flex items-start gap-2 text-sm font-semibold text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{shownError}</span>
                </p>
              ) : notice && !noticeDismissed && noticeIcon ? (
                <p className="flex items-start gap-2 text-sm font-semibold text-slate-600">{noticeIcon}<span>{notice}</span></p>
              ) : hint ? (
                <p id="client-access-hint" className="text-sm font-medium text-slate-500">{hint}</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-emerald-600/70"
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

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm font-semibold text-slate-700">Need assistance?</p>
            <a
              href="mailto:coderxsociety@gmail.com?subject=Client%20portal%20access"
              className="mt-1 inline-block text-sm font-bold text-emerald-700 underline-offset-4 hover:underline"
            >
              Contact Code Rx Society
            </a>
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
