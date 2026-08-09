import { useEffect, useState } from 'react';
import { Archive, BookOpen, ChevronLeft, ChevronRight, FilePlus2, FileText, FolderKanban, Code2, History, LoaderCircle, LockKeyhole, Pencil, Save, X } from 'lucide-react';
import { db } from '../lib/cloudflare';

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const Vault = ({ compact = false }: { compact?: boolean }) => {
  const [sections, setSections] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<any | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [editor, setEditor] = useState<{ id?: number; title: string; content: string; changeNote: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSections = async () => {
    setLoading(true);
    try {
      const data = await db.vault.sections();
      setSections(data);
      setActiveSection((current: any | null) => current || data[0] || null);
    } catch (error: any) {
      setMessage(error?.message || 'The Vault could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSections(); }, []);

  const loadDocuments = async (section: any) => {
    if (!section) return;
    setLoadingDocuments(true);
    setSelectedDocument(null);
    try {
      const data = await db.vault.documents(section.slug);
      setDocuments(data);
      if (section.slug === 'projects') setProjects(await db.vault.projects());
      else setProjects([]);
    } catch (error: any) {
      setMessage(error?.message || 'You are not authorized to view this Vault section.');
      setDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  };

  useEffect(() => { loadDocuments(activeSection); }, [activeSection?.slug]);

  const openDocument = async (id: number) => {
    try { setSelectedDocument(await db.vault.document(id)); } catch (error: any) { setMessage(error?.message || 'Could not open this document.'); }
  };

  const saveDocument = async () => {
    if (!editor || !activeSection || !editor.title.trim()) return;
    try {
      if (editor.id) await db.vault.updateDocument(editor.id, { title: editor.title, content: editor.content, changeNote: editor.changeNote || 'Vault update' });
      else await db.vault.createDocument({ section: activeSection.slug, title: editor.title, content: editor.content });
      setEditor(null);
      await loadDocuments(activeSection);
      setMessage('Vault document saved. A version record was created.');
    } catch (error: any) { setMessage(error?.message || 'Could not save this document.'); }
  };

  const archiveDocument = async (id: number) => {
    if (!window.confirm('Archive this document? Its version history will be preserved.')) return;
    try { await db.vault.archiveDocument(id); await loadDocuments(activeSection); setSelectedDocument(null); } catch (error: any) { setMessage(error?.message || 'Could not archive this document.'); }
  };

  const can = (action: string) => Boolean(activeSection?.permissions?.[action]);
  const title = compact ? 'Code Rx Vault' : 'CODE Rx VAULT';

  return <div className={compact ? 'space-y-5' : 'min-h-screen bg-slate-50 pt-20'}><div className={compact ? '' : 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'}><div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm"><div className="relative overflow-hidden border-b border-emerald-100 bg-gradient-to-br from-emerald-950 via-[#073a29] to-slate-950 p-6 text-white sm:p-8"><div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" /><div className="relative flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Internal knowledge & management system</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">View what you are authorized to see. Edit only the responsibilities assigned to you.</p></div>{activeSection && <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-right"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Current section</p><p className="mt-1 text-sm font-black">{activeSection.title}</p></div>}</div></div>
      {message && <div className="mx-5 mt-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"><span>{message}</span><button onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div>}
      {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-600" /></div> : <div className="grid min-h-[550px] lg:grid-cols-[235px_minmax(0,1fr)]"><aside className="border-b border-slate-100 bg-slate-50/80 p-3 lg:border-b-0 lg:border-r"><p className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Vault sections</p><div className="space-y-1">{sections.map((section) => <button key={section.slug} type="button" onClick={() => setActiveSection(section)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${activeSection?.slug === section.slug ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-slate-600 hover:bg-white hover:text-emerald-700'}`}><span className="truncate">{section.title}</span>{section.is_sensitive === 1 && <LockKeyhole className="h-3.5 w-3.5 shrink-0" />}</button>)}</div></aside>
        <main className="min-w-0 p-5 sm:p-7"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">{activeSection?.slug || 'Vault'}</p><h2 className="mt-1 text-2xl font-black text-slate-900">{selectedDocument ? selectedDocument.title : activeSection?.title}</h2><p className="mt-1 text-sm text-slate-500">{selectedDocument ? `Updated ${formatDate(selectedDocument.updated_at)}` : activeSection?.description}</p></div><div className="flex gap-2">{selectedDocument && <button onClick={() => setSelectedDocument(null)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"><ChevronLeft className="h-4 w-4" />Documents</button>}{!selectedDocument && can('create') && <button onClick={() => setEditor({ title: '', content: '', changeNote: '' })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><FilePlus2 className="h-4 w-4" />New document</button>}</div></div>
          {loadingDocuments ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-600" /></div> : selectedDocument ? <article className="max-w-4xl"><div className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selectedDocument.content || 'No written content yet.'}</div></div><div className="mt-4 flex flex-wrap gap-2">{can('edit') && <button onClick={() => setEditor({ id: selectedDocument.id, title: selectedDocument.title, content: selectedDocument.content || '', changeNote: '' })} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><Pencil className="h-3.5 w-3.5" />Edit document</button>}{can('delete') && <button onClick={() => archiveDocument(selectedDocument.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600"><Archive className="h-3.5 w-3.5" />Archive</button>}</div></article> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{documents.map((document) => <button key={document.id} onClick={() => openDocument(document.id)} className="group rounded-2xl border border-slate-100 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg"><FileText className="h-5 w-5 text-emerald-600" /><h3 className="mt-5 font-black text-slate-900">{document.title}</h3><p className="mt-2 text-xs text-slate-500">Updated {formatDate(document.updated_at)}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">Open <ChevronRight className="h-3.5 w-3.5" /></span></button>)}</div>{!documents.length && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-black text-slate-800">No documents here yet</h3><p className="mt-2 text-sm text-slate-500">{can('create') ? 'Create the first trusted record for this section.' : 'Your role can view this section, but cannot create records here.'}</p></div>}{activeSection?.slug === 'projects' && <VaultProjectList projects={projects} canCreate={can('create')} onRefresh={() => loadDocuments(activeSection)} />}</>}</main></div>}
    </div></div>{editor && <DocumentEditor editor={editor} setEditor={setEditor} onClose={() => setEditor(null)} onSave={saveDocument} />}</div>;
};

const DocumentEditor = ({ editor, setEditor, onClose, onSave }: { editor: { id?: number; title: string; content: string; changeNote: string }; setEditor: (editor: { id?: number; title: string; content: string; changeNote: string }) => void; onClose: () => void; onSave: () => void }) => <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Vault document</p><h2 className="mt-1 text-2xl font-black text-slate-900">{editor.id ? 'Edit document' : 'New document'}</h2></div><button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block text-xs font-black uppercase tracking-wider text-slate-500">Title<input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500" /></label><label className="block text-xs font-black uppercase tracking-wider text-slate-500">Content<textarea rows={14} value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500" /></label>{editor.id && <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Version note<input value={editor.changeNote} onChange={(event) => setEditor({ ...editor, changeNote: event.target.value })} placeholder="What changed?" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500" /></label>}<button onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white"><Save className="h-4 w-4" />Save trusted record</button></div></div></div>;

const VaultProjectList = ({ projects, canCreate, onRefresh }: { projects: any[]; canCreate: boolean; onRefresh: () => void }) => {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', githubUrl: '', documentationUrl: '', timeline: '' });
  const [error, setError] = useState('');
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await db.vault.createProject(form);
      setForm({ title: '', description: '', githubUrl: '', documentationUrl: '', timeline: '' });
      setCreating(false);
      onRefresh();
    } catch (reason: any) { setError(reason?.message || 'Could not create Vault project.'); }
  };
  return <section className="mt-8 border-t border-slate-100 pt-7"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-black text-slate-900">Vault project links</h3></div>{canCreate && <button onClick={() => setCreating((open) => !open)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><FilePlus2 className="h-3.5 w-3.5" />New project</button>}</div>{creating && <form onSubmit={create} className="mt-4 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><div className="grid gap-3 sm:grid-cols-2"><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Project name" className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm" /><input value={form.githubUrl} onChange={(event) => setForm({ ...form, githubUrl: event.target.value })} placeholder="GitHub repository URL" className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm" /></div><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Project description" className="min-h-24 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input value={form.documentationUrl} onChange={(event) => setForm({ ...form, documentationUrl: event.target.value })} placeholder="Documentation URL" className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm" /><input value={form.timeline} onChange={(event) => setForm({ ...form, timeline: event.target.value })} placeholder="Timeline / next milestone" className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm" /></div>{error && <p className="text-sm font-medium text-red-600">{error}</p>}<button className="w-fit rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white">Create project</button></form>}<div className="mt-4 grid gap-3 md:grid-cols-2">{projects.map((project) => <article key={project.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{project.status}</p><h4 className="mt-2 font-black text-slate-900">{project.title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{project.description || 'No project description yet.'}</p><div className="mt-4 flex flex-wrap gap-2">{project.github_url && <a target="_blank" rel="noreferrer" href={project.github_url} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Code2 className="h-3.5 w-3.5" />Open repository</a>}{project.documentation_url && <a target="_blank" rel="noreferrer" href={project.documentation_url} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><History className="h-3.5 w-3.5" />Documentation</a>}</div></article>)}</div>{!projects.length && <p className="mt-4 text-sm text-slate-500">No Vault projects have been added yet.</p>}</section>;
};
