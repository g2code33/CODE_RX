import type { ReactNode } from 'react';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import { clientPortalSession } from '../lib/cloudflare';
import { CLIENT_PORTAL_HASH, clientEntryCopy } from '../lib/linkAccess';

/**
 * The public way in to the client project room.
 *
 * A client is not a member: there is no account, no password and no email
 * login, so the client door cannot live behind the member portal button. This
 * entry is the same door from every public surface — footer, project pages,
 * navigation and the sign-in dialog — and it always points at the single
 * `#client-portal` address (never at a link token, never with a credential in
 * the URL). It is presentation only: it grants nothing, and every access key
 * is still checked on Code Rx servers.
 *
 * If this tab already holds a live client session, the wording switches to
 * "Open my project" so a returning client recognises their own workspace.
 */
type EntryVariant = 'chip' | 'tile' | 'icon';

export const ClientPortalEntry = ({
  variant = 'chip',
  label,
  hint,
  className = '',
}: {
  variant?: EntryVariant;
  /** Optional override (the footer passes its editable copy through here). */
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) => {
  const copy = clientEntryCopy(Boolean(clientPortalSession.read()));
  const text = label ?? copy.label;
  const sub = hint ?? copy.hint;

  if (variant === 'icon') {
    return (
      <a
        href={CLIENT_PORTAL_HASH}
        aria-label={copy.aria}
        title={`${copy.label} — ${copy.hint}`}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#16a34a]/25 text-[#15803d] transition-colors hover:border-[#b8ff3d]/60 hover:bg-[#b8ff3d]/10 ${className}`}
      >
        <KeyRound className="h-4 w-4" />
      </a>
    );
  }

  if (variant === 'tile') {
    return (
      <a
        href={CLIENT_PORTAL_HASH}
        aria-label={copy.aria}
        className={`group flex items-center gap-3 rounded-2xl border border-[#16a34a]/25 bg-emerald-50/80 p-3.5 text-left no-underline transition hover:-translate-y-0.5 hover:border-[#16a34a]/50 hover:bg-emerald-100/70 ${className}`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#15803d] text-[#b8ff3d] shadow-[0_7px_16px_rgba(21,128,61,0.22)]">
          <KeyRound className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#14532d]">{text}</span>
          <span className="mt-1 block text-xs leading-5 text-[#475569]">{sub}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-[#15803d] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>
    );
  }

  return (
    <a
      href={CLIENT_PORTAL_HASH}
      aria-label={copy.aria}
      title={copy.hint}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#16a34a]/20 px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.14em] text-[#475569] no-underline transition-colors hover:border-[#b8ff3d]/60 hover:text-[#15803d] ${className}`}
    >
      <KeyRound className="h-3.5 w-3.5" />
      <span>{text}</span>
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
};
