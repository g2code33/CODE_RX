import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Keeps busy timelines readable: three recent entries are visible first and
 * older entries remain available on demand instead of being discarded.
 */
export const RecentItems = ({
  items,
  render,
  label = 'entries',
  limit = 3,
  className = '',
}: {
  items: any[];
  render: (item: any, index: number) => ReactNode;
  label?: string;
  limit?: number;
  className?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  const remaining = Math.max(0, items.length - limit);

  return <>
    {visible.map(render)}
    {remaining > 0 && <button type="button" onClick={() => setExpanded((current) => !current)} className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 ${className}`}>
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      {expanded ? `Show fewer ${label}` : `Show ${remaining} more ${label}`}
    </button>}
  </>;
};
