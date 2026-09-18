import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, BookOpen, MessageSquare, Search, UserRound, X } from 'lucide-react';

/**
 * The member portal's search.
 *
 * The box in the dashboard header used to be decoration: it had no state, no
 * handler and no results. This is the real thing, and it searches only what the
 * member is already allowed to see — the Vault sections and documents the API
 * returned for them, their own community updates, and the portal's own pages.
 * Nothing is invented, and an empty result says so.
 */

type Result = {
  id: string;
  group: 'Vault' | 'Community' | 'Portal';
  title: string;
  detail: string;
  icon: typeof BookOpen;
  run: () => void;
};

export const PortalSearch = ({
  vaultHome,
  notifications,
  onOpenVault,
  onOpenView,
}: {
  vaultHome: any;
  notifications: any[];
  onOpenVault: () => void;
  onOpenView: (view: 'overview' | 'courses' | 'projects' | 'challenges' | 'community' | 'profile') => void;
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickAway = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const found: Result[] = [];

    for (const section of vaultHome?.sections || []) {
      const haystack = `${section.title || ''} ${section.slug || ''}`.toLowerCase();
      if (haystack.includes(needle)) {
        found.push({
          id: `section-${section.id ?? section.slug}`,
          group: 'Vault',
          title: section.title || section.slug,
          detail: `${Number(section.documentCount || 0)} document${Number(section.documentCount || 0) === 1 ? '' : 's'} you can open`,
          icon: Archive,
          run: onOpenVault,
        });
      }
    }

    for (const document of vaultHome?.recentDocuments || []) {
      const haystack = `${document.title || ''} ${document.document_code || ''}`.toLowerCase();
      if (haystack.includes(needle)) {
        found.push({
          id: `document-${document.id}`,
          group: 'Vault',
          title: document.title,
          detail: document.section_title || document.section_slug || 'Vault document',
          icon: BookOpen,
          run: onOpenVault,
        });
      }
    }

    for (const update of notifications || []) {
      const haystack = `${update.title || ''} ${update.body || ''}`.toLowerCase();
      if (haystack.includes(needle)) {
        found.push({
          id: `notification-${update.id}`,
          group: 'Community',
          title: update.title,
          detail: update.body ? `${String(update.body).slice(0, 80)}…` : 'Community update',
          icon: MessageSquare,
          run: () => onOpenView('community'),
        });
      }
    }

    const destinations: Array<{ label: string; view: 'overview' | 'courses' | 'projects' | 'challenges' | 'community' | 'profile'; detail: string }> = [
      { label: 'My profile', view: 'profile', detail: 'Your member record and Calcitonin balance' },
      { label: 'My courses', view: 'courses', detail: 'Academy progress' },
      { label: 'My projects', view: 'projects', detail: 'Vault projects you can view' },
      { label: 'Challenges', view: 'challenges', detail: 'Open and past challenges' },
      { label: 'Community updates', view: 'community', detail: 'Broadcasts from PHANTOM' },
    ];
    for (const destination of destinations) {
      if (destination.label.toLowerCase().includes(needle)) {
        found.push({
          id: `view-${destination.view}`,
          group: 'Portal',
          title: destination.label,
          detail: destination.detail,
          icon: UserRound,
          run: () => onOpenView(destination.view),
        });
      }
    }

    return found.slice(0, 8);
  }, [query, vaultHome, notifications, onOpenVault, onOpenView]);

  const choose = (result: Result) => {
    setOpen(false);
    setQuery('');
    result.run();
  };

  let lastGroup = '';

  return (
    <div ref={box} className="relative">
      <label htmlFor="portal-search" className="sr-only">Search the portal</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        id="portal-search"
        type="text"
        role="combobox"
        aria-expanded={open && Boolean(query.trim())}
        aria-controls="portal-search-results"
        autoComplete="off"
        placeholder="Search documents, updates and pages…"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-full border border-slate-300 bg-white py-2 pl-10 pr-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600/30"
      />
      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { setQuery(''); setOpen(false); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open && query.trim() ? (
        <div id="portal-search-results" role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {results.length ? results.map((result) => {
            const heading = result.group !== lastGroup ? result.group : '';
            lastGroup = result.group;
            return (
              <div key={result.id}>
                {heading ? <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{heading}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => choose(result)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                    <result.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-800">{result.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600">{result.detail}</span>
                  </span>
                </button>
              </div>
            );
          }) : (
            <p className="px-3 py-4 text-sm text-slate-600">
              Nothing in your portal matches “{query.trim()}”. Documents you cannot access never appear in these results.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
