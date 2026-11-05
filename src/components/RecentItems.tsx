import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** How many entries any list shows before the "view more" control. */
export const LIST_PREVIEW = 5;

/**
 * CODE Rx — one listing rule for the whole app.
 *
 * Every list shows the LATEST FIVE entries and one control to reveal the rest:
 * a page never dumps two hundred rows at once, nothing is hidden without a way
 * to reach it, and the control disappears when there is nothing more to see
 * (a list of three does not pretend there is a page two).
 */
export const RecentItems = ({
  items,
  render,
  label = 'entries',
  limit = LIST_PREVIEW,
  className = '',
  testId = 'list-reveal',
}: {
  items: any[];
  render: (item: any, index: number) => ReactNode;
  label?: string;
  limit?: number;
  className?: string;
  testId?: string;
}) => {
  const source = Array.isArray(items) ? items : [];
  const [expanded, setExpanded] = useState(false);
  // A list that shrinks back under the preview length must not keep a stale
  // "show more" open.
  useEffect(() => {
    if (source.length <= limit && expanded) setExpanded(false);
  }, [source.length, limit, expanded]);

  const visible = expanded ? source : source.slice(0, limit);
  const remaining = Math.max(0, source.length - limit);
  const noun = remaining === 1 ? label.replace(/s$/, '') : label;

  return <>
    {visible.map(render)}
    {remaining > 0 && (
      <button
        type="button"
        data-testid={testId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 ${className}`}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        {expanded ? `Show fewer ${label}` : `View more — ${remaining} more ${noun} hidden`}
      </button>
    )}
  </>;
};
