import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, Bold, Check, ChevronLeft, ChevronRight, Code2, Command, Copy,
  FileText, Heading1, Heading2, History, ImagePlus, Italic, Link2,
  List, LoaderCircle, Maximize2, Minimize2, Minus, MoreHorizontal,
  Paperclip, Plus, Quote, Redo2, Save, Search, Share2, Strikethrough, Table2,
  Underline, Undo2, X,
} from 'lucide-react';
import { db } from '../lib/cloudflare';
import { VaultShareDialog } from './VaultShareDialog';
import {
  newBlock, parseDocumentContent, plainTextFromBlocks, safeVaultResourceUrl, sanitizeVaultRichText as sanitizeHtml,
  slashCommands, templateCatalog, type VaultBlock, type VaultBlockType,
  type VaultDocumentDraft, wordCount,
} from '../data/vaultEditor';

const CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'bash', 'json', 'yaml', 'markdown', 'plaintext'];
const CALLOUTS: Record<string, { icon: string; title: string; className: string }> = {
  idea: { icon: '💡', title: 'IDEA', className: 'border-amber-200 bg-amber-50 text-amber-950' },
  warning: { icon: '⚠️', title: 'WARNING', className: 'border-orange-200 bg-orange-50 text-orange-950' },
  security: { icon: '🔐', title: 'SECURITY', className: 'border-red-200 bg-red-50 text-red-950' },
  pharmacy: { icon: '💊', title: 'PHARMACY', className: 'border-sky-200 bg-sky-50 text-sky-950' },
  code: { icon: '💻', title: 'CODE', className: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  research: { icon: '🧪', title: 'RESEARCH', className: 'border-violet-200 bg-violet-50 text-violet-950' },
  important: { icon: '📌', title: 'IMPORTANT', className: 'border-slate-300 bg-slate-50 text-slate-950' },
  project: { icon: '🚀', title: 'PROJECT', className: 'border-lime-200 bg-lime-50 text-lime-950' },
};

type SaveState = 'saved' | 'saving' | 'unsaved' | 'offline' | 'error';

interface VaultDocumentEditorProps {
  document: any | null;
  section: any;
  projects: any[];
  canEdit: boolean;
  canManage: boolean;
  canArchive?: boolean;
  canShare?: boolean;
  onArchive?: (id: number) => void | Promise<void>;
  onClose: () => void;
  onSaved: (document: any) => void;
}

const initialDraft = (document: any | null): VaultDocumentDraft => ({
  title: document?.title || '',
  blocks: parseDocumentContent(document?.contentJson || document?.content_json, document?.content || ''),
  tags: Array.isArray(document?.tags) ? document.tags : (() => {
    try { return JSON.parse(document?.tags_json || '[]'); } catch { return []; }
  })(),
  status: ['draft', 'in_review', 'approved', 'active'].includes(document?.status)
    ? document.status as VaultDocumentDraft['status']
    : 'draft',
  visibility: document?.visibility || 'section',
  relatedProjectId: document?.related_project_id || document?.relatedProjectId || null,
});

const draftStorageKey = (documentId: number | null, sectionSlug: string) => `codeRx_vault_draft_${documentId || `new_${sectionSlug}`}`;

export const VaultDocumentEditor = ({ document, section, projects, canEdit, canManage, canArchive = false, canShare = false, onArchive, onClose, onSaved }: VaultDocumentEditorProps) => {
  const [documentId, setDocumentId] = useState<number | null>(document?.id || null);
  const [draft, setDraft] = useState<VaultDocumentDraft>(() => initialDraft(document));
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveMessage, setSaveMessage] = useState('Saved');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [slash, setSlash] = useState<{ blockId: string; query: string } | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showTemplates, setShowTemplates] = useState(!document);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [undo, setUndo] = useState<VaultBlock[][]>([]);
  const [redo, setRedo] = useState<VaultBlock[][]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const documentIdRef = useRef<number | null>(document?.id || null);
  const sourceDocumentIdRef = useRef<number | null>(document?.id || null);
  const revisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const pendingManualSaveRef = useRef(false);

  const replaceDraft = (next: VaultDocumentDraft) => {
    draftRef.current = next;
    setDraft(next);
  };

  const updateDraft = (update: (current: VaultDocumentDraft) => VaultDocumentDraft) => {
    setDraft((current) => {
      const next = update(current);
      draftRef.current = next;
      return next;
    });
  };

  const markDirty = () => {
    revisionRef.current += 1;
    const online = navigator.onLine;
    setSaveState(online ? 'unsaved' : 'offline');
    setSaveMessage(online ? 'Unsaved changes' : 'Offline — draft protected locally');
  };

  useEffect(() => {
    const incomingId = document?.id || null;
    // After creating a new document, the parent supplies its first server
    // snapshot. Do not reset the editor here: edits made while that first save
    // was in flight must remain in the writing canvas and be queued safely.
    if (incomingId && documentIdRef.current === incomingId && sourceDocumentIdRef.current === null) {
      sourceDocumentIdRef.current = incomingId;
      return;
    }

    const next = initialDraft(document);
    const key = draftStorageKey(incomingId, section?.slug || 'vault');
    let restored = next;
    let recovered = false;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.draft?.title || parsed?.draft?.blocks?.length) {
          restored = { ...next, ...parsed.draft, blocks: parseDocumentContent({ blocks: parsed.draft.blocks }, '') };
          recovered = true;
        }
      }
    } catch { /* start with the server draft when local storage is unavailable */ }

    replaceDraft(restored);
    documentIdRef.current = incomingId;
    sourceDocumentIdRef.current = incomingId;
    setDocumentId(incomingId);
    revisionRef.current = recovered ? 1 : 0;
    saveInFlightRef.current = false;
    saveQueuedRef.current = false;
    pendingManualSaveRef.current = false;
    setSaveState(recovered && navigator.onLine ? 'unsaved' : recovered ? 'offline' : 'saved');
    setSaveMessage(recovered ? 'Recovered local draft' : 'Saved');
    setUndo([]); setRedo([]); setActiveBlockId(null); setSlash(null); setShowTemplates(!document);
  }, [document?.id, section?.slug]);

  const setBlocks = (next: VaultBlock[], remember = false) => {
    if (remember) {
      setUndo((history) => [...history, draftRef.current.blocks].slice(-60));
      setRedo([]);
    }
    updateDraft((current) => ({ ...current, blocks: next }));
    markDirty();
  };

  const updateBlock = (id: string, patch: Partial<VaultBlock>, remember = false) => {
    if (remember) {
      setUndo((history) => [...history, draftRef.current.blocks].slice(-60));
      setRedo([]);
    }
    updateDraft((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) }));
    markDirty();
  };

  const insertAfter = (afterId: string | null, type: VaultBlockType, patch: Partial<VaultBlock> = {}) => {
    const block = { ...newBlock(type), ...patch };
    const currentBlocks = draftRef.current.blocks;
    const index = afterId ? currentBlocks.findIndex((item) => item.id === afterId) : currentBlocks.length - 1;
    const next = [...currentBlocks];
    next.splice(Math.max(0, index + 1), 0, block);
    setBlocks(next, true);
    setActiveBlockId(block.id);
    return block;
  };

  const removeBlock = (id: string) => {
    const next = draftRef.current.blocks.filter((block) => block.id !== id);
    setBlocks(next.length ? next : [newBlock('paragraph')], true);
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    const currentBlocks = draftRef.current.blocks;
    const index = currentBlocks.findIndex((block) => block.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentBlocks.length) return;
    const next = [...currentBlocks];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setBlocks(next, true);
  };

  const applyTemplate = (templateId: string) => {
    const template = templateCatalog.find((item) => item.id === templateId);
    if (!template) return;
    setBlocks(template.blocks(), true);
    setShowTemplates(false);
  };

  const applyCommand = (command: typeof slashCommands[number]) => {
    const currentId = slash?.blockId || activeBlockId;
    if (command.type === 'image' || command.type === 'file') {
      setSlash(null);
      setShowPalette(false);
      fileInput.current?.click();
      return;
    }
    if (currentId && command.type !== 'divider') {
      const current = draftRef.current.blocks.find((block) => block.id === currentId);
      const currentText = (current?.content || '').replace(/<[^>]*>/g, '').trim();
      if (current && current.type === 'paragraph' && (!currentText || currentText.startsWith('/'))) {
        updateBlock(currentId, { ...newBlock(command.type), id: currentId, language: command.language }, true);
      } else insertAfter(currentId || null, command.type, { language: command.language });
    } else insertAfter(currentId || null, command.type, { language: command.language });
    setSlash(null);
    setShowPalette(false);
  };

  const executeFormat = (command: string, value?: string) => {
    const currentId = activeBlockId;
    if (!currentId) return;
    window.document.execCommand(command, false, value);
    const target = window.document.getElementById(`vault-rich-${currentId}`);
    if (target) updateBlock(currentId, { content: sanitizeHtml(target.innerHTML) });
  };

  const payloadFor = (current: VaultDocumentDraft) => ({
    title: current.title.trim() || 'Untitled document',
    contentJson: { version: 1, blocks: current.blocks },
    content: plainTextFromBlocks(current.blocks),
    tags: current.tags,
    status: current.status,
    visibility: current.visibility,
    relatedProjectId: current.relatedProjectId,
    autosave: true,
  });

  const protectLocalDraft = (currentId = documentIdRef.current, currentDraft = draftRef.current) => {
    try {
      localStorage.setItem(draftStorageKey(currentId, section.slug), JSON.stringify({ savedAt: new Date().toISOString(), draft: currentDraft }));
    } catch { /* local storage unavailable */ }
  };

  const clearLocalDrafts = (currentId: number) => {
    try {
      localStorage.removeItem(draftStorageKey(currentId, section.slug));
      localStorage.removeItem(draftStorageKey(null, section.slug));
    } catch { /* local storage unavailable */ }
  };

  const persist = async (manual = false) => {
    const snapshot = draftRef.current;
    if (!canEdit || !snapshot.title.trim()) return;
    protectLocalDraft(documentIdRef.current, snapshot);
    if (!navigator.onLine) {
      setSaveState('offline'); setSaveMessage('Offline — draft protected locally');
      return;
    }
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      pendingManualSaveRef.current ||= manual;
      return;
    }

    const startingRevision = revisionRef.current;
    saveInFlightRef.current = true;
    setSaveState('saving'); setSaveMessage('Saving…');
    let shouldFollowUp = false;
    try {
      let currentId = documentIdRef.current;
      if (!currentId) {
        const result = await db.vault.createDocument({ section: section.slug, ...payloadFor(snapshot), autosave: !manual });
        currentId = result.data.id;
        documentIdRef.current = currentId;
        setDocumentId(currentId);
      } else {
        await db.vault.updateDocument(currentId, {
          ...payloadFor(snapshot),
          autosave: !manual,
          changeNote: manual ? 'Saved from Code Rx Vault editor' : 'Autosaved document update',
        });
      }
      if (!currentId) throw new Error('Document could not be initialized.');
      const saved = await db.vault.document(currentId);
      shouldFollowUp = revisionRef.current !== startingRevision || saveQueuedRef.current;
      if (shouldFollowUp) {
        setSaveState('unsaved');
        setSaveMessage('Unsaved changes');
      } else {
        clearLocalDrafts(currentId);
        setSaveState('saved');
        setSaveMessage(manual ? 'Saved just now' : 'Saved');
      }
      onSaved(saved);
    } catch (error: any) {
      protectLocalDraft(documentIdRef.current, draftRef.current);
      setSaveState('error');
      setSaveMessage(error?.message || "Couldn't save your changes. Retry when ready.");
    } finally {
      saveInFlightRef.current = false;
      if (shouldFollowUp) {
        const queuedManual = pendingManualSaveRef.current;
        saveQueuedRef.current = false;
        pendingManualSaveRef.current = false;
        window.setTimeout(() => { void persist(queuedManual); }, 0);
      } else {
        saveQueuedRef.current = false;
        pendingManualSaveRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (!canEdit || saveState !== 'unsaved' || !draft.title.trim()) return;
    protectLocalDraft();
    const timer = window.setTimeout(() => { void persist(false); }, 1400);
    return () => window.clearTimeout(timer);
  }, [draft.title, JSON.stringify(draft.blocks), JSON.stringify(draft.tags), draft.status, draft.visibility, draft.relatedProjectId, saveState, canEdit]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setShowPalette(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); void persist(true);
      }
      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !editingText) {
        event.preventDefault();
        setUndo((history) => {
          const previous = history[history.length - 1]; if (!previous) return history;
          setRedo((future) => [...future, draftRef.current.blocks]); setBlocks(previous, false);
          return history.slice(0, -1);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draft.blocks, undo, canEdit]);

  const uploadAttachment = async (file: File) => {
    setUploading(true);
    try {
      const result = await db.vault.uploadFile(file, section.slug, documentIdRef.current || undefined);
      const isImage = file.type.startsWith('image/');
      insertAfter(activeBlockId, isImage ? 'image' : 'file', {
        fileKey: result.fileKey,
        attachmentId: result.attachment?.id,
        url: result.url,
        caption: file.name,
        content: file.name,
      });
    } catch (error: any) {
      setSaveState('error'); setSaveMessage(error?.message || 'Attachment upload failed. Retry when connected.');
    } finally { setUploading(false); }
  };

  const filteredCommands = useMemo(() => {
    const query = slash?.query?.toLowerCase().replace(/^\//, '') || '';
    return slashCommands.filter((command) => !query || `${command.label} ${command.hint}`.toLowerCase().includes(query));
  }, [slash]);
  const headings = draft.blocks.filter((block) => block.type === 'heading' && block.content?.replace(/<[^>]+>/g, '').trim());
  const words = wordCount(draft.blocks);
  const canPublicShare = canShare && !section?.is_sensitive && draft.visibility !== 'restricted';
  const shellClass = focusMode ? 'vault-editor vault-editor--focus' : 'vault-editor';

  return <div className={shellClass}><div className="vault-editor__header"><div className="vault-editor__crumb"><button onClick={focusMode ? () => setFocusMode(false) : onClose} className="vault-editor__back"><ChevronLeft className="h-4 w-4" />{focusMode ? 'Exit focus mode' : `Vault / ${section.title}`}</button><span>/</span><span className="truncate">{draft.title || 'Untitled document'}</span></div><div className="vault-editor__actions"><SaveIndicator state={saveState} message={saveMessage} /><button onClick={() => setShowOutline((value) => !value)} className="editor-icon-button" title="Document outline">Outline</button><button onClick={() => { if (documentId) void db.vault.documentVersions(documentId).then(setVersions).then(() => setShowHistory(true)); }} disabled={!documentId} className="editor-icon-button" title="Version history"><History className="h-4 w-4" /></button><button onClick={() => setFocusMode((value) => !value)} className="editor-icon-button" title="Focus mode">{focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>{canPublicShare && documentId && <button onClick={() => setShowShare(true)} className="editor-icon-button text-emerald-700 hover:!text-emerald-900" title="Share document"><Share2 className="h-4 w-4" /></button>}{canArchive && documentId && <button onClick={() => { if (window.confirm('Archive this document? Its history will remain available for PHANTOM to restore.')) void onArchive?.(documentId); }} className="editor-icon-button text-slate-500 hover:!text-red-600" title="Archive document"><Archive className="h-4 w-4" /></button>}{canEdit && <button onClick={() => void persist(true)} className="vault-editor__save"><Save className="h-4 w-4" />Save</button>}</div></div>
    <div className={`vault-editor__layout ${showOutline && !focusMode ? 'has-outline' : ''}`}><section className="vault-editor__document"><div className="vault-editor__titlebar">
        <input
          disabled={!canEdit}
          value={draft.title}
          onChange={(event) => { updateDraft((current) => ({ ...current, title: event.target.value })); markDirty(); }}
          placeholder="Untitled document"
          className="vault-editor__title"
        />
        <div className="vault-editor__metadata">
          <select
            disabled={!canEdit}
            value={draft.status}
            onChange={(event) => { updateDraft((current) => ({ ...current, status: event.target.value as VaultDocumentDraft['status'] })); markDirty(); }}
            title={canManage ? 'Document status' : 'Only a section manager can approve or activate a document'}
          >
            <option value="draft">DRAFT</option>
            <option value="in_review">IN REVIEW</option>
            <option value="approved" disabled={!canManage}>APPROVED</option>
            <option value="active" disabled={!canManage}>ACTIVE</option>
          </select>
          <select
            disabled={!canEdit}
            value={draft.visibility}
            onChange={(event) => { updateDraft((current) => ({ ...current, visibility: event.target.value as VaultDocumentDraft['visibility'] })); markDirty(); }}
          >
            <option value="section">SECTION</option>
            <option value="members">MEMBERS</option>
            <option value="restricted">RESTRICTED</option>
          </select>
          <select
            disabled={!canEdit}
            value={draft.relatedProjectId || ''}
            onChange={(event) => { updateDraft((current) => ({ ...current, relatedProjectId: event.target.value ? Number(event.target.value) : null })); markDirty(); }}
          >
            <option value="">No related project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
          <TagInput tags={draft.tags} disabled={!canEdit} onChange={(tags) => { updateDraft((current) => ({ ...current, tags })); markDirty(); }} />
        </div>
        {document && <p className="vault-editor__byline">{document.document_code ? `${document.document_code} · ` : ''}Author: {document.created_by_name || 'Code Rx member'} · Created {document.created_at ? new Date(document.created_at).toLocaleDateString() : 'today'} · Last modified by {document.updated_by_name || document.created_by_name || 'Code Rx member'}{document.updated_at ? ` · ${new Date(document.updated_at).toLocaleString()}` : ''}</p>}
      </div>
      {canEdit && <EditorToolbar onFormat={executeFormat} onInsert={(type: VaultBlockType, patch?: Partial<VaultBlock>) => insertAfter(activeBlockId, type, patch)} onPalette={() => setShowPalette(true)} onUndo={() => { const previous = undo[undo.length - 1]; if (previous) { setRedo((future) => [...future, draftRef.current.blocks]); setBlocks(previous, false); setUndo((history) => history.slice(0, -1)); } }} onRedo={() => { const next = redo[redo.length - 1]; if (next) { setUndo((history) => [...history, draftRef.current.blocks]); setBlocks(next, false); setRedo((future) => future.slice(0, -1)); } }} canUndo={Boolean(undo.length)} canRedo={Boolean(redo.length)} onUpload={() => fileInput.current?.click()} />}
      <input ref={fileInput} className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); event.target.value = ''; }} />
      <div className="vault-editor__writing" onDragOver={(event) => { if (canEdit) event.preventDefault(); }} onDrop={(event) => { if (!canEdit) return; event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void uploadAttachment(file); }}><div className="vault-editor__writing-inner">{showTemplates && canEdit && <TemplatePicker onChoose={applyTemplate} onClose={() => setShowTemplates(false)} />}{draft.blocks.map((block) => <DocumentBlockEditor key={block.id} block={block} canEdit={canEdit} active={activeBlockId === block.id} onFocus={() => setActiveBlockId(block.id)} onChange={(patch) => updateBlock(block.id, patch)} onSlash={(query) => setSlash({ blockId: block.id, query })} onInsert={(type) => insertAfter(block.id, type)} onRemove={() => removeBlock(block.id)} onMove={(direction) => moveBlock(block.id, direction)} onUpload={() => fileInput.current?.click()} />)}{canEdit && <button onClick={() => insertAfter(draft.blocks[draft.blocks.length - 1]?.id || null, 'paragraph')} className="vault-editor__add-block"><Plus className="h-4 w-4" />Add block</button>}</div></div>
      <div className="vault-editor__footer"><span>{words.toLocaleString()} words · {draft.blocks.length} blocks{words < 25 ? ` · ${25 - words} more words for the substantive-document score rule when enabled` : ''}</span><span>{uploading ? 'Uploading attachment…' : saveState === 'offline' ? 'Local draft protected' : 'Autosave on · Ctrl/Cmd + K commands · Ctrl/Cmd + S save'}</span></div></section>
      {showOutline && !focusMode && <aside className="vault-editor__outline"><div className="vault-editor__outline-head"><strong>Document Outline</strong><button onClick={() => setShowOutline(false)}><X className="h-4 w-4" /></button></div><div className="mt-3 space-y-1">{headings.map((heading) => <button key={heading.id} onClick={() => window.document.getElementById(`vault-block-${heading.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className={`vault-editor__outline-item ${heading.level === 3 ? 'is-h3' : heading.level === 2 ? 'is-h2' : ''}`}>{stripHtml(heading.content || '')}</button>)}{!headings.length && <p className="text-xs leading-5 text-slate-400">Headings create a navigable outline automatically.</p>}</div></aside>}</div>
      {showShare && documentId && <VaultShareDialog document={{ id: documentId, title: draft.title || 'Untitled document', document_code: document?.document_code || null }} onClose={() => setShowShare(false)} />}{slash && <SlashMenu commands={filteredCommands} onSelect={applyCommand} onClose={() => setSlash(null)} />}{showPalette && <CommandPalette commands={slashCommands} onSelect={applyCommand} onClose={() => setShowPalette(false)} onNewDocument={() => { setBlocks([newBlock('paragraph')], true); setShowPalette(false); }} />}{showHistory && <HistoryPanel documentId={documentId} versions={versions} canRestore={canManage} onClose={() => setShowHistory(false)} onRestore={async (version) => { if (!documentId) return; const result = await db.vault.restoreDocumentVersion(documentId, version); const refreshed = await db.vault.document(documentId); replaceDraft(initialDraft(refreshed)); revisionRef.current = 0; onSaved(refreshed); setSaveState('saved'); setSaveMessage(`Restored version ${version} as v${result.data.version}`); setShowHistory(false); }} />}</div>;

};

const RichBlock = ({ block, tag = 'div', canEdit, onChange, onFocus, onSlash, onMarkdown }: { block: VaultBlock; tag?: 'div' | 'h1' | 'h2' | 'h3' | 'blockquote'; canEdit: boolean; onChange: (patch: Partial<VaultBlock>) => void; onFocus: () => void; onSlash: (query: string) => void; onMarkdown?: (type: VaultBlockType, level?: number) => void }) => {
  const Tag = tag;
  const handleInput = (event: React.FormEvent<HTMLElement>) => {
    const html = sanitizeHtml(event.currentTarget.innerHTML);
    onChange({ content: html });
    const text = event.currentTarget.innerText.trimStart();
    if (text.startsWith('/')) onSlash(text.slice(1));
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!onMarkdown || event.key !== ' ') return;
    const trigger = event.currentTarget.innerText.trim();
    if (trigger === '#') { event.preventDefault(); onMarkdown('heading', 1); }
    else if (trigger === '##') { event.preventDefault(); onMarkdown('heading', 2); }
    else if (trigger === '###') { event.preventDefault(); onMarkdown('heading', 3); }
    else if (trigger === '-' || trigger === '*') { event.preventDefault(); onMarkdown('bulletList'); }
    else if (trigger === '1.') { event.preventDefault(); onMarkdown('numberedList'); }
    else if (trigger === '[]') { event.preventDefault(); onMarkdown('checklist'); }
  };
  return <Tag id={`vault-rich-${block.id}`} contentEditable={canEdit} suppressContentEditableWarning onFocus={onFocus} onInput={handleInput} onKeyDown={handleKeyDown} data-placeholder={canEdit ? 'Type / for commands' : undefined} dangerouslySetInnerHTML={{ __html: block.content || '' }} className="vault-rich-text outline-none empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300" />;
};

const DocumentBlockEditor = ({ block, canEdit, active, onFocus, onChange, onSlash, onInsert, onRemove, onMove, onUpload }: { block: VaultBlock; canEdit: boolean; active: boolean; onFocus: () => void; onChange: (patch: Partial<VaultBlock>) => void; onSlash: (query: string) => void; onInsert: (type: VaultBlockType) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; onUpload: () => void }) => {
  const [menu, setMenu] = useState(false);
  const shell = `group relative rounded-xl transition ${active ? 'ring-1 ring-emerald-200' : ''}`;
  const controls = canEdit && <div className="absolute -left-9 top-1 hidden flex-col gap-1 group-hover:flex"><button onClick={() => onMove(-1)} className="block-control">↑</button><button onClick={() => onMove(1)} className="block-control">↓</button><button onClick={() => setMenu((open) => !open)} className="block-control"><MoreHorizontal className="h-3.5 w-3.5" /></button>{menu && <div className="absolute left-7 top-0 z-20 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"><button onClick={() => onInsert('paragraph')} className="block-menu-item">Insert text after</button><button onClick={onRemove} className="block-menu-item text-red-600">Delete block</button></div>}</div>;
  if (block.type === 'heading') {
    const tag = block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2';
    return <div id={`vault-block-${block.id}`} className={shell}>{controls}<RichBlock block={block} tag={tag} canEdit={canEdit} onFocus={onFocus} onChange={onChange} onSlash={onSlash} onMarkdown={(type, level) => onChange({ ...newBlock(type), id: block.id, level })} /></div>;
  }
  if (block.type === 'paragraph') return <div id={`vault-block-${block.id}`} className={shell}>{controls}<RichBlock block={block} canEdit={canEdit} onFocus={onFocus} onChange={onChange} onSlash={onSlash} onMarkdown={(type, level) => onChange({ ...newBlock(type), id: block.id, level })} /></div>;
  if (block.type === 'quote') return <div id={`vault-block-${block.id}`} className={`${shell} border-l-4 border-emerald-500 bg-emerald-50/50 px-5 py-3 text-slate-700`}>{controls}<RichBlock block={block} tag="blockquote" canEdit={canEdit} onFocus={onFocus} onChange={onChange} onSlash={onSlash} /></div>;
  if (block.type === 'callout') { const callout = CALLOUTS[block.variant || 'important'] || CALLOUTS.important; return <div id={`vault-block-${block.id}`} className={`${shell} border p-4 ${callout.className}`}>{controls}<div className="mb-2 flex items-center justify-between"><span className="text-xs font-black tracking-wider">{callout.icon} {callout.title}</span>{canEdit && <select value={block.variant || 'important'} onChange={(event) => onChange({ variant: event.target.value as VaultBlock['variant'] })} className="rounded border border-current/20 bg-white/50 px-2 py-1 text-[10px] font-bold"><option value="idea">IDEA</option><option value="warning">WARNING</option><option value="security">SECURITY</option><option value="pharmacy">PHARMACY</option><option value="code">CODE</option><option value="research">RESEARCH</option><option value="important">IMPORTANT</option><option value="project">PROJECT</option></select>}</div><RichBlock block={block} canEdit={canEdit} onFocus={onFocus} onChange={onChange} onSlash={onSlash} onMarkdown={(type, level) => onChange({ ...newBlock(type), id: block.id, level })} /></div> }
  if (block.type === 'bulletList' || block.type === 'numberedList' || block.type === 'checklist') return <ListBlock block={block} shell={shell} controls={controls} canEdit={canEdit} onChange={onChange} onFocus={onFocus} />;
  if (block.type === 'code') return <CodeBlock block={block} shell={shell} controls={controls} canEdit={canEdit} onChange={onChange} onFocus={onFocus} />;
  if (block.type === 'table') return <TableBlock block={block} shell={shell} controls={controls} canEdit={canEdit} onChange={onChange} onFocus={onFocus} />;
  if (block.type === 'divider') return <div id={`vault-block-${block.id}`} className={`${shell} py-5`}>{controls}<hr className="border-0 border-t border-slate-200" /></div>;
  if (block.type === 'image' || block.type === 'file') return <AttachmentBlock block={block} shell={shell} controls={controls} canEdit={canEdit} onChange={onChange} onFocus={onFocus} onUpload={onUpload} />;
  if (block.type === 'formula') return <div id={`vault-block-${block.id}`} className={`${shell} rounded-xl border border-violet-200 bg-violet-50 p-4`}>{controls}<p className="mb-2 text-[10px] font-black uppercase tracking-widest text-violet-600">Formula / notation</p><textarea disabled={!canEdit} value={block.content || ''} onFocus={onFocus} onChange={(event) => onChange({ content: event.target.value })} className="min-h-18 w-full resize-y bg-transparent font-mono text-sm text-violet-950 outline-none" placeholder="e.g. AUC = ∫ C(t) dt" /></div>;
  return <EmbedBlock block={block} shell={shell} controls={controls} canEdit={canEdit} onChange={onChange} onFocus={onFocus} />;
};

const ListBlock = ({ block, shell, controls, canEdit, onChange, onFocus }: any) => {
  const items = block.items || [];
  const listClass = block.type === 'numberedList' ? 'list-decimal' : 'list-disc';
  const updateItem = (index: number, patch: any) => onChange({ items: items.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, ...patch } : item) });
  return <div id={`vault-block-${block.id}`} className={`${shell} px-2 py-1`}>{controls}<div className={block.type === 'checklist' ? 'space-y-2' : `${listClass} ml-5 space-y-2`}>{items.map((item: any, index: number) => <div key={item.id || index} className="flex gap-2"><>{block.type === 'checklist' && <input disabled={!canEdit} type="checkbox" checked={Boolean(item.checked)} onChange={(event) => updateItem(index, { checked: event.target.checked })} className="mt-1.5 h-4 w-4 accent-emerald-600" />}</><div contentEditable={canEdit} suppressContentEditableWarning onFocus={onFocus} onInput={(event) => updateItem(index, { text: sanitizeHtml(event.currentTarget.innerHTML) })} dangerouslySetInnerHTML={{ __html: item.text || '' }} className={`vault-rich-text min-w-0 flex-1 outline-none ${item.checked ? 'text-slate-400 line-through' : ''}`} /></div>)}</div>{canEdit && <button onClick={() => onChange({ items: [...items, { id: crypto.randomUUID?.() || String(Date.now()), text: '', checked: false }] })} className="mt-2 text-xs font-bold text-emerald-600">+ Add item</button>}</div>;
};

const CodeBlock = ({ block, shell, controls, canEdit, onChange, onFocus }: any) => {
  const [editing, setEditing] = useState(!(block.content || ''));
  const copy = async () => { try { await navigator.clipboard.writeText(block.content || ''); } catch { /* clipboard unavailable */ } };
  return <div id={`vault-block-${block.id}`} className={`${shell} overflow-hidden rounded-xl border border-slate-800 bg-[#0c1512] text-slate-100`}>{controls}<div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-emerald-300" /><select disabled={!canEdit} value={block.language || 'plaintext'} onChange={(event) => onChange({ language: event.target.value })} className="bg-transparent text-xs font-bold text-emerald-200 outline-none">{CODE_LANGUAGES.map((language) => <option className="bg-slate-900" key={language} value={language}>{language}</option>)}</select></div><div className="flex gap-2"><button onClick={() => setEditing((value) => !value)} className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10">{editing ? 'Preview' : 'Edit'}</button><button onClick={copy} className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/10"><Copy className="h-3.5 w-3.5" /></button></div></div>{editing && canEdit ? <textarea value={block.content || ''} onFocus={onFocus} onChange={(event) => onChange({ content: event.target.value })} spellCheck={false} className="min-h-40 w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-slate-100 outline-none" placeholder="Write code…" /> : <pre className="max-h-[34rem] overflow-auto p-4 font-mono text-[13px] leading-6"><code>{highlightCode(block.content || '', block.language || 'plaintext')}</code></pre>}</div>;
};

const TableBlock = ({ block, shell, controls, canEdit, onChange, onFocus }: any) => {
  const rows = block.rows || [['', ''], ['', '']];
  const updateCell = (rowIndex: number, cellIndex: number, value: string) => { const next = rows.map((row: string[], currentRow: number) => row.map((cell: string, currentCell: number) => currentRow === rowIndex && currentCell === cellIndex ? sanitizeHtml(value) : cell)); onChange({ rows: next }); };
  return <div id={`vault-block-${block.id}`} className={`${shell} overflow-x-auto rounded-xl border border-slate-200`}>{controls}<table className="min-w-full border-collapse text-sm"><tbody>{rows.map((row: string[], rowIndex: number) => <tr key={rowIndex} className={rowIndex === 0 ? 'bg-slate-50 font-bold' : ''}>{row.map((cell: string, cellIndex: number) => <td key={cellIndex} className="min-w-32 border border-slate-200 p-2"><div contentEditable={canEdit} suppressContentEditableWarning onFocus={onFocus} onInput={(event) => updateCell(rowIndex, cellIndex, event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: cell }} className="min-h-5 outline-none" /></td>)}{canEdit && <td className="border border-slate-200 p-2"><button onClick={() => { const next = rows.map((item: string[], index: number) => index === rowIndex ? [...item, ''] : item); onChange({ rows: next }); }} className="text-xs text-emerald-600">+</button></td>}</tr>)}</tbody></table>{canEdit && <button onClick={() => onChange({ rows: [...rows, Array.from({ length: rows[0]?.length || 2 }, () => '')] })} className="m-3 text-xs font-bold text-emerald-600">+ Add row</button>}</div>;
};

const AttachmentBlock = ({ block, shell, controls, canEdit, onChange, onFocus, onUpload }: any) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const open = async () => {
    if (!block.fileKey) return;
    setLoading(true);
    try { const objectUrl = await db.vault.fetchFile(block.fileKey); setUrl(objectUrl); window.open(objectUrl, '_blank', 'noopener,noreferrer'); } catch { /* caller can retry */ } finally { setLoading(false); }
  };
  const image = block.type === 'image';
  useEffect(() => { if (image && block.fileKey && !url) void open(); }, [image, block.fileKey]);
  return <div id={`vault-block-${block.id}`} className={`${shell} rounded-xl border border-slate-200 bg-slate-50 p-4`}>{controls}{image && url ? <img src={url} alt={stripHtml(block.caption || '') || 'Vault attachment'} className="max-h-[34rem] w-full rounded-lg object-contain" /> : <div className="flex flex-wrap items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700">{image ? <ImagePlus className="h-5 w-5" /> : <Paperclip className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{stripHtml(block.caption || block.content || '') || (image ? 'Image attachment' : 'File attachment')}</p><p className="mt-1 text-xs text-slate-500">{block.fileKey ? 'Protected Vault attachment' : 'Attach a file or image'}</p></div>{block.fileKey && <button onClick={open} disabled={loading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{loading ? 'Opening…' : 'Open'}</button>}{canEdit && <button onClick={onUpload} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Replace</button>}</div>}{canEdit && <input value={block.caption || ''} onFocus={onFocus} onChange={(event) => onChange({ caption: event.target.value, content: event.target.value })} placeholder="Attachment caption" className="mt-3 w-full border-0 bg-transparent text-sm text-slate-600 outline-none" />}</div>;
};

const EmbedBlock = ({ block, shell, controls, canEdit, onChange, onFocus }: any) => {
  const href = safeVaultResourceUrl(block.url) || '#';
  return <div id={`vault-block-${block.id}`} className={`${shell} rounded-xl border border-slate-200 bg-slate-50 p-4`}>
    {controls}
    <div className="flex items-center gap-2 text-emerald-700"><Link2 className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-wider">Linked resource</span></div>
    {canEdit ? <>
      <input value={block.content || ''} onFocus={onFocus} onChange={(event) => onChange({ content: event.target.value })} placeholder="Link title — project, meeting, document, GitHub…" className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <input value={block.url || ''} onChange={(event) => onChange({ url: event.target.value })} placeholder="https://… or Vault reference" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
    </> : <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm font-bold text-emerald-700 hover:underline">{stripHtml(block.content || block.url || 'Linked resource')}</a>}
  </div>;
};

const EditorToolbar = ({ onFormat, onInsert, onPalette, onUndo, onRedo, canUndo, canRedo, onUpload }: any) => {
  const [moreOpen, setMoreOpen] = useState(false);
  return <div className="vault-editor-toolbar"><div className="vault-editor-toolbar__primary"><ToolbarButton label="Bold" onClick={() => onFormat('bold')}><Bold className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Italic" onClick={() => onFormat('italic')}><Italic className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Underline" onClick={() => onFormat('underline')}><Underline className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Strikethrough" onClick={() => onFormat('strikeThrough')}><Strikethrough className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Highlight" onClick={() => onFormat('hiliteColor', '#fef08a')}><span className="text-[10px] font-black">HL</span></ToolbarButton><span className="editor-toolbar-divider" /><ToolbarButton label="Heading 1" onClick={() => onInsert('heading', { level: 1 })}><Heading1 className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Heading 2" onClick={() => onInsert('heading', { level: 2 })}><Heading2 className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Heading 3" onClick={() => onInsert('heading', { level: 3 })}><span className="text-[10px] font-black">H3</span></ToolbarButton><ToolbarButton label="List" onClick={() => onInsert('bulletList')}><List className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Checklist" onClick={() => onInsert('checklist')}><Check className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Link" onClick={() => onInsert('embed')}><Link2 className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Code" onClick={() => onInsert('code')}><Code2 className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Quote" onClick={() => onInsert('quote')}><Quote className="h-4 w-4" /></ToolbarButton><div className="vault-editor-toolbar__more"><ToolbarButton label="More blocks" onClick={() => setMoreOpen((open) => !open)}><Plus className="h-4 w-4" /></ToolbarButton>{moreOpen && <div className="vault-editor-toolbar__menu"><button onClick={() => { onInsert('table'); setMoreOpen(false); }}><Table2 className="h-4 w-4" />Table</button><button onClick={() => { onUpload(); setMoreOpen(false); }}><ImagePlus className="h-4 w-4" />Image / File</button><button onClick={() => { onInsert('callout'); setMoreOpen(false); }}><span>💡</span>Callout</button><button onClick={() => { onInsert('divider'); setMoreOpen(false); }}><Minus className="h-4 w-4" />Divider</button><button onClick={() => { onInsert('code'); setMoreOpen(false); }}><Code2 className="h-4 w-4" />Code block</button><button onClick={() => { onInsert('embed', { content: 'Project link' }); setMoreOpen(false); }}><FileText className="h-4 w-4" />Project</button><button onClick={() => { onInsert('embed', { content: 'GitHub repository' }); setMoreOpen(false); }}><Link2 className="h-4 w-4" />GitHub</button></div>}</div></div><div className="vault-editor-toolbar__secondary"><ToolbarButton label="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 className="h-4 w-4" /></ToolbarButton><ToolbarButton label="Command palette" onClick={onPalette}><Command className="h-4 w-4" /></ToolbarButton></div></div>;
};

const ToolbarButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => <button type="button" title={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="editor-toolbar-button disabled:opacity-30">{children}</button>;

const TagInput = ({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange: (tags: string[]) => void }) => { const [value, setValue] = useState(''); const add = () => { const normalized = value.trim().replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_-]/g, ''); if (normalized && !tags.includes(normalized)) onChange([...tags, normalized]); setValue(''); }; return <div className="flex flex-wrap items-center gap-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tags</span>{tags.map((tag) => <button disabled={disabled} key={tag} onClick={() => onChange(tags.filter((item) => item !== tag))} className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">#{tag} ×</button>)}{!disabled && <input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); } }} onBlur={add} placeholder="#tag" className="w-20 bg-transparent text-xs outline-none placeholder:text-slate-300" />}</div> };

const SlashMenu = ({ commands, onSelect, onClose }: { commands: typeof slashCommands; onSelect: (command: typeof slashCommands[number]) => void; onClose: () => void }) => <div className="fixed bottom-5 left-1/2 z-[140] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"><div className="mb-1 flex items-center justify-between px-3 py-2"><span className="text-xs font-black uppercase tracking-widest text-emerald-600">Slash commands</span><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="grid max-h-64 overflow-y-auto sm:grid-cols-2">{commands.map((command) => <button key={command.id} onClick={() => onSelect(command)} className="rounded-xl px-3 py-2.5 text-left hover:bg-emerald-50"><span className="block text-sm font-black text-slate-800">{command.label}</span><span className="text-xs text-slate-500">{command.hint}</span></button>)}</div></div>;

const CommandPalette = ({ commands, onSelect, onClose, onNewDocument }: { commands: typeof slashCommands; onSelect: (command: typeof slashCommands[number]) => void; onClose: () => void; onNewDocument: () => void }) => { const [query, setQuery] = useState(''); const filtered = commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase())); return <div className="fixed inset-0 z-[150] flex items-start justify-center bg-slate-950/35 p-4 pt-[15vh] backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b border-slate-100 px-4"><Search className="h-5 w-5 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, create document, insert code…" className="h-14 flex-1 outline-none" /><kbd className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-400">ESC</kbd></div><button onClick={onNewDocument} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-emerald-50"><FileText className="h-4 w-4 text-emerald-600" /><span><strong className="block text-sm text-slate-800">New blank document</strong><small className="text-slate-500">Clear the current editor draft</small></span></button><div className="max-h-80 overflow-y-auto p-2">{filtered.map((command) => <button key={command.id} onClick={() => onSelect(command)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-emerald-50"><span><strong className="block text-sm text-slate-800">{command.label}</strong><small className="text-slate-500">{command.hint}</small></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}</div></div></div> };

const TemplatePicker = ({ onChoose, onClose }: { onChoose: (id: string) => void; onClose: () => void }) => <div className="mb-7 rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Document templates</p><h3 className="mt-1 text-lg font-black text-slate-900">Start with a Code Rx structure</h3></div><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{templateCatalog.map((template) => <button key={template.id} onClick={() => onChoose(template.id)} className="rounded-xl border border-emerald-100 bg-white p-3 text-left hover:border-emerald-300"><strong className="block text-sm text-slate-800">{template.title}</strong><small className="mt-1 block text-xs leading-5 text-slate-500">{template.description}</small></button>)}</div></div>;

const HistoryPanel = ({ documentId, versions, canRestore, onClose, onRestore }: { documentId: number | null; versions: any[]; canRestore: boolean; onClose: () => void; onRestore: (version: number) => void }) => <div className="fixed inset-0 z-[145] flex justify-end bg-slate-950/30" onClick={onClose}><aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Document history</p><h3 className="mt-1 text-xl font-black text-slate-900">Version timeline</h3></div><button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button></div><div className="mt-6 space-y-3">{versions.map((version) => <article key={version.version_number} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between"><strong className="text-sm text-slate-800">v{version.version_number}</strong><span className="text-[10px] font-black uppercase text-emerald-600">{version.status || 'draft'}</span></div><p className="mt-2 text-xs text-slate-500">{version.change_note || 'Saved version'} · {version.created_at}</p>{canRestore && documentId && <button onClick={() => onRestore(version.version_number)} className="mt-3 text-xs font-black text-emerald-700 hover:underline">Restore this version</button>}</article>)}{!versions.length && <p className="text-sm text-slate-500">No saved versions yet.</p>}</div></aside></div>;

const SaveIndicator = ({ state, message }: { state: SaveState; message: string }) => <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${state === 'saved' ? 'bg-emerald-50 text-emerald-700' : state === 'saving' ? 'bg-sky-50 text-sky-700' : state === 'error' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{state === 'saving' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : state === 'saved' ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}{message}</span>;

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
const highlightCode = (code: string, language: string) => code.split(/(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|SELECT|FROM|WHERE|INSERT|UPDATE|CREATE|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g).map((part, index) => { const cls = /^(\/\/|#)/.test(part) ? 'text-slate-500' : /^['"]/.test(part) ? 'text-amber-300' : /^\d/.test(part) ? 'text-cyan-300' : /^(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|SELECT|FROM|WHERE|INSERT|UPDATE|CREATE|true|false|null)$/.test(part) ? 'text-fuchsia-300' : ''; return <span key={`${language}-${index}`} className={cls}>{part}</span>; });
