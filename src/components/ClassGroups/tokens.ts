/**
 * The two Tailwind class strings every panel in the module shares.
 *
 * They lived as module constants inside the 5,000-line workspace file, which
 * meant any extracted panel had to either import the whole workspace or
 * re-type the strings (and drift). They live here now, one copy.
 */
export const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
export const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';
export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100';
