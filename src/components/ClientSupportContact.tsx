import { useEffect, useState } from 'react';
import { Check, Copy, Mail, Phone, Send } from 'lucide-react';
import { telHref, type ClientContact } from '../lib/linkAccess';

/**
 * "Contact Code Rx Society" — one component for every client screen.
 *
 * A `mailto:` link does nothing in an embedded browser, a private window or a
 * phone with no mail client, so this block never depends on it alone: the
 * address is always visible and copyable, and the society's Telegram channel
 * opens in a new tab anywhere. The values come from the published site content
 * (`links.footer.*`), so they cannot silently drift from the public website.
 */
export const ClientSupportContact = ({
  contact,
  /** The primary mail link, already carrying the context of this screen. */
  mailtoHref,
  /** One line of context shown under the heading. */
  message = 'We will help you get back into your project.',
  /** Heading override; the default matches the client screens. */
  heading = 'Need assistance?',
  /** Wording of the primary action; kept for the link end-state screens. */
  actionLabel = 'Contact Code Rx Society',
}: {
  contact: ClientContact;
  mailtoHref: string;
  message?: string;
  heading?: string;
  actionLabel?: string;
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // The confirmation is a moment, not a state: it clears itself.
  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2600);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copyAddress = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(contact.email);
      setCopyState('copied');
    } catch {
      // No clipboard permission: the address is on screen and selectable, so say so.
      setCopyState('failed');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-center sm:p-5">
      <p className="text-sm font-semibold text-slate-700">{heading}</p>
      <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{message}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <a
          href={mailtoHref}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
        >
          <Mail className="h-4 w-4" aria-hidden="true" /> {actionLabel}
        </a>
        <button
          type="button"
          onClick={copyAddress}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
        >
          {copyState === 'copied' ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copyState === 'copied' ? 'Address copied' : 'Copy address'}
        </button>
        {contact.telegram ? (
          <a
            href={contact.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
          >
            <Send className="h-4 w-4" aria-hidden="true" /> Telegram
          </a>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] font-semibold text-slate-600">
        <span className="select-all font-mono">{contact.email}</span>
        {contact.phones.map((phone) => (
          <span key={phone}>
            <span aria-hidden="true" className="px-1.5 text-slate-300">·</span>
            <a href={telHref(phone)} className="underline-offset-2 hover:text-emerald-700 hover:underline">
              <Phone className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
              {phone}
            </a>
          </span>
        ))}
      </p>
      {copyState === 'failed' ? (
        <p role="status" aria-live="polite" className="mt-2 text-[11px] font-semibold text-slate-500">
          Copy is blocked in this browser — select the address above and copy it manually.
        </p>
      ) : null}
    </div>
  );
};
