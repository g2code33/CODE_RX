import { AlertTriangle, Ban, Clock, Mail, ShieldCheck, Timer } from 'lucide-react';
import { linkContactHref, type LinkStateScreen } from '../lib/linkAccess';

interface ClientLinkStateProps {
  state: LinkStateScreen;
  /** The client can step back to the ordinary access screen when one applies. */
  onContinue?: () => void;
  /** Wording for the secondary action, when offered. */
  continueLabel?: string;
}

/**
 * The end state of a temporary link that cannot be used — expired, revoked,
 * already used, or unrecognised.
 *
 * It is a dead end by design: there is no destination to open, no partial room
 * and no retry against the same token. The only routes forward are a new link
 * from Code Rx Society, or the client's own access key.
 */
export const ClientLinkState = ({ state, onContinue, continueLabel }: ClientLinkStateProps) => {
  const expired = state.headline === 'THIS LINK HAS EXPIRED';
  const revoked = state.headline === 'ACCESS REVOKED';
  const Icon = expired ? Timer : revoked ? Ban : AlertTriangle;

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
          <span className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:inline-flex">
            <ShieldCheck className="h-4 w-4" /> Secure client access
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-5 py-14 sm:py-20">
        <div
          role="status"
          aria-live="polite"
          className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] sm:p-10"
        >
          <div className="flex flex-col items-center text-center">
            <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${
              revoked ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-amber-100'
            }`}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{state.headline}</h1>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{state.message}</p>
          </div>

          <div className="mt-7 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-4 text-center">
            <p className="flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <Clock className="h-3.5 w-3.5" /> What happens next
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{state.guidance}</p>
          </div>

          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            <a
              href={linkContactHref(state.headline)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
            >
              <Mail className="h-4 w-4" /> Contact Code Rx Society
            </a>
            {onContinue ? (
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-6 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {continueLabel || 'Use my access key'}
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-6 max-w-md text-center text-xs font-medium leading-5 text-slate-500">
          Temporary links are single-destination and time-limited. Expired and revoked links are never reopened,
          and no project content was shown from this one.
        </p>
      </main>
    </div>
  );
};
