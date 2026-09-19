import { useRef, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import { MAX_UPLOAD_BYTES, uploadSizeLabel } from '../lib/vaultUploads';

/**
 * Phase 18 — the one "upload a document file" field, shared by the client
 * publishing dialog and the internal Vault upload dialog. Click or drop.
 *
 * It holds no upload logic: the file is handed to the caller, which uses the
 * existing Vault upload endpoint. Validation here is a courtesy so a wrong file
 * is refused before anything is sent; the server stays the authority.
 */
export const VaultUploadField = ({
  file, onFile, accept, hint, disabled, busy, label = 'Document file',
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: File | null) => {
    if (!next) { setError(null); onFile(null); return; }
    if (next.size > MAX_UPLOAD_BYTES) { setError(`That file is ${uploadSizeLabel(next.size)}. The limit is 10 MB.`); return; }
    setError(null);
    onFile(next);
  };

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div
        onDragOver={(event) => { if (!disabled) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) choose(dropped);
        }}
        className={`mt-2 rounded-2xl border-2 border-dashed p-4 transition ${
          dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept={accept}
          disabled={disabled}
          aria-label="Choose the document file to upload"
          onChange={(event) => { const chosen = event.target.files?.[0] || null; choose(chosen); event.target.value = ''; }}
        />
        {file ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileUp className="h-5 w-5 shrink-0 text-emerald-600" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-800">{file.name}</span>
                <span className="block text-[11px] font-semibold text-slate-500">
                  {uploadSizeLabel(file.size)} · {file.type || 'unknown type'}
                </span>
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => input.current?.click()} disabled={disabled || busy} className="mini-button">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Replace
              </button>
              <button type="button" onClick={() => choose(null)} disabled={disabled || busy} className="mini-button">
                <X className="h-4 w-4" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-600">
              Drag the document here, or
              {' '}
              <button type="button" onClick={() => input.current?.click()} disabled={disabled} className="font-black text-emerald-700 underline underline-offset-2">
                choose a file
              </button>
              .
            </p>
            <span className="text-[11px] font-semibold text-slate-500">Up to 10 MB</span>
          </div>
        )}
      </div>
      {hint ? <p className="mt-2 text-[11px] font-medium text-slate-500">{hint}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error}</p> : null}
    </div>
  );
};
