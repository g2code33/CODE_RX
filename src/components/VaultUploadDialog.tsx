import { useRef, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import { useModalBehaviour } from './AppDialog';
import { VaultUploadField } from './VaultUploadField';
import {
  titleFromFileName,
  uploadDocumentStatus,
  uploadFileAsVaultDocument,
  type UploadedVaultDocument,
} from '../lib/vaultUploads';

/**
 * Phase 18 — internal document creation from a file.
 *
 * "New Document" opens a blank editor; this opens the same document *from an
 * uploaded file*. The upload and the document create both go through the
 * existing Vault endpoints, so an uploaded document is an ordinary Vault
 * document: editable, versioned, searchable, and deliverable to a client
 * through the one stamping pipeline.
 */
export const VaultUploadDialog = ({
  section, onClose, onCreated, onError,
}: {
  section: any;
  onClose: () => void;
  /** Receives the created document so the workspace can open it in the editor. */
  onCreated: (document: UploadedVaultDocument) => void | Promise<void>;
  onError: (message: string) => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehaviour(true, onClose, panelRef);

  const chooseFile = (next: File | null) => {
    setFile(next);
    setError(null);
    if (next && !titleTouched) setTitle(titleFromFileName(next.name));
  };

  const submit = async () => {
    setError(null);
    if (!file) { setError('Choose the document file to upload.'); return; }
    const finalTitle = (title.trim() || titleFromFileName(file.name)).trim();
    if (!finalTitle) { setError('Give the document a title.'); return; }

    setSaving(true);
    try {
      const created = await uploadFileAsVaultDocument({
        file,
        section: section.slug,
        title: finalTitle,
        status: uploadDocumentStatus(section),
      });
      await onCreated(created);
      onClose();
    } catch (failure: any) {
      const message = failure?.message || 'The document could not be uploaded.';
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Upload a document"
      className="fixed inset-0 z-[170] flex items-start justify-center overflow-y-auto bg-emerald-950/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mt-[8vh] w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">Upload a document</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Filed in {section?.title || 'this section'} as a new internal document.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button>
        </div>

        <div className="mt-4 space-y-4">
          <VaultUploadField
            file={file}
            onFile={chooseFile}
            disabled={saving}
            busy={saving}
            hint="The file becomes the document body, so it can be opened, versioned and delivered to a client as a stamped copy later."
          />
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Document title</span>
            <input
              value={title}
              onChange={(event) => { setTitleTouched(true); setTitle(event.target.value); }}
              placeholder="Phase 1 discovery report"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            />
            <span className="mt-1 block text-[11px] font-medium text-slate-500">
              Taken from the file name when you pick one. Rename it any time in the editor.
            </span>
          </label>

          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="mini-button">Cancel</button>
            <button onClick={submit} disabled={saving || !file} className="mini-button mini-button--primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Upload document
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
