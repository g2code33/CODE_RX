import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, BookOpen, ChevronRight, FilePlus2, FileText, FolderKanban, History, Home, LockKeyhole, Menu, Search, X } from 'lucide-react';
import { db } from '../lib/cloudflare';
import { VaultDocumentEditor } from './VaultDocumentEditor';
import { RecentItems } from './RecentItems';

type VaultMode = 'member' | 'phantom';
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const Vault = ({
  compact = false,
  workspaceMode = 'member',
  onBack,
  onHome,
}: {
  compact?: boolean;
  workspaceMode?: VaultMode;
  onBack?: () => void;
  onHome?: () => void;
}) => {
  const [sections, setSections] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [sharing, setSharing] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<any | null>(null);
  const [showHome, setShowHome] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [desktopNavigationOpen, setDesktopNavigationOpen] = useState(true);

  const loadHome = async () => {
    setLoading(true);
    try {
      const [sectionData, homeData, sharingData] = await Promise.all([db.vault.sections(), db.vault.home(), db.vault.sharingStatus()]);
      setSections(sectionData);
      setHome(homeData);
      setSharing(sharingData);
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
        db.vault.documents(section.slug, showArchived),
        section.slug === 'projects' ? db.vault.projects(showArchivedProjects) : Promise.resolve([]),
      ]);
      setDocuments(list); setProjects(projectList);
    } catch (error: any) { setMessage(error?.message || 'You are not authorized to view this Vault section.'); setDocuments([]); setProjects([]); }
    finally { setLoadingDocuments(false); }
  };

  useEffect(() => { if (activeSection && !editorOpen && !showHome) void loadSection(activeSection); }, [activeSection?.slug, editorOpen, showHome, showArchived, showArchivedProjects]);

  const goHome = () => {
    setShowHome(true); setEditorOpen(false); setSelectedDocument(null); setSearchResults([]); setSearchActive(false); setMobileNavigationOpen(false);
  };
  const chooseSection = (section: any) => {
    setActiveSection(section); setShowHome(false); setShowArchived(false); setShowArchivedProjects(false); setEditorOpen(false); setSelectedDocument(null); setSearchResults([]); setSearchActive(false); setMobileNavigationOpen(false);
  };
  const openDocument = async (id: number) => {
    try {
      const document = await db.vault.document(id);
      setActiveSection(sections.find((section) => section.slug === document.section_slug) || activeSection);
      setSelectedDocument(document); setEditorOpen(true); setShowHome(false); setSearchResults([]); setSearchActive(false); setMobileNavigationOpen(false);
    } catch (error: any) { setMessage(error?.message || 'Could not open this document.'); }
  };
  const submitSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!search.trim()) { setSearchResults([]); setSearchActive(false); return; }
    try {
      setSearchActive(true);
      setSearchResults(await db.vault.search(search));
      setShowHome(false);
    } catch (error: any) {
      setSearchActive(false);
      setMessage(error?.message || 'Vault search failed.');
    }
  };
  const can = (action: string) => Boolean(activeSection?.permissions?.[action]);
  const quickSections = useMemo(() => sections.filter((section) => ['society', 'projects', 'technology', 'coding', 'research', 'meetings'].includes(section.slug)), [sections]);

  const navigation = <VaultNavigation sections={sections} activeSlug={showHome ? '__home__' : activeSection?.slug || ''} onHome={goHome} onSelect={chooseSection} onClose={() => setMobileNavigationOpen(false)} />;

  return <div className={`vault-workspace min-h-screen bg-[#f7faf8] text-slate-900 ${workspaceMode === 'phantom' ? 'vault-workspace--phantom' : ''} ${compact ? 'vault-workspace--compact' : ''}`}>
    <header className="vault-appbar"><div className="flex min-w-0 items-center gap-3">{onBack && <button onClick={onBack} className="vault-appbar-button"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">{workspaceMode === 'phantom' ? 'Back to Phantom Control' : 'Back to Member Portal'}</span></button>}{onHome && <button onClick={onHome} className="vault-appbar-button" title={workspaceMode === 'phantom' ? 'Go to Admin home' : 'Go to Member Portal home'}><Home className="h-4 w-4" /><span className="hidden sm:inline">Home</span></button>}<button onClick={() => { if (window.innerWidth < 1024) setMobileNavigationOpen(true); else setDesktopNavigationOpen((current) => !current); }} className="vault-appbar-button" aria-label={desktopNavigationOpen ? 'Hide Vault navigation' : 'Show Vault navigation'}><Menu className="h-4 w-4" /></button><button onClick={goHome} className="flex min-w-0 items-center gap-2 text-left"><img src="/CODE%20RX11.png" alt="" className="h-8 w-8 object-contain" /><span><span className="block text-sm font-black tracking-wide text-slate-900">CODE <span className="text-emerald-600">Rx</span> VAULT</span><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Knowledge workspace</span></span></button></div><form onSubmit={submitSearch} className="vault-search"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Vault" /><button>Search</button></form><div className="flex items-center gap-2">{activeSection && can('create') && <button onClick={() => { setSelectedDocument(null); setEditorOpen(true); setShowHome(false); }} className="vault-new-button"><FilePlus2 className="h-4 w-4" />New</button>}<span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 sm:inline">{workspaceMode === 'phantom' ? 'PHANTOM' : 'MEMBER'}</span></div></header>
    <div className="vault-shell">{desktopNavigationOpen && <aside className="vault-sidebar hidden lg:block">{navigation}</aside>}{mobileNavigationOpen && <div className="vault-mobile-nav"><div className="vault-mobile-nav__scrim" onClick={() => setMobileNavigationOpen(false)} /><aside className="vault-mobile-nav__panel">{navigation}</aside></div>}<main className="vault-main">{message && <div className="mb-4 flex items-start justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><span>{message}</span><button onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div>}{loading ? <div className="grid min-h-[60vh] place-items-center"><p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Opening Code Rx Vault…</p></div> : editorOpen && activeSection ? <VaultDocumentEditor document={selectedDocument} section={activeSection} projects={projects} canEdit={selectedDocument ? can('edit') : can('create')} canManage={can('manage')} canArchive={can('delete')} canShare={Boolean(sharing?.canShare)} canDownload={Boolean(sharing?.canDownload)} onArchive={async (id: number) => { try { await db.vault.archiveDocument(id); setEditorOpen(false); setSelectedDocument(null); void loadSection(activeSection); } catch (error: any) { setMessage(error?.message || 'Could not archive this document.'); } }} onClose={() => { setEditorOpen(false); setSelectedDocument(null); void loadSection(activeSection); }} onSaved={(document) => { setSelectedDocument(document); void loadHome(); }} /> : searchActive ? <SearchResults results={searchResults} onBack={() => { setSearchResults([]); setSearchActive(false); }} onOpen={openDocument} /> : showHome ? <VaultHome home={home} quickSections={quickSections} onSelect={chooseSection} onOpen={openDocument} /> : <SectionList section={activeSection} documents={documents} projects={projects} loading={loadingDocuments} canCreate={can('create')} canManage={can('manage')} archived={showArchived} archivedProjects={showArchivedProjects} onToggleArchived={() => setShowArchived((value) => !value)} onToggleArchivedProjects={() => setShowArchivedProjects((value) => !value)} onNew={() => { setSelectedDocument(null); setEditorOpen(true); }} onOpen={openDocument} onUnarchive={async (id: number) => { try { await db.vault.unarchiveDocument(id); void loadSection(activeSection); } catch (error: any) { setMessage(error?.message || 'Could not restore this document.'); } }} onArchiveProject={async (id: number, archive: boolean) => { try { await db.vault.updateProject(id, { archive }); void loadSection(activeSection); } catch (error: any) { setMessage(error?.message || `Could not ${archive ? 'archive' : 'restore'} this project.`); } }} />}</main></div></div>;
};

const VaultNavigation = ({ sections, activeSlug, onHome, onSelect, onClose }: { sections: any[]; activeSlug: string; onHome: () => void; onSelect: (section: any) => void; onClose: () => void }) => <div className="vault-navigation"><button onClick={onHome} className={`vault-navigation__item ${activeSlug === '__home__' ? 'is-active' : ''}`}><Home className="h-4 w-4" />Vault Home</button><p className="vault-navigation__label">Vault</p>{sections.map((section) => <button key={section.slug} onClick={() => { onSelect(section); onClose(); }} className={`vault-navigation__item ${activeSlug === section.slug ? 'is-active' : ''}`}><span className="truncate">{section.title}</span>{section.is_sensitive === 1 && <LockKeyhole className="h-3.5 w-3.5" />}</button>)}</div>;

const VaultHome = ({ home, quickSections, onSelect, onOpen }: { home: any; quickSections: any[]; onSelect: (section: any) => void; onOpen: (id: number) => void }) => <div className="vault-page"><div className="vault-page-heading"><div><p className="vault-kicker">CODE Rx VAULT</p><h1>Knowledge and documentation workspace.</h1><p>Recent work, connected records, and Society institutional memory.</p></div></div><div className="vault-home-grid"><DocumentCollection title="Recently Updated" documents={home?.recentDocuments || []} onOpen={onOpen} /><DocumentCollection title="My Documents" documents={home?.myDocuments || []} onOpen={onOpen} /></div><section className="vault-section-block"><div className="vault-section-heading"><BookOpen className="h-5 w-5 text-emerald-600" /><h2>Quick Access</h2></div><div className="vault-quick-grid">{quickSections.map((section) => <button key={section.slug} onClick={() => onSelect(section)} className="vault-quick-item"><strong>{section.title}</strong><span>{section.documentCount || 0} documents</span></button>)}</div></section><section className="vault-section-block"><ActivityTimeline items={home?.recentActivity || []} /></section></div>;

const SectionList = ({ section, documents, projects, loading, canCreate, canManage, archived, archivedProjects, onToggleArchived, onToggleArchivedProjects, onNew, onOpen, onUnarchive, onArchiveProject }: any) => <div className="vault-page"><div className="vault-page-heading vault-page-heading--row"><div><p className="vault-kicker">{section?.slug}</p><h1>{archived ? `${section?.title} Archive` : section?.title}</h1><p>{archived ? 'Archived documents are preserved and can be restored by a section manager.' : section?.description}</p></div><div className="flex flex-wrap gap-2">{canManage && <button onClick={onToggleArchived} className="vault-appbar-button">{archived ? 'Active Documents' : 'Archived Documents'}</button>}{canCreate && !archived && <button onClick={onNew} className="vault-new-button"><FilePlus2 className="h-4 w-4" />New Document</button>}</div></div>{loading ? <div className="grid min-h-60 place-items-center"><p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Loading documents…</p></div> : <><div className="vault-table-wrap"><table className="vault-document-table"><thead><tr><th>Name</th><th>Updated</th><th>Author</th><th>Status</th>{archived && <th className="text-right">Restore</th>}</tr></thead><tbody>{documents.map((document: any) => <tr key={document.id} onClick={() => !archived && onOpen(document.id)}><td><span className="flex items-center gap-3"><FileText className="h-4 w-4 text-emerald-600" /><span className="flex min-w-0 flex-col"><strong>{document.title}</strong>{document.document_code && <small className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">{document.document_code}</small>}</span></span></td><td>{dateLabel(document.updated_at)}</td><td>{document.updated_by_name || document.created_by_name || 'Code Rx member'}</td><td><span className="vault-status-pill">{archived ? document.archived_from_status || 'draft' : document.status || 'draft'}</span></td>{archived && <td className="text-right"><button onClick={(event) => { event.stopPropagation(); onUnarchive(document.id); }} className="mini-button text-emerald-700">Unarchive</button></td>}</tr>)}{!documents.length && <tr><td colSpan={archived ? 5 : 4}><EmptyState label={archived ? 'No archived documents in this section.' : 'No documents in this section yet.'} /></td></tr>}</tbody></table></div>{section?.slug === 'projects' && !archived && <ProjectLinks projects={projects} canManage={canManage} archived={archivedProjects} onToggleArchived={onToggleArchivedProjects} onArchive={onArchiveProject} />}</>}</div>;

const DocumentCollection = ({ title, documents, onOpen }: { title: string; documents: any[]; onOpen: (id: number) => void }) => <section className="vault-collection"><div className="vault-section-heading"><History className="h-5 w-5 text-emerald-600" /><h2>{title}</h2></div>{documents.length ? <div className="vault-row-list"><RecentItems items={documents} label="documents" render={(document) => <button key={document.id} onClick={() => onOpen(document.id)} className="vault-document-row"><span><strong>{document.title}</strong><small>{document.document_code ? `${document.document_code} · ` : ''}{document.section_title || document.section_slug} · {dateLabel(document.updated_at)}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>} /></div> : <EmptyState label="Nothing to show yet." />}</section>;

const ProjectLinks = ({ projects, canManage, archived, onToggleArchived, onArchive }: { projects: any[]; canManage: boolean; archived: boolean; onToggleArchived: () => void; onArchive: (id: number, archive: boolean) => void }) => <section className="vault-section-block"><div className="vault-section-heading"><FolderKanban className="h-5 w-5 text-emerald-600" /><h2>{archived ? 'Archived Projects' : 'Project Documentation'}</h2>{canManage && <button onClick={onToggleArchived} className="ml-auto mini-button text-emerald-700">{archived ? 'Active Projects' : 'Archived Projects'}</button>}</div><div className="vault-row-list">{projects.length ? <RecentItems items={projects} label="projects" render={(project) => <div key={project.id} className="vault-project-row"><span><strong>{project.title}</strong><span>{project.status} · {project.description || 'No project summary yet.'}</span></span>{canManage && <button onClick={() => onArchive(project.id, !archived)} className={`mini-button ${archived ? 'text-emerald-700' : 'text-slate-600'}`}>{archived ? 'Unarchive' : 'Archive'}</button>}</div>} /> : <EmptyState label={archived ? 'No archived projects.' : 'No accessible Vault projects yet.'} />}</div></section>;
const ActivityTimeline = ({ items }: { items: any[] }) => <div><div className="vault-section-heading"><History className="h-5 w-5 text-emerald-600" /><h2>Recent Activity</h2></div><div className="vault-activity-list">{items.length ? <RecentItems items={items} label="activity entries" render={(item) => <div key={`${item.id}-${item.created_at}`} className="vault-activity-row"><span className="vault-activity-dot" /><div><strong>{String(item.action || '').replace(/\./g, ' ')}</strong><small>{item.actor_name || 'Code Rx member'}{item.document_title ? ` · ${item.document_title}` : ''} · {dateLabel(item.created_at)}</small></div></div>} /> : <EmptyState label="Activity will appear as documentation is created and updated." />}</div></div>;

const SearchResults = ({ results, onBack, onOpen }: { results: any[]; onBack: () => void; onOpen: (id: number) => void }) => <div className="vault-page"><button onClick={onBack} className="vault-back-link"><ArrowLeft className="h-4 w-4" />Back to Vault</button><div className="vault-page-heading"><p className="vault-kicker">Search</p><h1>Search results</h1><p>{results.length} matching document{results.length === 1 ? '' : 's'}</p></div><div className="vault-row-list">{results.map((document) => <button key={document.id} onClick={() => onOpen(document.id)} className="vault-document-row"><span><strong>{document.title}</strong><small>{document.document_code ? `${document.document_code} · ` : ''}{document.section_title || document.section_slug} · {dateLabel(document.updated_at)}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}{!results.length && <EmptyState label="No matching Vault documents." />}</div></div>;
const EmptyState = ({ label }: { label: string }) => <div className="vault-empty-state"><Archive className="h-6 w-6" /><span>{label}</span></div>;
