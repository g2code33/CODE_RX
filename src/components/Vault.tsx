import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, BookOpen, ChevronRight, FilePlus2, FileText, FolderKanban, History, Home, LoaderCircle, LockKeyhole, Menu, Search, X } from 'lucide-react';
import { db } from '../lib/cloudflare';
import { VaultDocumentEditor } from './VaultDocumentEditor';

type VaultMode = 'member' | 'phantom';
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const Vault = ({ compact = false, workspaceMode = 'member', onBack }: { compact?: boolean; workspaceMode?: VaultMode; onBack?: () => void }) => {
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const loadHome = async () => {
    setLoading(true);
    try {
      const [sectionData, homeData] = await Promise.all([db.vault.sections(), db.vault.home()]);
      setSections(sectionData);
      setHome(homeData);
      setActiveSection((current: any | null) => current || sectionData[0] || null);
    } catch (error: any) { setMessage(error?.message || 'The Code Rx Vault could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadHome(); }, []);

  const loadSection = async (section: any) => {
    if (!section) return;
    setLoadingDocuments(true);
    try {
      const [list, projectList] = await Promise.all([
        db.vault.documents(section.slug),
        section.slug === 'projects' ? db.vault.projects() : Promise.resolve([]),
      ]);
      setDocuments(list); setProjects(projectList);
    } catch (error: any) { setMessage(error?.message || 'You are not authorized to view this Vault section.'); setDocuments([]); setProjects([]); }
    finally { setLoadingDocuments(false); }
  };

  useEffect(() => { if (activeSection && !editorOpen && !showHome) void loadSection(activeSection); }, [activeSection?.slug, editorOpen, showHome]);

  const goHome = () => {
    setShowHome(true); setEditorOpen(false); setSelectedDocument(null); setSearchResults([]); setMobileNavigationOpen(false);
  };
  const chooseSection = (section: any) => {
    setActiveSection(section); setShowHome(false); setEditorOpen(false); setSelectedDocument(null); setSearchResults([]); setMobileNavigationOpen(false);
  };
  const openDocument = async (id: number) => {
    try {
      const document = await db.vault.document(id);
      setActiveSection(sections.find((section) => section.slug === document.section_slug) || activeSection);
      setSelectedDocument(document); setEditorOpen(true); setShowHome(false); setSearchResults([]); setMobileNavigationOpen(false);
    } catch (error: any) { setMessage(error?.message || 'Could not open this document.'); }
  };
  const submitSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!search.trim()) { setSearchResults([]); return; }
    try { setSearchResults(await db.vault.search(search)); setShowHome(false); }
    catch (error: any) { setMessage(error?.message || 'Vault search failed.'); }
  };
  const can = (action: string) => Boolean(activeSection?.permissions?.[action]);
  const quickSections = useMemo(() => sections.filter((section) => ['society', 'projects', 'technology', 'coding', 'research', 'meetings'].includes(section.slug)), [sections]);

  const navigation = <VaultNavigation sections={sections} activeSlug={showHome ? '__home__' : activeSection?.slug || ''} onHome={goHome} onSelect={chooseSection} onClose={() => setMobileNavigationOpen(false)} />;

  return <div className={`vault-workspace min-h-screen bg-[#f7faf8] text-slate-900 ${workspaceMode === 'phantom' ? 'vault-workspace--phantom' : ''} ${compact ? 'vault-workspace--compact' : ''}`}>
    <header className="vault-appbar"><div className="flex min-w-0 items-center gap-3">{workspaceMode === 'phantom' && <button onClick={onBack} className="vault-appbar-button"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Back to Phantom Control</span></button>}<button onClick={() => setMobileNavigationOpen(true)} className="vault-appbar-button lg:hidden"><Menu className="h-4 w-4" /></button><button onClick={goHome} className="flex min-w-0 items-center gap-2 text-left"><img src="/logo-small.png" alt="" className="h-8 w-8 object-contain" /><span><span className="block text-sm font-black tracking-wide text-slate-900">CODE <span className="text-emerald-600">Rx</span> VAULT</span><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Knowledge workspace</span></span></button></div><form onSubmit={submitSearch} className="vault-search"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Vault" /><button>Search</button></form><div className="flex items-center gap-2">{activeSection && can('create') && <button onClick={() => { setSelectedDocument(null); setEditorOpen(true); setShowHome(false); }} className="vault-new-button"><FilePlus2 className="h-4 w-4" />New</button>}<span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 sm:inline">{workspaceMode === 'phantom' ? 'PHANTOM' : 'MEMBER'}</span></div></header>
    <div className="vault-shell"><aside className="vault-sidebar hidden lg:block">{navigation}</aside>{mobileNavigationOpen && <div className="vault-mobile-nav"><div className="vault-mobile-nav__scrim" onClick={() => setMobileNavigationOpen(false)} /><aside className="vault-mobile-nav__panel">{navigation}</aside></div>}<main className="vault-main">{message && <div className="mb-4 flex items-start justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><span>{message}</span><button onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div>}{loading ? <div className="grid min-h-[60vh] place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-600" /></div> : editorOpen && activeSection ? <VaultDocumentEditor document={selectedDocument} section={activeSection} projects={projects} canEdit={selectedDocument ? can('edit') : can('create')} canManage={can('manage')} onClose={() => { setEditorOpen(false); setSelectedDocument(null); void loadSection(activeSection); }} onSaved={(document) => { setSelectedDocument(document); void loadHome(); }} /> : searchResults.length ? <SearchResults results={searchResults} onBack={() => setSearchResults([])} onOpen={openDocument} /> : showHome ? <VaultHome home={home} quickSections={quickSections} onSelect={chooseSection} onOpen={openDocument} /> : <SectionList section={activeSection} documents={documents} projects={projects} loading={loadingDocuments} canCreate={can('create')} onNew={() => { setSelectedDocument(null); setEditorOpen(true); }} onOpen={openDocument} />}</main></div></div>;
};

const VaultNavigation = ({ sections, activeSlug, onHome, onSelect, onClose }: { sections: any[]; activeSlug: string; onHome: () => void; onSelect: (section: any) => void; onClose: () => void }) => <div className="vault-navigation"><button onClick={onHome} className={`vault-navigation__item ${activeSlug === '__home__' ? 'is-active' : ''}`}><Home className="h-4 w-4" />Vault Home</button><p className="vault-navigation__label">Vault</p>{sections.map((section) => <button key={section.slug} onClick={() => { onSelect(section); onClose(); }} className={`vault-navigation__item ${activeSlug === section.slug ? 'is-active' : ''}`}><span className="truncate">{section.title}</span>{section.is_sensitive === 1 && <LockKeyhole className="h-3.5 w-3.5" />}</button>)}</div>;

const VaultHome = ({ home, quickSections, onSelect, onOpen }: { home: any; quickSections: any[]; onSelect: (section: any) => void; onOpen: (id: number) => void }) => <div className="vault-page"><div className="vault-page-heading"><div><p className="vault-kicker">CODE Rx VAULT</p><h1>Knowledge and documentation workspace.</h1><p>Recent work, connected records, and Society institutional memory.</p></div></div><div className="vault-home-grid"><DocumentCollection title="Recently Updated" documents={home?.recentDocuments || []} onOpen={onOpen} /><DocumentCollection title="My Documents" documents={home?.myDocuments || []} onOpen={onOpen} /></div><section className="vault-section-block"><div className="vault-section-heading"><BookOpen className="h-5 w-5 text-emerald-600" /><h2>Quick Access</h2></div><div className="vault-quick-grid">{quickSections.map((section) => <button key={section.slug} onClick={() => onSelect(section)} className="vault-quick-item"><strong>{section.title}</strong><span>{section.documentCount || 0} documents</span></button>)}</div></section><section className="vault-section-block"><ActivityTimeline items={home?.recentActivity || []} /></section></div>;

const SectionList = ({ section, documents, projects, loading, canCreate, onNew, onOpen }: any) => <div className="vault-page"><div className="vault-page-heading vault-page-heading--row"><div><p className="vault-kicker">{section?.slug}</p><h1>{section?.title}</h1><p>{section?.description}</p></div>{canCreate && <button onClick={onNew} className="vault-new-button"><FilePlus2 className="h-4 w-4" />New Document</button>}</div>{loading ? <div className="grid min-h-60 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-600" /></div> : <><div className="vault-table-wrap"><table className="vault-document-table"><thead><tr><th>Name</th><th>Updated</th><th>Author</th><th>Status</th></tr></thead><tbody>{documents.map((document: any) => <tr key={document.id} onClick={() => onOpen(document.id)}><td><span className="flex items-center gap-3"><FileText className="h-4 w-4 text-emerald-600" /><strong>{document.title}</strong></span></td><td>{dateLabel(document.updated_at)}</td><td>{document.updated_by_name || document.created_by_name || 'Code Rx member'}</td><td><span className="vault-status-pill">{document.status || 'draft'}</span></td></tr>)}{!documents.length && <tr><td colSpan={4}><EmptyState label="No documents in this section yet." /></td></tr>}</tbody></table></div>{section?.slug === 'projects' && <ProjectLinks projects={projects} />}</>}</div>;

const DocumentCollection = ({ title, documents, onOpen }: { title: string; documents: any[]; onOpen: (id: number) => void }) => <section className="vault-collection"><div className="vault-section-heading"><History className="h-5 w-5 text-emerald-600" /><h2>{title}</h2></div>{documents.length ? <div className="vault-row-list">{documents.slice(0, 6).map((document) => <button key={document.id} onClick={() => onOpen(document.id)} className="vault-document-row"><span><strong>{document.title}</strong><small>{document.section_title || document.section_slug} · {dateLabel(document.updated_at)}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}</div> : <EmptyState label="Nothing to show yet." />}</section>;

const ProjectLinks = ({ projects }: { projects: any[] }) => <section className="vault-section-block"><div className="vault-section-heading"><FolderKanban className="h-5 w-5 text-emerald-600" /><h2>Project Documentation</h2></div><div className="vault-row-list">{projects.length ? projects.slice(0, 6).map((project) => <div key={project.id} className="vault-project-row"><strong>{project.title}</strong><span>{project.status} · {project.description || 'No project summary yet.'}</span></div>) : <EmptyState label="No accessible Vault projects yet." />}</div></section>;

const ActivityTimeline = ({ items }: { items: any[] }) => <div><div className="vault-section-heading"><History className="h-5 w-5 text-emerald-600" /><h2>Recent Activity</h2></div><div className="vault-activity-list">{items.length ? items.slice(0, 10).map((item) => <div key={`${item.id}-${item.created_at}`} className="vault-activity-row"><span className="vault-activity-dot" /><div><strong>{String(item.action || '').replace(/\./g, ' ')}</strong><small>{item.actor_name || 'Code Rx member'}{item.document_title ? ` · ${item.document_title}` : ''} · {dateLabel(item.created_at)}</small></div></div>) : <EmptyState label="Activity will appear as documentation is created and updated." />}</div></div>;

const SearchResults = ({ results, onBack, onOpen }: { results: any[]; onBack: () => void; onOpen: (id: number) => void }) => <div className="vault-page"><button onClick={onBack} className="vault-back-link"><ArrowLeft className="h-4 w-4" />Back to Vault</button><div className="vault-page-heading"><p className="vault-kicker">Search</p><h1>Search results</h1><p>{results.length} matching document{results.length === 1 ? '' : 's'}</p></div><div className="vault-row-list">{results.map((document) => <button key={document.id} onClick={() => onOpen(document.id)} className="vault-document-row"><span><strong>{document.title}</strong><small>{document.section_title || document.section_slug} · {dateLabel(document.updated_at)}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}{!results.length && <EmptyState label="No matching Vault documents." />}</div></div>;
const EmptyState = ({ label }: { label: string }) => <div className="vault-empty-state"><Archive className="h-6 w-6" /><span>{label}</span></div>;
