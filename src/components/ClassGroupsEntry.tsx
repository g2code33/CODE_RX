import type { ReactNode } from 'react';
import { ArrowUpRight, Users } from 'lucide-react';

/**
 * The public way in to Class & Group Management.
 *
 * Visitors, students and organizers all land on the same `#class-groups`
 * address: the app decides between the organizer workspace and the student
 * portal after they arrive, and every credential is checked on Code Rx
 * servers. This entry is presentation only — it grants nothing, and it never
 * carries a token or credential in the URL. It mirrors ClientPortalEntry so
 * the two doors read as siblings in the navigation.
 */
type EntryVariant = 'chip' | 'icon';

export const ClassGroupsEntry = ({
  variant = 'chip',
  label,
  hint,
  className = '',
}: {
  variant?: EntryVariant;
  /** Optional override (surfaces that carry their own editable copy). */
  label?: ReactNode;
  hint?: string;
  className?: string;
}) => {
  const text = label ?? 'Class groups';
  const title = hint ?? 'CODE Rx — Class & Group Management';

  if (variant === 'icon') {
    return (
      <a
        href="#class-groups"
        aria-label="Class & Group Management"
        title={title}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#16a34a]/25 text-[#15803d] transition-colors hover:border-[#15803d]/60 hover:bg-[#15803d]/10 ${className}`}
      >
        <Users className="h-4 w-4" />
      </a>
    );
  }

  return (
    <a
      href="#class-groups"
      aria-label="Class & Group Management"
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#16a34a]/20 px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.14em] text-[#475569] no-underline transition-colors hover:border-[#15803d]/60 hover:text-[#15803d] ${className}`}
    >
      <Users className="h-3.5 w-3.5" />
      <span>{text}</span>
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
};
