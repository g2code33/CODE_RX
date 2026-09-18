import { useModalBehaviour } from './AppDialog';
import { useRef, useState } from 'react';
import { Check, ImageUp, RotateCcw, Smile } from 'lucide-react';
import { db, uploadFile } from '../lib/cloudflare';
import type { SiteContent } from '../data/siteState';
import { SITE_EMOJIS, siteEmojiMediaKey, type SiteEmojiEntry } from '../data/siteEmojis';

/**
 * "Site emojis" — PHANTOM's list of every emoji the website can show.
 *
 * Each row keeps the emoji that ships today and offers one action: replace it
 * with an uploaded PNG/JPEG/WEBP image. The image is stored through the existing
 * media upload (R2 + `/api/files/…`) and recorded in the published site content
 * under `media["emoji.<key>"]`, so the public site picks it up on its next
 * load — no new storage, no new API, no database change. "Use the emoji again"
 * removes the replacement, which restores the original character.
 */
export const SiteEmojiAdmin = ({
  siteContent,
  setSiteContent,
  onSaved,
}: {
  siteContent: SiteContent;
  setSiteContent: (next: SiteContent) => void;
  onSaved?: (message: string) => void;
}) => {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<SiteEmojiEntry | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const previewPanel = useRef<HTMLDivElement>(null);
  useModalBehaviour(Boolean(preview), () => setPreview(null), previewPanel);

  const media = siteContent.media || {};
  const replacedCount = SITE_EMOJIS.filter((entry) => media[siteEmojiMediaKey(entry.key)]?.src).length;

  const saveMedia = async (nextMedia: SiteContent['media'], note: string) => {
    const next: SiteContent = { ...siteContent, media: nextMedia };
    setSiteContent(next);
    await db.siteContent.update(next);
    setMessage({ tone: 'ok', text: note });
    onSaved?.(note);
  };

  const replace = async (entry: SiteEmojiEntry, file: File) => {
    setBusyKey(entry.key);
    setMessage(null);
    try {
      const uploaded = await uploadFile(file, 'emoji');
      await saveMedia(
        { ...media, [siteEmojiMediaKey(entry.key)]: { src: uploaded.url, alt: entry.label } },
        `${entry.label} now shows your uploaded image.`,
      );
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || 'That image could not be uploaded. Use a PNG or JPEG under 10 MB.' });
    } finally {
      setBusyKey(null);
      const input = fileInputs.current[entry.key];
      if (input) input.value = '';
    }
  };

  const restore = async (entry: SiteEmojiEntry) => {
    setBusyKey(entry.key);
    setMessage(null);
    try {
      const nextMedia = { ...media };
      delete nextMedia[siteEmojiMediaKey(entry.key)];
      await saveMedia(nextMedia, `${entry.label} shows the original emoji again.`);
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || 'Could not save that change.' });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Website appearance</p>
          <h3 className="mt-1 text-2xl font-black text-slate-900">Site emojis</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Every emoji the website can show is listed here with the place a visitor sees it. Replace any of them with a
            PNG, JPEG or WEBP image and the site draws your image in its place, at the size of the text around it. Nothing
            changes until you replace an emoji, and “Use the emoji again” restores it.
          </p>
        </div>
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-700">
          {replacedCount} of {SITE_EMOJIS.length} replaced
        </p>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SITE_EMOJIS.map((entry) => {
          const replacement = media[siteEmojiMediaKey(entry.key)];
          const busy = busyKey === entry.key;
          return (
            <article key={entry.key} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-100 bg-slate-50 text-2xl">
                  {replacement?.src ? (
                    <img src={replacement.src} alt={entry.label} className="h-8 w-8 object-contain" />
                  ) : (
                    entry.emoji
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{entry.label}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{entry.where}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{siteEmojiMediaKey(entry.key)}</p>
                </div>
              </div>

              <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                Preview:
                <span className="inline-flex items-center gap-1.5">
                  {entry.emoji}
                  <span className="text-slate-400">→</span>
                  {replacement?.src ? (
                    <img src={replacement.src} alt={`${entry.label} replacement`} className="inline-block h-5 w-5 object-contain" />
                  ) : (
                    <span className="text-slate-400">{entry.emoji}</span>
                  )}
                </span>
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={(node) => { fileInputs.current[entry.key] = node; }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  id={`site-emoji-upload-${entry.key}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void replace(entry, file);
                  }}
                />
                <label
                  htmlFor={`site-emoji-upload-${entry.key}`}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${
                    busy ? 'bg-slate-100 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  <ImageUp className="h-3.5 w-3.5" />
                  {busy ? 'Uploading…' : replacement?.src ? 'Replace image' : 'Use an image'}
                </label>
                <button
                  type="button"
                  onClick={() => void restore(entry)}
                  disabled={busy || !replacement?.src}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Use the emoji again
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(entry)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50"
                >
                  <Smile className="h-3.5 w-3.5" />
                  Where it shows
                </button>
              </div>

              {replacement?.src ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Replaced by your image
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {preview ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-5" role="dialog" aria-modal="true" aria-label="Emoji preview">
          <div ref={previewPanel} tabIndex={-1} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Where visitors see it</p>
            <h4 className="mt-1 text-xl font-black text-slate-900">
              {preview.emoji} {preview.label}
            </h4>
            <p className="mt-3 text-sm leading-6 text-slate-600">{preview.where}</p>
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              The website shows this emoji in the places listed above. When you replace it, every one of those places draws
              your image instead — the words around it do not change.
            </p>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
