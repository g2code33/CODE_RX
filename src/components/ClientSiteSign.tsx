import { ArrowLeft } from 'lucide-react';
import { CLIENT_SITE_HOME } from '../lib/linkAccess';

/**
 * The Code Rx sign in every client screen header.
 *
 * A client who lands in the portal from a letter, a link or a bookmark should
 * always have an obvious way back to the public website — so the brand lockup
 * is a real link home, and beside it sits a small, plainly labelled
 * "Back to website" sign. Both point at the same place: the site root, never a
 * hash that could be mistaken for a credential.
 */
export const ClientSiteSign = ({
  subtitle = 'Client Project Portal',
  /** Show the small text sign beside the lockup. */
  withBackSign = true,
}: {
  subtitle?: string;
  withBackSign?: boolean;
}) => (
  <div className="flex min-w-0 items-center gap-3">
    <a
      href={CLIENT_SITE_HOME}
      aria-label="Code Rx Society website home"
      className="flex min-w-0 items-center gap-3 rounded-lg no-underline focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
    >
      <img src="/logo.png" alt="Code Rx Society" className="h-9 w-9 rounded-lg object-contain" loading="lazy" decoding="async" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[12px] font-black tracking-[0.22em] text-slate-900 sm:text-[13px]">CODE Rx SOCIETY</span>
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subtitle}</span>
      </span>
    </a>
    {withBackSign ? (
      <a
        href={CLIENT_SITE_HOME}
        className="ml-1 hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 sm:inline-flex"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to website
      </a>
    ) : null}
  </div>
);
