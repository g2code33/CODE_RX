import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import {
  ACCESS_KEY_BODY_LENGTH,
  ACCESS_KEY_GROUPS,
  ACCESS_KEY_PLACEHOLDER,
  compactAccessKey,
  joinAccessKey,
  messageForFailure,
  splitAccessKey,
  validateAccessKey,
  validateAccessKeyGroups,
} from '../lib/accessKey';
import { clientContact, clientSupportMailto, type ClientContact } from '../lib/linkAccess';
import { ClientPortalError } from '../lib/cloudflare';
import { ClientSupportContact } from './ClientSupportContact';
import { ClientAccessKeyField } from './ClientAccessKeyField';

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

/**
 * CLIENT ACCESS — the entry point of the client portal.
 *
 * The raw access key never leaves this component: it is held in state only for
 * the moment it takes to exchange it for a session, then cleared, and it is
 * never written to localStorage, sessionStorage, a URL or an analytics sink.
 *
 * The key is entered in three fixed boxes behind a fixed `CRX` prefix, so the
 * characters a client types never move, never re-space and are never rewritten
 * under the caret. Guidance is live, and a complete key — typed or pasted — is
 * verified immediately. Keys issued before the short format can still be entered
 * in full through the free-form fallback.
 */
export const ClientAccessScreen = ({
  onSubmit, notice, eyebrow, heading, helper, noticeIcon, onAbandon, abandonLabel, contact,
}: ClientAccessScreenProps) => {
  // The key lives in three fixed boxes; the free-form field below is only for
  // keys issued before the short format, so nothing about the common case can
  // be disturbed by it.
  const [boxes, setBoxes] = useState<string[]>(['', '', '']);
  const [legacy, setLegacy] = useState('');
  const [legacyMode, setLegacyMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const legacyRef = useRef<HTMLInputElement>(null);
  const shownError = error ?? (noticeDismissed ? null : notice ?? null);
  const details = contact ?? clientContact(null);

  const body = joinAccessKey(boxes);
  const validation = validateAccessKeyGroups(boxes);
  const filled = Math.min(body.length, ACCESS_KEY_BODY_LENGTH);
  const complete = filled === ACCESS_KEY_BODY_LENGTH;

  useEffect(() => {
    if (legacyMode) legacyRef.current?.focus();
  }, [legacyMode]);

  const clearFeedback = () => {
    if (error) setError(null);
    if (notice) setNoticeDismissed(true);
  };

  const submitBody = async (candidate: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNoticeDismissed(true);
    try {
      await onSubmit(candidate);
      // Success hands control to the project room; the key is dropped here.
      setBoxes(['', '', '']);
      setLegacy('');
    } catch (failure) {
      const status = failure instanceof ClientPortalError ? failure.status : -1;
      const code = failure instanceof ClientPortalError ? failure.code : null;
      setError(messageForFailure(status, code));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Autologin: the moment the three boxes hold a complete, well-formed key it
   * is verified — the same behaviour a pasted key already had.
   */
  const handleBoxes = (next: string[]) => {
    setBoxes(next);
    clearFeedback();
    const candidate = validateAccessKeyGroups(next);
    if (validateAccessKey(joinAccessKey(next)).ok && candidate.ok) void submitBody(candidate.body);
  };

  /** A pasted key is accepted in any shape, with or without the CRX prefix. */
  const handlePaste = (text: string) => {
    const groups = splitAccessKey(text);
    if (!groups.join('')) return;
    setBoxes(groups);
    clearFeedback();
    if (validateAccessKey(text).ok) void submitBody(joinAccessKey(groups));
    else setError(validateAccessKeyGroups(groups).problem);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (legacyMode) {
      const candidate = compactAccessKey(legacy);
      const validationForLegacy = validateAccessKey(candidate);
      if (!validationForLegacy.ok) {
        setError(validationForLegacy.problem);
        legacyRef.current?.focus();
        return;
      }
      void submitBody(validationForLegacy.body);
      return;
    }
    if (!validation.ok) {
      setError(validation.problem);
      return;
    }
    void submitBody(validation.body);
  };

  const hint = shownError
    ? null
    : complete
      ? 'Looks complete — verifying now.'
      : filled
        ? `${filled} of ${ACCESS_KEY_BODY_LENGTH} characters — ${ACCESS_KEY_GROUPS} boxes, then the project code.`
        : null;

  const describedBy = shownError ? 'client-access-error' : hint ? 'client-access-hint' : undefined;

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
            <p id="client-access-key-label" className="sr-only">Project access key</p>

            <ClientAccessKeyField
              boxes={boxes}
              onChange={handleBoxes}
              onPasteKey={handlePaste}
              disabled={submitting}
              invalid={Boolean(shownError)}
              complete={complete}
              describedBy={describedBy}
              autoFocus={!legacyMode}
            />

            {/* One marker per character of the key body: nine marks, two groups of
                Three plus the project code. They are decoration, so assistive
                technology skips them; the boxes carry the accessible labels. */}
            <div className="mt-3 flex items-center gap-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
                <span
                  key={slot}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    slot < 6
                      ? slot < Math.min(filled, 6) ? 'bg-emerald-500' : 'bg-slate-200'
                      : filled >= 9 ? 'bg-emerald-500' : filled > slot ? 'bg-emerald-200' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>

            <p className="mt-2 text-center text-[11px] font-semibold tracking-wide text-slate-500">
              {ACCESS_KEY_PLACEHOLDER} — the last three letters are your project code.
            </p>

            <div className="flex min-h-[46px] items-start justify-between gap-3 pt-3">
              <div className="min-w-0 flex-1">
                {shownError ? (
                  <p id="client-access-error" role="alert" className="flex items-start gap-2 text-sm font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{shownError}</span>
                  </p>
                ) : notice && !noticeDismissed && noticeIcon ? (
                  <p className="flex items-start gap-2 text-sm font-semibold text-slate-600">{noticeIcon}<span>{notice}</span></p>
                ) : hint ? (
                  <p
                    id="client-access-hint"
                    className={`flex items-start gap-2 text-sm font-medium ${complete ? 'text-emerald-700' : 'text-slate-500'}`}
                  >
                    {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                    <span>{complete && submitting ? 'Verifying access key…' : hint}</span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-400">Type or paste the key Code Rx Society gave you.</p>
                )}
              </div>
              {filled && !complete ? (
                <span className="shrink-0 pt-0.5 font-mono text-[11px] font-bold text-slate-400" aria-hidden="true">
                  {filled}/{ACCESS_KEY_BODY_LENGTH}
                </span>
              ) : null}
            </div>

            {legacyMode ? (
              <div className="mt-4">
                <label htmlFor="client-access-legacy" className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  Long access key (issued earlier)
                </label>
                <input
                  id="client-access-legacy"
                  ref={legacyRef}
                  value={legacy}
                  onChange={(event) => {
                    setLegacy(event.target.value.toUpperCase().replace(/[^A-Za-z0-9- ]/g, '').slice(0, 40));
                    clearFeedback();
                  }}
                  placeholder="CRX-XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={submitting}
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50/70 px-3.5 py-3.5 text-center font-mono text-base font-bold tracking-[0.08em] text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50 disabled:opacity-60"
                />
              </div>
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

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setLegacyMode((value) => !value);
                  setLegacy('');
                  setBoxes(['', '', '']);
                  setError(null);
                }}
                className="text-xs font-bold text-slate-500 underline-offset-4 transition hover:text-emerald-700 hover:underline"
              >
                {legacyMode ? 'Use the three boxes instead' : 'Using a long key issued earlier?'}
              </button>
            </div>
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
