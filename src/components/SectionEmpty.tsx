import type { ReactNode } from 'react';

/**
 * The public site's empty state.
 *
 * Every collection on the website (projects, resources, partnerships, the news
 * grid, the challenge board) is now published by PHANTOM rather than pre-seeded,
 * so each of those places has to read well on the day it is still empty. This is
 * the one shape they all use: a quiet card on the page background that says what
 * belongs here, in plain language, with no invented content and no broken
 * controls.
 *
 * The Vault and the control centre keep their own (dark) empty states; this one
 * is for the white public pages.
 */
export const SectionEmpty = ({
  title,
  note,
  icon,
  className = '',
}: {
  title: string;
  note?: string;
  icon?: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-2xl border border-dashed border-[#16a34a]/25 bg-white/70 p-10 text-center sm:p-14 ${className}`}
  >
    {icon ? <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#15803d]/10 text-[#15803d]">{icon}</span> : null}
    <p className="text-base font-black text-[#0f172a]">{title}</p>
    {note ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#475569]">{note}</p> : null}
  </div>
);
