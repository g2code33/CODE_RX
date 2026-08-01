import { Link2 } from 'lucide-react';

/**
 * Visible direct-link chip for a section. Renders a real anchor to #id so the
 * section's URL can be copied, bookmarked, or shared — visiting it takes the
 * user straight to that section.
 */
export const SectionLink = ({ id, light = false }: { id: string; light?: boolean }) => (
  <a
    href={`#${id}`}
    aria-label={`Direct link to this section (${id})`}
    title={`Direct link: #${id}`}
    className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-colors no-underline ${
      light ? 'text-white/70 hover:text-white' : 'text-emerald-500/80 hover:text-emerald-700'
    }`}
  >
    <Link2 className="w-3.5 h-3.5" />
    <span>#{id}</span>
  </a>
);
