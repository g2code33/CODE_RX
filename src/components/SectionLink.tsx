import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { sectionDirectLinkUrl } from '../lib/linkAccess';

/**
 * Visible direct-link chip for a section.
 *
 * The chip jumps to the section on this page. The button beside it copies the
 * section's full http address — the link you can actually send, e.g.
 * `https://coderxsociety.pages.dev/#values` — built from the address the site is
 * being read on. `origin` is an explicit seam for that (tests pass a host; the
 * browser always uses its own).
 */
export const SectionLink = ({ id, light = false, origin }: { id: string; light?: boolean; origin?: string }) => {
  const [copied, setCopied] = useState(false);
  const browser = typeof window === 'undefined' ? null : window.location;
  const fullUrl = sectionDirectLinkUrl(
    id,
    origin || browser?.origin || '',
    browser?.pathname || '/',
    browser?.search || '',
  );

  const copy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const tone = light
    ? 'border-white/30 text-white/90 hover:border-[#15803d]/60 hover:text-[#15803d]'
    : 'border-[#16a34a]/20 text-[#475569] hover:border-[#15803d]/60 hover:text-[#15803d]';

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={`#${id}`}
        aria-label={`Direct link to this section (${id})`}
        title={`Direct link: ${fullUrl || `#${id}`}`}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.14em] no-underline transition-colors ${tone}`}
      >
        <Link2 className="h-3.5 w-3.5" />
        <span>#{id}</span>
      </a>
      <button
        type="button"
        onClick={copy}
        title={fullUrl ? `Copy the full link: ${fullUrl}` : `Copy the link to #${id}`}
        aria-label={copied ? `Copied the full http link to this section (${fullUrl})` : `Copy the full http link to this section (${fullUrl})`}
        className={`inline-flex items-center rounded-full border p-2 transition-colors ${tone} focus-visible:ring-2 focus-visible:ring-emerald-500/40`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
};
