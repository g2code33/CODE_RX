import { Mail, Send, UserRound } from 'lucide-react';
import { phantomContactHref, type ClientContact } from '../lib/linkAccess';

/**
 * The contact row under every client screen: three plain ways to reach a human.
 *
 * 1. **Contact Code Rx** — a mail message to the society's published address,
 *    already carrying the context of the screen it was sent from.
 * 2. **Talk to PHANTOM** — the website's own PHANTOM form, opened by hash. It is
 *    the channel that works on any machine or browser, because it is a form on
 *    a page rather than a handler the device may not have.
 * 3. **Telegram** — the society's channel, opened in a new tab.
 *
 * There is deliberately no address to copy and no telephone list here: the three
 * chips stay small, and the phones, the address and the whole site are one click
 * away through the "Back to website" sign in the header. The addresses come from
 * the published site content (`links.footer.*`), so they cannot drift from the
 * public website.
 */
export const ClientSupportContact = ({
  contact,
  /** The mail link for this screen, already carrying the context in its subject. */
  mailtoHref,
  /** One line of context shown under the heading. */
  message = 'We will help you get back into your project.',
  /** Heading override; the default matches the client screens. */
  heading = 'Need assistance?',
  /** Wording of the mail chip. */
  actionLabel = 'Contact Code Rx',
  /** Override the PHANTOM channel (tests use this); defaults to the website form. */
  phantomHref = phantomContactHref(),
}: {
  contact: ClientContact;
  mailtoHref: string;
  message?: string;
  heading?: string;
  actionLabel?: string;
  phantomHref?: string;
}) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4 text-center">
    <p className="text-sm font-semibold text-slate-700">{heading}</p>
    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{message}</p>

    <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
      <a
        href={mailtoHref}
        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        {actionLabel}
      </a>
      <a
        href={phantomHref}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
      >
        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
        Talk to PHANTOM
      </a>
      {contact.telegram ? (
        <a
          href={contact.telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          Telegram
        </a>
      ) : null}
    </div>
  </div>
);
