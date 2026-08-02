import { Link2 } from 'lucide-react';

/** Visible direct-link chip for a section. */
export const SectionLink = ({ id, light = false }: { id: string; light?: boolean }) => (
  <a
    href={`#${id}`}
    aria-label={`Direct link to this section (${id})`}
    title={`Direct link: #${id}`}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.14em] no-underline transition-colors ${
      light
        ? 'border-white/30 text-white/90 hover:border-[#b8ff3d]/60 hover:text-[#b8ff3d]'
        : 'border-[#b8ff3d]/25 text-[#a9bda3] hover:border-[#b8ff3d]/60 hover:text-[#b8ff3d]'
    }`}
  >
    <Link2 className="h-3.5 w-3.5" />
    <span>#{id}</span>
  </a>
);
