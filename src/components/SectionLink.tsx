import { Link2 } from 'lucide-react';

/** Visible direct-link chip for a section. */
export const SectionLink = ({ id, light = false }: { id: string; light?: boolean }) => (
  <a
    href={`#${id}`}
    aria-label={`Direct link to this section (${id})`}
    title={`Direct link: #${id}`}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[0.58rem] font-black uppercase tracking-[0.16em] no-underline transition-colors ${
      light
        ? 'border-white/20 text-white/70 hover:border-[#b8ff3d]/60 hover:text-[#b8ff3d]'
        : 'border-[#b8ff3d]/20 text-[#8da18e] hover:border-[#b8ff3d]/60 hover:text-[#b8ff3d]'
    }`}
  >
    <Link2 className="h-3.5 w-3.5" />
    <span>#{id}</span>
  </a>
);
