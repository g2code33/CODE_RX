import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, BookOpen, ChevronRight, FilePlus2, FileText, FolderKanban, History, Home, LoaderCircle, LockKeyhole, Search, X } from 'lucide-react';
import { db } from '../lib/cloudflare';
import { VaultDocumentEditor } from './VaultDocumentEditor';

const dateLabel = (value?: string) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const Vault = ({ compact = false }: { compact?: boolean }) => {
  const [sections, setSections] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<any | null>(null);
  const [showHome, setShowHome] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadHome = async () => {
    setLoading(true);
    try {
      const [sectionData, homeData] = await Promise.all([db.vault.sections(), db.vault.home()]);
      setSections(sectionData);
      setHome(homeData);
      setActiveSection((current: any | null) => current || sectionData[0] || null);
    } catch (error: any) {
      setMessage(error?.message || 'The Code Rx Vault could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadHome(); }, []);

  const loadSection = async (section: any) => {
    if (!section) return;
    setLoadingDocuments(true);
    try {
      const list = await db.vault.documents(section.slug);
      setDocuments(list);
      setProjects(section.slug === 'projects' ? await db.vault.projects() : []);
    } catch (error: any) {
      setMessage(error?.message || 'You are not authorized to view this Vault section.');
      setDocuments([]); setProjects([]);
    } finally { setLoadingDocuments(false); }
  };

  useEffect(() => { if (activeSection && !editorOpen && !showHome) void loadSection(activeSection); }, [activeSection?.slug, editorOpen, showHome]);

  const chooseSection = (section: any) => {
    setActiveSection(section);
    setEditorOpen(false);
    setSelectedDocument(null);
    setSearchResults([]);
    setShowHome(false);
  };

  const openDocument = async (id: number) => {
    try {
      const document = await db.vault.document(id);
      const section = sections.find((item) => item.slug === document.section_slug) || activeSection;
      setActiveSection(section);
      setSelectedDocument(document);
      setEditorOpen(true);
      setSearchResults([]);
      setShowHome(false);
    } catch (error: any) { setMessage(error?.message || 'Could not open this document.'); }
  };

  const submitSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!search.trim()) { setSearchResults([]); return; }
    try { setSearchResults(await db.vault.search(search)); } catch (error: any) { setMessage(error?.message || 'Vault search failed.'); }
  };

  const can = (action: string) => Boolean(activeSection?.permissions?.[action]);
  const workspaceTitle = compact ? 'Code Rx Vault' : 'CODE Rx VAULT';
  const quickSections = useMemo(() => sections.filter((section) => ['society', 'projects', 'technology', 'coding', 'research', 'meetings'].includes(section.slug)), [sections]);

  if (editorOpen && activeSection) {
    return <VaultDocumentEditor
      document={selectedDocument}
      section={activeSection}
      projects={projects}
      canEdit={selectedDocument ? can('edit') : can('create')}
      canManage={can('manage')}
      onClose={() => { setEditorOpen(false); setSelectedDocument(null); void loadSection(activeSection); }}
      onSaved={(document) => { setSelectedDocument(document); void loadHome(); }}
    />;
  }

  return <div className={compact ? 'space-y-5' : 'min-h-screen bg-slate-50 pt-20'}><div className={compact ? '' : 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'}><div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm"><div className="relative overflow-hidden border-b border-emerald-100 bg-gradient-to-br from-emerald-950 via-[#073a29] to-slate-950 p-6 text-white sm:p-8"><div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" /><div className="relative"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Internal knowledge, documentation & institutional memory</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{workspaceTitle}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">A secure workspace for what Code Rx learns, builds, decides, researches, and plans next.</p></div><div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-right"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Access model</p><p className="mt-1 text-sm font-black">View authorized · Edit responsible</p></div></div><form onSubmit={submitSearch} className="mt-6 flex max-w-2xl gap-2 rounded-2xl border border-white/15 bg-white/10 p-2"><Search className="ml-2 mt-2.5 h-4 w-4 shrink-0 text-emerald-200" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents, tags, authors, projects, code…" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-emerald-100/50" /><button className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-950">Search</button></form></div></div>
      {message && <div className="mx-5 mt-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"><span>{message}</span><button onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div>}
      {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-600" /></div> : <div className="grid min-h-[590px] lg:grid-cols-[238px_minmax(0,1fr)]"><aside className="border-b border-slate-100 bg-slate-50/80 p-3 lg:border-b-0 lg:border-r"><button onClick={() => { setSearchResults([]); setSelectedDocument(null); setEditorOpen(false); setShowHome(true); }} className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold ${showHome && !searchResults.length ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' : 'text-slate-600 hover:bg-white hover:text-emerald-700'}`}><Home className="h-4 w-4" />Vault home</button><p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Vault sections</p><div className="space-y-1">{sections.map((section) => <button key={section.slug} type="button" onClick={() => chooseSection(section)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${activeSection?.slug === section.slug && !searchResults.length && !showHome ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' : 'text-slate-600 hover:bg-white hover:text-emerald-700'}`}><span className="truncate">{section.title}</span>{section.is_sensitive === 1 && <LockKeyhole className="h-3.5 w-3.5 shrink-0" />}</button>)}</div></aside>
        <main className="min-w-0 p-5 sm:p-7">{searchResults.length ? <SearchResults results={searchResults} onBack={() => setSearchResults([])} onOpen={openDocument} /> : <VaultHome home={home} activeSection={showHome ? null : activeSection} documents={documents} projects={projects} loading={loadingDocuments} quickSections={quickSections} canCreate={can('create')} onNew={() => { setSelectedDocument(null); setEditorOpen(true); }} onOpen={openDocument} onChooseSection={chooseSection} />}</main></div>}
    </div></div></div>;
};

const VaultHome = ({ home, activeSection, documents, projects, loading, quickSections, canCreate, onNew, onOpen, onChooseSection }: any) => <div>{activeSection ? <><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">{activeSection.slug}</p><h2 className="mt-1 text-2xl font-black text-slate-900">{activeSection.title}</h2><p className="mt-1 text-sm text-slate-500">{activeSection.description}</p></div>{canCreate && <button onClick={onNew} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white"><FilePlus2 className="h-4 w-4" />New document</button>}</div>{loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-600" /></div> : <><DocumentGrid documents={documents} onOpen={onOpen} /><div className="mt-8 grid gap-6 xl:grid-cols-2"><ProjectLinks projects={projects} /><ActivityTimeline items={home?.recentActivity || []} /></div></>}</> : <><h2 className="text-2xl font-black text-slate-900">Vault home</h2><p className="mt-2 text-sm text-slate-500">Recently updated trusted knowledge, your work, and Society activity.</p><div className="mt-7 grid gap-6 xl:grid-cols-2"><DocumentCollection title="Recently updated" documents={home?.recentDocuments || []} onOpen={onOpen} /><DocumentCollection title="My documents" documents={home?.myDocuments || []} onOpen={onOpen} /></div><section className="mt-8"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-black text-slate-900">Quick access</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{quickSections.map((section: any) => <button key={section.slug} onClick={() => onChooseSection(section)} className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-left hover:border-emerald-200 hover:bg-emerald-50"><p className="font-black text-slate-900">{section.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{section.documentCount || 0} documents · {section.description}</p></button>)}</div></section><section className="mt-8"><ActivityTimeline items={home?.recentActivity || []} /></section></>}</div>;

const DocumentGrid = ({ documents, onOpen }: { documents: any[]; onOpen: (id: number) => void }) => <>{documents.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{documents.map((document) => <button key={document.id} onClick={() => onOpen(document.id)} className="group rounded-2xl border border-slate-100 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg"><FileText className="h-5 w-5 text-emerald-600" /><div className="mt-5 flex items-start justify-between gap-3"><h3 className="font-black text-slate-900">{document.title}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-500">{document.status || 'draft'}</span></div><p className="mt-2 text-xs text-slate-500">Updated {dateLabel(document.updated_at)}{document.updated_by_name ? ` by ${document.updated_by_name}` : ''}</p><div className="mt-4 flex flex-wrap gap-1">{parseTags(document).slice(0, 4).map((tag) => <span key={tag} className="rounded bg-emerald-50 px-1.5 py-1 text-[9px] font-black text-emerald-700">#{tag}</span>)}</div><span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">Open workspace <ChevronRight className="h-3.5 w-3.5" /></span></button>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 p-9 text-center"><Archive className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-black text-slate-800">No documents here yet</h3><p className="mt-2 text-sm text-slate-500">Create the first trusted record when your responsibility allows it.</p></div>}</>;
const DocumentCollection = ({ title, documents, onOpen }: { title: string; documents: any[]; onOpen: (id: number) => void }) => <section><h3 className="text-lg font-black text-slate-900">{title}</h3><div className="mt-3 space-y-2">{documents.length ? documents.map((document) => <button key={document.id} onClick={() => onOpen(document.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-left hover:border-emerald-200"><span><strong className="block text-sm text-slate-800">{document.title}</strong><small className="text-xs text-slate-500">{document.section_title || document.section_slug} · {dateLabel(document.updated_at)}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No documents to show yet.</p>}</div></section>;
const ProjectLinks = ({ projects }: { projects: any[] }) => <section><div className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-black text-slate-900">Project documentation</h3></div><div className="mt-3 space-y-2">{projects.length ? projects.slice(0, 5).map((project) => <div key={project.id} className="rounded-xl border border-slate-100 p-4"><strong className="text-sm text-slate-800">{project.title}</strong><p className="mt-1 text-xs text-slate-500">{project.status} · {project.description || 'No summary yet.'}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Project links appear when you can view the Projects section.</p>}</div></section>;
const ActivityTimeline = ({ items }: { items: any[] }) => <section><div className="flex items-center gap-2"><History className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-black text-slate-900">Recent activity</h3></div><div className="mt-3 space-y-2">{items.length ? items.slice(0, 8).map((item) => <div key={`${item.id}-${item.created_at}`} className="rounded-xl border border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-800">{String(item.action || '').replace(/\./g, ' ')}</p><p className="mt-1 text-xs text-slate-500">{item.actor_name || 'Code Rx member'}{item.document_title ? ` · ${item.document_title}` : ''} · {dateLabel(item.created_at)}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Vault activity will appear as members document their work.</p>}</div></section>;
const SearchResults = ({ results, onBack, onOpen }: { results: any[]; onBack: () => void; onOpen: (id: number) => void }) => <div><button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><ArrowLeft className="h-4 w-4" />Back to Vault</button><h2 className="mt-4 text-2xl font-black text-slate-900">Search results</h2><p className="mt-1 text-sm text-slate-500">{results.length} matching document{results.length === 1 ? '' : 's'}</p><div className="mt-6"><DocumentGrid documents={results} onOpen={onOpen} /></div></div>;
const parseTags = (document: any): string[] => { if (Array.isArray(document.tags)) return document.tags; try { return JSON.parse(document.tags_json || '[]'); } catch { return []; } };
