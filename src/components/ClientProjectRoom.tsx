import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  Eraser,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquareText,
  Paintbrush,
  PenLine,
  Save,
  Send,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import { clientPortal, ClientPortalError } from '../lib/cloudflare';
import { messageForFailure } from '../lib/accessKey';
import {
  landingFor,
  linkDestinationLabel,
  type LinkLanding,
} from '../lib/linkAccess';
import { ClientSiteSign } from './ClientSiteSign';
import { ClientReviewSection } from './ClientReviewSection';
import {
  CATEGORY_LABELS,
  canDownload,
  canPrint,
  deliveryAvailable,
  deliveryMessage,
  freshnessBadge,
  parseDelivery,
  sectionForCategory,
  downloadFileName,
  emptyMessageFor,
  hasAnyPublishedContent,
  overviewFacts,
  publicationInfo,
  sectionLabel,
  visibleSections,
  type RoomDelivery,
  type RoomDocument,
  type RoomSection,
} from '../lib/projectRoom';

export interface ClientPortalContext {
  client: { id: string; name: string; contactName?: string | null };
  project: { id: string; reference: string; name: string; description?: string; status?: string };
  permissions: { view: boolean; download: boolean };
  /**
   * Phase 7: where this session may go. `restricted` is true only for a session
   * minted from a temporary link; a key session sees the whole room. The room
   * renders only what the server offered — the server refuses the rest anyway.
   */
  destination?: {
    restricted: boolean;
    destination: string;
    intent: string;
    section: string | null;
    documentId: string | null;
  } | null;
  /** The single document a document/file link names, when it names one. */
  target?: { id: string; title: string; reference?: string | null; category?: string; version?: string | null } | null;
}

/**
 * The three reads the room performs. The signed-in client uses the client API;
 * PHANTOM's preview passes an equivalent transport backed by the preview
 * endpoints, which return the same payloads. Swapping the transport is what
 * lets PREVIEW render the genuine component without inventing a second room.
 */
export interface RoomTransport {
  project: (projectId: string) => Promise<{ data: { project?: any; sections?: any[]; recent?: any[]; scope?: any } }>;
  section: (projectId: string, section: string) => Promise<{ data: { documents?: any[] } }>;
  document: (projectId: string, documentId: string) => Promise<{ data: { document: any; delivery?: unknown } }>;
  /** Absent in preview: preview never serves a file. */
  download?: (projectId: string, documentId: string, fileName: string) => Promise<void>;
  /** Fetches the stamped client copy as a local object URL. Absent in preview. */
  stampedCopy?: (projectId: string, documentId: string, action: 'preview' | 'print') => Promise<{ url: string; filename: string }>;
  /**
   * Signing. A client reads what Code Rx sent them, signs it, saves the signed
   * copy and sends it back — this is what replaces the old free-text editor.
   */
  signature?: (projectId: string, documentId: string) => Promise<{ data: any }>;
  /** `inkPng` is the pencil pad's canvas (base64 PNG) and `strokes` the drawn lines. */
  /** The drawn mark is required: `inkPng` + `strokes` always accompany the name. */
  sign?: (projectId: string, documentId: string, payload: {
    signerName: string;
    signerTitle?: string;
    inkPng: string;
    strokes: Array<{ points: Array<{ x: number; y: number }> }>;
  }) => Promise<{ message: string; data: any }>;
  /** Send the document back to PHANTOM — the drawn-signed copy only. */
  sendToPhantom?: (projectId: string, documentId: string) => Promise<{ message: string; data: any }>;
  /** The review section: what the client was asked, and their answer. */
  review?: (projectId: string, documentId: string) => Promise<{ data: any }>;
  saveReview?: (projectId: string, documentId: string, decision: string, comment: string) => Promise<{ message: string; data: any }>;
  /** Text PHANTOM: the client's own messages on this project. */
  messages?: (projectId: string) => Promise<{ data: any }>;
  sendMessage?: (projectId: string, payload: { body: string; documentId?: string }) => Promise<{ message: string; data: any }>;
}

interface ClientProjectRoomProps {
  context: ClientPortalContext;
  onSignedOut: () => void;
  /** Called when the server reports that the session is no longer valid. */
  onSessionEnded: (message: string) => void;
  notice?: string | null;
  onNotice: (message: string | null) => void;
  /** Defaults to the client API. Preview supplies its own. */
  transport?: RoomTransport;
  /** Preview mode: the room is read-only and never serves a file. */
  preview?: boolean;
  /** Label for the header action (Log out for clients, Exit preview for PHANTOM). */
  exitLabel?: string;
}

/**
 * The stamped client copy.
 *
 * The portal renders the artifact the server produced — a watermarked Code Rx
 * document — instead of re-typing the stored text. That is what makes the
 * watermark part of the viewer and of anything printed from it. When the server
 * says no stamped copy can be produced, this panel says so and shows nothing
 * else: the internal original is never a fallback.
 */
export const StampedCopyPanel = ({
  delivery, copy, busy, preview, printable, onLoadCopy, onPrint,
}: {
  delivery: RoomDelivery;
  copy: { url: string; filename: string } | null;
  busy: boolean;
  preview: boolean;
  printable: boolean;
  onLoadCopy: () => void;
  onPrint: () => void;
}) => {
  if (!deliveryAvailable(delivery)) {
    return (
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
        {deliveryMessage(delivery)}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-800">
            {delivery.designation || 'CLIENT PROJECT DOCUMENT'}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-900">
            {delivery.label || 'Stamped copy'} · watermarked by Code Rx Society
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {printable ? (
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-50"
          >
            <Eye className="h-3.5 w-3.5" /> Print
          </button>
          ) : null}
          {copy ? (
            <a
              href={copy.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-50"
            >
              <FileText className="h-3.5 w-3.5" /> Open in a new tab
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {preview ? (
          <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
            Preview shows the client&apos;s room, not their files. In their own session the stamped
            {' '}{delivery.label || 'client copy'} opens here.
          </p>
        ) : copy ? (
          <object
            data={copy.url}
            type={delivery.contentType || 'application/pdf'}
            aria-label={`${delivery.label || 'Stamped client copy'} for this document`}
            className="h-[70vh] w-full bg-white"
          >
            <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
              Your browser cannot display this file inline.{' '}
              <a className="underline" href={copy.url} target="_blank" rel="noreferrer">Open the stamped copy</a>.
            </p>
          </object>
        ) : (
          <div className="px-4 py-12 text-center">
            <button
              type="button"
              onClick={onLoadCopy}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-700 disabled:opacity-70"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Open stamped copy
            </button>
            <p className="mt-3 text-xs font-medium text-slate-500">
              Every copy is stamped with the Code Rx watermark, your project reference and the version.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * THE PENCIL SIGNATURE PAD.
 *
 * A freehand drawing surface the client signs with, instead of typing only.
 * Pointer coordinates are written onto a VRAM (in-memory) canvas so the mark
 * is drawn even if the browser renders offscreen canvases lazily; the display
 * canvas copies the VRAM pixels on every refresh. The finished mark travels to
 * the server as a PNG data URL plus its normalized strokes, and the server is
 * the authority that persists the drawn mark (no PDF logic lives here).
 */
const SignaturePad = ({
  label, width, height, disabled, channels,
}: {
  label: string;
  width: number;
  height: number;
  disabled: boolean;
  channels: {
    hasInk: boolean;
    setInkPng: (dataUrl: string | null) => void;
    setStrokes: (strokes: Array<{ points: Array<{ x: number; y: number }> }>) => void;
    setHasInk: (hasInk: boolean) => void;
  };
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vramRef = useRef<HTMLCanvasElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const strokesRef = useRef<Array<{ points: Array<{ x: number; y: number }> }>>([]);
  const currentRef = useRef<Array<{ x: number; y: number }> | null>(null);

  // A brand-codex emerald ink; the slice() keeps it as an opaque stamp colour.
  const INK: [number, number, number] = [15, 23, 42];
  const INK_WIDTH = 3.5;

  /** Mirrors VRAM onto the visible canvas. */
  const composite = useCallback(() => {
    const canvas = canvasRef.current;
    const vram = vramRef.current;
    if (!canvas || !vram) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The faint guide line the client signs above, matching the server's copy.
    ctx.strokeStyle = 'rgba(176, 190, 186, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(24, Math.round(canvas.height * 0.66));
    ctx.lineTo(canvas.width - 24, Math.round(canvas.height * 0.66));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.drawImage(vram, 0, 0);
  }, []);

  const ensureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const vram = vramRef.current;
    if (!canvas) return [];
    // The VRAM is where the mark is actually painted; if the browser never
    // rendered the offscreen copy, composite() still has its pixels.
    if (!vram) {
      vramRef.current = document.createElement('canvas');
    }
    const target = vramRef.current as HTMLCanvasElement;
    target.width = canvas.width;
    target.height = canvas.height;
    return [canvas, target] as const;
  }, []);

  const paint = useCallback(() => {
    composite();
  }, [composite]);

  const drawSegment = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const vram = vramRef.current;
    const ctx = vram?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = `rgb(${INK[0]},${INK[1]},${INK[2]})`;
    ctx.lineWidth = INK_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, []);

  const position = useCallback((event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const padPoint = useCallback((point: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const vram = vramRef.current;
    if (!canvas || !vram) return { x: 0, y: 0 };
    return { x: point.x * vram.width, y: point.y * vram.height };
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || pointerIdRef.current !== null) return;
    ensureCanvas();
    const point = position(event.nativeEvent);
    const px = padPoint(point);
    pointerIdRef.current = event.pointerId;
    currentRef.current = [{ x: point.x, y: point.y }];
    (event.target as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    // A tap still leaves a dot the server records.
    drawSegment(px, { x: px.x + 0.01, y: px.y + 0.01 });
    paint();
  }, [disabled, ensureCanvas, position, padPoint, drawSegment, paint]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId || !currentRef.current) return;
    ensureCanvas();
    const point = position(event.nativeEvent);
    const from = currentRef.current[currentRef.current.length - 1];
    currentRef.current.push(point);
    const pxFrom = padPoint(from);
    const pxTo = padPoint(point);
    drawSegment(pxFrom, pxTo);
    paint();
  }, [ensureCanvas, position, padPoint, drawSegment, paint]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    const stroke = currentRef.current;
    currentRef.current = null;
    if (!stroke) return;
    if (stroke.length < 2) {
      // Record a tap as a one-point stroke (a dot).
      strokesRef.current = [...strokesRef.current.slice(-199), { points: [stroke[0]] }];
    } else {
      // Thin the points so a long flourish stays well under the server cap.
      const keep = stroke.filter((_, index) => index % 4 === 0 || index === stroke.length - 1);
      strokesRef.current = [...strokesRef.current.slice(-199), { points: keep }];
    }
    channels.setStrokes(strokesRef.current);
    // The PNG travels immediately, so "Save" sends what "the pad" last showed.
    const canvas = canvasRef.current;
    const vram = vramRef.current;
    if (canvas && vram) {
      const canvasHasInk = strokesRef.current.length > 0;
      if (canvasHasInk) {
        channels.setInkPng(canvas.toDataURL('image/png'));
      } else {
        channels.setInkPng(null);
      }
      channels.setHasInk(canvasHasInk);
    }
  }, [channels]);

  const clear = useCallback(() => {
    ensureCanvas();
    const vram = vramRef.current;
    const ctx = vram?.getContext('2d');
    if (ctx && vram) ctx.clearRect(0, 0, vram.width, vram.height);
    strokesRef.current = [];
    currentRef.current = null;
    pointerIdRef.current = null;
    channels.setStrokes([]);
    channels.setInkPng(null);
    channels.setHasInk(false);
    paint();
  }, [channels, ensureCanvas, paint]);

  const undo = useCallback(() => {
    ensureCanvas();
    const strokes = strokesRef.current.slice(0, -1);
    strokesRef.current = strokes;
    channels.setStrokes(strokes);
    // Repaint VRAM from scratch so the visible canvas matches the strokes.
    const vram = vramRef.current;
    const ctx = vram?.getContext('2d');
    if (ctx && vram) {
      ctx.clearRect(0, 0, vram.width, vram.height);
      for (const stroke of strokes) {
        const points = stroke.points.map((point) => ({ x: point.x * vram.width, y: point.y * vram.height }));
        if (points.length === 1) {
          drawSegment(points[0], { x: points[0].x + 0.01, y: points[0].y + 0.01 });
          continue;
        }
        for (let index = 1; index < points.length; index += 1) drawSegment(points[index - 1], points[index]);
      }
    }
    const canvas = canvasRef.current;
    if (canvas && strokes.length) channels.setInkPng(canvas.toDataURL('image/png'));
    else channels.setInkPng(null);
    channels.setHasInk(strokes.length > 0);
    paint();
  }, [channels, drawSegment, ensureCanvas, paint]);

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">{label}</p>
      <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-emerald-100">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          aria-label={`Draw your signature for ${label}`}
          role="img"
          className="block h-40 w-full touch-none cursor-crosshair select-none sm:h-48"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={disabled || !channels.hasInk}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !channels.hasInk}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Clear
        </button>
        <span className="ml-auto text-[10px] font-semibold text-slate-500">
          {channels.hasInk ? 'Your mark is ready to save.' : 'Draw with your finger, mouse or pen.'}
        </span>
      </div>
    </div>
  );
};

/**
 * SIGN THIS DOCUMENT.
 *
 * This is what the client does with a document Code Rx sends them: they read
 * it, type their name, draw their mark with the pencil, save the signature,
 * and send the signed copy back to PHANTOM. Nothing here edits the wording —
 * the wording belongs to Code Rx.
 */
const SignaturePanel = ({
  documentTitle, signature, name, title, busy, notice, sendBusy, sendNotice, preview,
  onNameChange, onTitleChange, onSign, onSend, onTextPhantom,
  hasInk, onInkPngChange, onStrokesChange, onHasInkChange,
}: {
  documentTitle: string;
  signature: any | null;
  name: string;
  title: string;
  busy: boolean;
  notice: string | null;
  sendBusy: boolean;
  sendNotice: string | null;
  preview: boolean;
  onNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onSign: () => void;
  onSend: () => void;
  onTextPhantom: () => void;
  hasInk: boolean;
  onInkPngChange: (value: string | null) => void;
  onStrokesChange: (strokes: Array<{ points: Array<{ x: number; y: number }> }>) => void;
  onHasInkChange: (value: boolean) => void;
}) => {
  const current = signature?.current || null;
  const existingDrawn = Boolean(current?.drawn);
  const maxNameChars = Number(signature?.maxNameChars || 120);
  const maxTitleChars = Number(signature?.maxTitleChars || 80);
  const inputClass = 'mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <section
      id="sign-this-document"
      aria-labelledby="sign-this-document-title"
      className="mt-8 scroll-mt-40 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="sign-this-document-title" className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-emerald-900">
            <PenLine className="h-4 w-4" aria-hidden="true" /> Sign this document
          </h3>
          <p className="mt-1.5 max-w-2xl text-xs font-medium leading-5 text-emerald-900">
            Type your full name <strong className="font-black">and</strong> draw your mark with the pencil, then{' '}
            <strong className="font-black">save</strong>. Your drawn mark is written into the signed copy that{' '}
            <strong className="font-black">{documentTitle}</strong> carries for you and for Code Rx — a name
            alone is not a signature.
          </p>
        </div>
        {current ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Signed
          </span>
        ) : (
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600 ring-1 ring-slate-200">
            Not signed yet
          </span>
        )}
      </div>

      {current ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
            {current.signerName}{current.signerTitle ? `, ${current.signerTitle}` : ''}
            {existingDrawn ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                <Paintbrush className="h-3 w-3" aria-hidden="true" /> Drawn mark
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">
            Signed {String(current.signedAt || '').slice(0, 16).replace('T', ' ')}
            {current.version ? ` · version ${current.version}` : ''}
          </p>
        </div>
      ) : null}

      {/* The pencil pad. The server stores the mark that appears here and shows
          it on the signed copy; the pad never replaces the typed name, which
          the server still requires. */}
      {!existingDrawn ? (
        <div className="mt-4">
          <SignaturePad
            label={`Draw your signature${documentTitle ? ` on ${documentTitle}` : ''}`}
            width={1200}
            height={400}
            disabled={preview}
            channels={{
              hasInk,
              setInkPng: onInkPngChange,
              setStrokes: onStrokesChange,
              setHasInk: onHasInkChange,
            }}
          />
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-3 text-xs font-semibold text-emerald-800">
          <Paintbrush className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          Your drawn mark is on this document. Save again to replace it with a new one.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">Your full name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={maxNameChars}
            disabled={preview}
            autoComplete="name"
            placeholder="Your full name"
            aria-label={`Your full name, to sign ${documentTitle}`}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">
            Your role <span className="font-bold normal-case tracking-normal text-emerald-700">(optional)</span>
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            maxLength={maxTitleChars}
            disabled={preview}
            placeholder="e.g. Managing Director"
            aria-label={`Your role, for the signature on ${documentTitle}`}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSign}
          disabled={preview || busy || name.trim().length < 2 || !hasInk}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />} Save signature
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={preview || sendBusy}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:opacity-60"
        >
          {sendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />} Send to PHANTOM
        </button>
        <button
          type="button"
          onClick={onTextPhantom}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-800 underline decoration-emerald-300 underline-offset-4 transition hover:decoration-emerald-600"
        >
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> Ask PHANTOM about this
        </button>
      </div>

      <p className="mt-3 text-[11px] font-semibold text-emerald-900">
        {hasInk
          ? 'Your drawn mark will be saved with this signature.'
          : 'Draw your mark with the pencil — a name alone cannot sign this document.'}
      </p>

      {notice ? (
        <p role="status" className="mt-3 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">{notice}</p>
      ) : null}
      {sendNotice ? (
        <p role="status" className="mt-3 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">{sendNotice}</p>
      ) : null}
      {preview ? (
        <p className="mt-3 text-[11px] font-semibold text-emerald-900">
          Preview — the client signs this in their own session. Nothing here is saved or sent.
        </p>
      ) : null}
    </section>
  );
};

/**
 * TEXT PHANTOM.
 *
 * One place for a client to reach their Code Rx desk without leaving the room.
 * The message reaches PHANTOM through the notification inbox the platform
 * already uses, and it stays in the project so the client can read it back.
 */
const TextPhantomPanel = ({
  open, projectName, documentTitle, text, busy, notice, messages, preview, onTextChange, onSend, onClose,
}: {
  open: boolean;
  projectName: string;
  documentTitle: string | null;
  text: string;
  busy: boolean;
  notice: string | null;
  messages: any[] | null;
  preview: boolean;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Text PHANTOM"
        onClick={(event) => event.stopPropagation()}
        className="my-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900">
              <MessageSquareText className="h-5 w-5 text-emerald-700" aria-hidden="true" /> Text PHANTOM
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              PHANTOM is the Code Rx desk for {projectName}. Write anything you want them to know —
              they are notified the moment you send it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Your message {documentTitle ? `about ${documentTitle}` : `about ${projectName}`}
          </span>
          <textarea
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            rows={5}
            disabled={preview}
            aria-label="Your message to PHANTOM"
            placeholder="Write your message to PHANTOM…"
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 disabled:bg-slate-50"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSend}
            disabled={preview || busy || !text.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />} Send to PHANTOM
          </button>
          <span className="text-[11px] font-semibold text-slate-500">Your message is recorded on this project.</span>
        </div>

        {notice ? (
          <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">{notice}</p>
        ) : null}
        {preview ? (
          <p className="mt-3 text-[11px] font-semibold text-slate-500">
            Preview — sending works from the client&apos;s own session, never from the operator&apos;s.
          </p>
        ) : null}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">What you have sent PHANTOM</p>
          {messages && messages.length ? (
            <ul className="mt-3 space-y-2">
              {messages.slice(0, 5).map((message) => (
                <li key={message.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                  <p className="text-sm font-medium leading-6 text-slate-700">{message.body}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                    {String(message.at || '').slice(0, 16).replace('T', ' ')}
                    {message.document?.title ? ` · ${message.document.title}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-medium text-slate-500">
              Nothing yet. Anything you send here stays in this project, so you can always check back.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const DocumentAction = ({
  document, busy, onView, onDownload,
}: {
  document: RoomDocument;
  busy: boolean;
  onView: () => void;
  onDownload: () => void;
}) => (
  <div className="flex shrink-0 items-center gap-2">
    <button
      type="button"
      onClick={onView}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
    >
      <Eye className="h-3.5 w-3.5" /> View
    </button>
    {/* Download is offered only when the server granted it for this document.
        Viewing never implies downloading. */}
    {canDownload(document) ? (
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        aria-label={`Download ${document.title}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
      </button>
    ) : (
      <span className="hidden items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:inline-flex">
        <LockKeyhole className="h-3.5 w-3.5" /> View only
      </span>
    )}
  </div>
);

const DocumentRow = ({
  document, busy, onView, onDownload,
}: {
  document: RoomDocument;
  busy: boolean;
  onView: () => void;
  onDownload: () => void;
}) => {
  const info = publicationInfo(document);
  const badge = freshnessBadge(document);
  return (
    <li className="flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{document.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
          <span className="uppercase tracking-[0.1em] text-emerald-700">{CATEGORY_LABELS[document.category] || 'Document'}</span>
          {badge ? (
            <span
              title={badge.title}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                badge.label === 'NEW' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
              }`}
            >
              {badge.label}
            </span>
          ) : null}
          {document.reference ? <span className="font-mono uppercase tracking-wider">{document.reference}</span> : null}
          {document.version ? <span>Version {document.version}</span> : null}
          {document.signature ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Signed
            </span>
          ) : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] font-medium text-slate-500">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {info.primary}</span>
          {info.secondary ? <span>{info.secondary}</span> : null}
        </p>
        {document.summary ? <p className="mt-1.5 line-clamp-2 text-xs font-medium text-slate-500">{document.summary}</p> : null}
      </div>
      <div className="flex items-center justify-end sm:justify-start">
        <DocumentAction document={document} busy={busy} onView={onView} onDownload={onDownload} />
      </div>
    </li>
  );
};

/**
 * The landing screen for a link that exists to deliver one file.
 *
 * It shows only the file the link names: no section list, no other document, no
 * counts. When the download is not permitted through this link the button is
 * replaced by the reason, and the server refuses the request in any case.
 */
const FileLandingPanel = ({
  target, clientName, canDownload, busy, onDownload,
}: {
  target: { title?: string; reference?: string | null; category?: string; version?: string | null } | null;
  clientName: string;
  canDownload: boolean;
  busy: boolean;
  onDownload: () => void | Promise<void>;
}) => (
  <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)] sm:p-9">
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
      <Download className="h-5 w-5" />
    </span>
    <h1 className="mt-5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Your file is ready</h1>
    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
      This temporary link delivers one file from {clientName}, prepared for you by Code Rx Society.
    </p>

    <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-4">
      <p className="text-sm font-bold text-slate-900">{target?.title || 'Client file'}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
        {target?.reference ? <span className="font-mono uppercase tracking-wider">{target.reference}</span> : null}
        {target?.version ? <span>Version {target.version}</span> : null}
        {target?.category ? <span className="uppercase tracking-[0.1em] text-emerald-700">{CATEGORY_LABELS[target.category] || 'Document'}</span> : null}
      </p>
    </div>

    {canDownload ? (
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:opacity-70 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download file
      </button>
    ) : (
      <p className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        This link does not permit downloads. Ask Code Rx Society for a link that does.
      </p>
    )}

    <p className="mt-6 text-xs font-medium leading-5 text-slate-500">
      Only this file is available through this link. Nothing else in the project room can be opened from here.
    </p>
  </div>
);

/**
 * The authenticated Client Project Room.
 *
 * Nothing here decides access: the project id comes from the signed-in session,
 * never from the URL, and every request is re-authorized by the server. A
 * section is only offered when the server reports authorized content in it.
 */
export const ClientProjectRoom = ({
  context, onSignedOut, onSessionEnded, notice, onNotice,
  transport = clientPortal, preview = false, exitLabel = 'Log out',
}: ClientProjectRoomProps) => {
  const [sections, setSections] = useState<RoomSection[]>([]);
  const [recent, setRecent] = useState<RoomDocument[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>(context.project.status || 'active');
  const [projectDates, setProjectDates] = useState<{ createdAt?: string | null; updatedAt?: string | null }>({});
  const [activeSection, setActiveSection] = useState('overview');
  const [documents, setDocuments] = useState<RoomDocument[] | null>(null);
  const [openDocument, setOpenDocument] = useState<any | null>(null);
  const [openDelivery, setOpenDelivery] = useState<RoomDelivery>(() => parseDelivery(null));
  const [copy, setCopy] = useState<{ url: string; filename: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyBusy, setCopyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  /**
   * The sections are behind the hamburger in the header. On a narrow screen
   * they start folded; on a wide one the sidebar is open and the same button
   * folds it away, so the header behaves the same way at every width.
   */
  const [navOpen, setNavOpen] = useState(false);
  const [navFolded, setNavFolded] = useState(false);
  const [wideScreen, setWideScreen] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setWideScreen(query.matches);
    update();
    if (query.addEventListener) query.addEventListener('change', update);
    return () => { if (query.removeEventListener) query.removeEventListener('change', update); };
  }, []);
  const sectionsOpen = wideScreen ? !navFolded : navOpen;
  const toggleSections = () => {
    if (wideScreen) setNavFolded((folded) => !folded);
    else setNavOpen((open) => !open);
  };

  const projectId = context.project.id;
  // Where the link (or key) was allowed to land. Everything below is derived
  // from the server's own scope block, never from the URL.
  const landing: LinkLanding = useMemo(() => landingFor(context.destination), [context.destination]);
  const restricted = context.destination?.restricted === true;

  const handleFailure = useCallback((failure: unknown) => {
    const status = failure instanceof ClientPortalError ? failure.status : -1;
    const code = failure instanceof ClientPortalError ? failure.code : null;
    // A session the server no longer accepts sends the client back to the
    // access screen rather than leaving a half-dead room on screen.
    if (status === 401 || code === 'session_expired') {
      onSessionEnded(messageForFailure(status, 'session_expired'));
      return;
    }
    setError(messageForFailure(status, code));
  }, [onSessionEnded]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await transport.project(projectId);
      const project = response.data.project || {};
      setSections(response.data.sections || []);
      setRecent(response.data.recent || []);
      setProjectStatus(project.status || 'active');
      setProjectDates({ createdAt: project.createdAt, updatedAt: project.updatedAt });
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setLoading(false);
    }
  }, [projectId, handleFailure, transport]);

  useEffect(() => {
    // A file link exists to deliver one file: the room is never fetched, so the
    // session stays the minimum authorization the destination needs.
    if (landing.fileOnly) { setLoading(false); return; }
    void loadProject();
  }, [loadProject, landing.fileOnly]);

  // Land on the destination the link named, once the room's own data has loaded.
  useEffect(() => {
    if (loading || landing.fileOnly) return;
    if (landing.kind === 'section') void openSection(landing.section);
    else if (landing.kind === 'document' && landing.documentId) {
      void openSection(sectionForCategory(context.target?.category));
      void openDocumentById(landing.documentId);
    }
    // Only when the destination itself changes: a client browsing afterwards is
    // never bounced back to the link's landing point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, landing.kind, landing.section, landing.documentId, landing.fileOnly]);

  const openSection = async (section: string) => {
    setActiveSection(section);
    setOpenDocument(null);
    setOpenDelivery(parseDelivery(null));
    setCopy(null);
    setError(null);
    if (section === 'overview') {
      setDocuments(null);
      return;
    }
    setBusy(true);
    setDocuments(null);
    try {
      const response = await transport.section(projectId, section);
      setDocuments(response.data.documents || []);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  };

  /**
   * SIGNING.
   *
   * Every document the client can open can be signed. What the room keeps here
   * is only what the client is doing right now: their name as they type it, the
   * signature the server holds, and the two answers the server sends back when
   * they save or send the document on.
   */
  const [signature, setSignature] = useState<any | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signBusy, setSignBusy] = useState(false);
  const [signNotice, setSignNotice] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  /** The pencil pad's drawing: the canvas PNG plus the normalized strokes. */
  const [inkPng, setInkPng] = useState<string | null>(null);
  const [inkStrokes, setInkStrokes] = useState<Array<{ points: Array<{ x: number; y: number }> }>>([]);
  const [hasInk, setHasInk] = useState(false);

  const loadSignature = async (documentId: string) => {
    setSignature(null);
    setSignNotice(null);
    setSendNotice(null);
    setSignerName('');
    setSignerTitle('');
    setInkPng(null);
    setInkStrokes([]);
    setHasInk(false);
    if (!transport.signature && !transport.sign) return;
    try {
      const response = await transport.signature!(projectId, documentId);
      const data = response?.data || {};
      setSignature(data);
      // The client's own name is the one thing worth pre-filling: they are the
      // person signing, and they can still change it.
      setSignerName(context.client.contactName || '');
    } catch {
      // A document whose signature cannot be read is still readable: the card
      // simply opens empty rather than breaking the page.
      setSignature(null);
    }
  };

  const signDocument = async () => {
    if (!openDocument || !transport.sign) return;
    if (signerName.trim().length < 2) {
      setSignNotice('Type your full name to sign this document.');
      return;
    }
    // The drawn mark is required — a name alone is not a signature.
    if (!hasInk) {
      setSignNotice('Draw your signature on the pad before saving. A name alone cannot sign this document.');
      return;
    }
    setSignBusy(true);
    setSignNotice(null);
    try {
      // The pad's PNG (with its strokes) travels only when something was drawn;
      // the server re-paints the strokes and never echoes ink back to the room.
      const saved = await transport.sign(projectId, String(openDocument.id), {
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim(),
        // `hasInk` is checked above, so the pad's PNG is present here.
        inkPng: inkPng || '',
        strokes: inkStrokes,
      });
      setSignNotice(saved.message || 'Signed. Your signature is saved with this document.');
      const current = saved.data || {};
      setSignature((existing: any) => ({ ...(existing || {}), current: {
        signerName: current.signerName || signerName.trim(),
        signerTitle: current.signerTitle || signerTitle.trim(),
        signedAt: current.signedAt || new Date().toISOString(),
        version: current.version || openDocument.version || '1',
        drawn: Boolean(current.drawn),
      } }));
      setInkPng(null);
      setInkStrokes([]);
      setHasInk(false);
      // The version the client sees is the version they just signed.
      setOpenDocument((document: any) => (document ? { ...document, version: current.version || document.version } : document));
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setSignBusy(false);
    }
  };

  const sendDocumentToPhantom = async () => {
    if (!openDocument || !transport.sendToPhantom) return;
    // Only a drawn-and-saved signature may be sent: the send stays gated on the
    // drawing, exactly like save, and the server enforces the same rule.
    const current = signature?.current || null;
    if (!current || !current.drawn) {
      setSendNotice('Sign this document first — type your name and draw your signature on the pad, then save.');
      return;
    }
    setSendBusy(true);
    setSendNotice(null);
    try {
      const sent = await transport.sendToPhantom(projectId, String(openDocument.id));
      setSendNotice(sent.message || 'Sent to PHANTOM.');
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setSendBusy(false);
    }
  };

  /**
   * TEXT PHANTOM.
   *
   * The button lives in the room's own header, so a client can reach their desk
   * from anywhere in the room. The panel opens with whatever they wrote before,
   * and every message is stored server-side rather than only announced.
   */
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messages, setMessages] = useState<any[] | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageBusy, setMessageBusy] = useState(false);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);
  /** The document a message is about, when the panel was opened on one. */
  const [messageDocument, setMessageDocument] = useState<{ id: string; title: string } | null>(null);

  const openMessages = async (document?: { id: string; title: string } | null) => {
    setMessagesOpen(true);
    setMessageNotice(null);
    setMessageDocument(document || null);
    if (!transport.messages) return;
    try {
      const response = await transport.messages(projectId);
      setMessages(response?.data?.messages || []);
    } catch {
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!transport.sendMessage || !messageText.trim()) return;
    setMessageBusy(true);
    setMessageNotice(null);
    try {
      const sent = await transport.sendMessage(projectId, {
        body: messageText.trim(),
        ...(messageDocument ? { documentId: messageDocument.id } : {}),
      });
      setMessageNotice(sent.message || 'Message sent to PHANTOM.');
      setMessageText('');
      if (transport.messages) {
        const response = await transport.messages(projectId);
        setMessages(response?.data?.messages || []);
      }
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setMessageBusy(false);
    }
  };

  /**
   * The review section. Loaded with the document, because every document sent to
   * a client carries it — not only the ones the client can edit.
   */
  const [review, setReview] = useState<any | null>(null);
  const [reviewChoice, setReviewChoice] = useState<string>('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const loadReview = async (documentId: string) => {
    setReview(null);
    setReviewChoice('');
    setReviewComment('');
    setReviewNotice(null);
    if (!transport.review) return;
    try {
      const response = await transport.review(projectId, documentId);
      if (response?.data) setReview(response.data);
    } catch {
      // A review section that cannot load never blocks the document itself.
      setReview(null);
    }
  };

  const sendReview = async () => {
    if (!openDocument || !review || !reviewChoice) return;
    setReviewBusy(true);
    setReviewNotice(null);
    try {
      const saved = await transport.saveReview!(projectId, String(openDocument.id), reviewChoice, reviewComment);
      setReview((current: any) => ({ ...current, current: saved.data?.current || current.current }));
      setReviewNotice(saved.message || 'Sent to PHANTOM.');
      setReviewChoice('');
      setReviewComment('');
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setReviewBusy(false);
    }
  };

  const openDocumentById = async (documentId: string) => {
    setBusy(true);
    setError(null);
    setCopy(null);
    try {
      const response = await transport.document(projectId, documentId);
      setOpenDocument(response.data.document);
      void loadSignature(documentId);
      void loadReview(documentId);
      const delivery = parseDelivery(response.data.delivery);
      setOpenDelivery(delivery);
      // The stamped copy is fetched eagerly only when the viewer can show it.
      if (!preview && delivery.available && transport.stampedCopy) {
        void loadStampedCopy(documentId);
      }
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Loads the stamped artifact for the viewer. The bytes come from the server
   * under the client session; the portal holds them in an object URL for as long
   * as the document is open, and revokes it when the viewer closes.
   */
  const loadStampedCopy = async (documentId: string, action: 'preview' | 'print' = 'preview') => {
    if (!transport.stampedCopy) return null;
    try {
      return await transport.stampedCopy(projectId, documentId, action);
    } catch (failure) {
      handleFailure(failure);
      return null;
    }
  };

  const openStampedCopy = async () => {
    if (!openDocument) return;
    setCopyBusy(true);
    setError(null);
    try {
      const loaded = await loadStampedCopy(String(openDocument.id), 'preview');
      if (loaded) setCopy(loaded);
    } finally {
      setCopyBusy(false);
    }
  };

  /**
   * Printing goes through the same artifact. A blank window is opened first so
   * the browser's user gesture is preserved, then pointed at the stamped file —
   * what the client prints is the watermarked document, not the page's markup.
   */
  const printStampedCopy = async () => {
    if (!openDocument) return;
    setError(null);
    const opened = !preview ? window.open('', '_blank', 'noopener') : null;
    setCopyBusy(true);
    try {
      const loaded = await loadStampedCopy(String(openDocument.id), 'print');
      if (!loaded) {
        if (opened) opened.close();
        return;
      }
      if (opened) opened.location.href = loaded.url;
      else if (!preview) window.open(loaded.url, '_blank', 'noopener');
    } finally {
      setCopyBusy(false);
    }
  };

  const download = async (document: RoomDocument) => {
    setError(null);
    // Preview never serves a document: it shows the client's own experience,
    // including the permission the client has, without handing a file to the
    // operator's browser.
    if (preview || !transport.download) {
      onNotice('In preview, downloads are shown but not served. The client downloads this from their own session.');
      return;
    }
    setBusy(true);
    try {
      await transport.download(projectId, document.id, downloadFileName(document));
    } catch {
      // Downloads exist only once a stamped client copy has been produced, so a
      // refusal is explained rather than shown as a failure code.
      onNotice('This document is not available to download yet. Please contact Code Rx Society.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => {
    // Object URLs hold the stamped bytes in memory; release them when the room
    // goes away so a closed session leaves nothing behind in the browser.
    setCopy((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await clientPortal.logout();
    } catch {
      /* the local session is cleared either way */
    } finally {
      setSigningOut(false);
      onSignedOut();
    }
  };

  // Only sections holding authorized content are offered, plus the overview.
  const shownSections = useMemo(() => visibleSections(sections, recent.length), [sections, recent.length]);
  const publishedCount = useMemo(
    () => (sections || []).reduce((total, section) => (section.id === 'overview' ? total : total + Number(section.count || 0)), 0),
    [sections],
  );
  const facts = useMemo(
    () => overviewFacts({ reference: context.project.reference, status: projectStatus, ...projectDates, publishedCount }),
    [context.project.reference, projectStatus, projectDates, publishedCount],
  );

  const list = documents ?? recent;
  const anythingPublished = hasAnyPublishedContent(sections) || recent.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* The header is pinned: the sign, the project title and the menu stay in
          front of the client while the room scrolls underneath them. */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            {/* The menu belongs to the small screens; from lg up the sections are
                always beside the room. */}
            <button
              type="button"
              onClick={toggleSections}
              aria-expanded={sectionsOpen}
              aria-controls="room-sections"
              aria-label={sectionsOpen ? 'Hide project sections' : 'Show project sections'}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {sectionsOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <ClientSiteSign subtitle="Client Project Room" />
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openMessages(null)}
                aria-label="Text PHANTOM"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 sm:px-4"
              >
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Text PHANTOM</span>
                <span className="sm:hidden">Text</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 sm:px-3.5"
              >
                {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                <span className="hidden sm:inline">{exitLabel}</span>
              </button>
            </div>
          </div>

          {!landing.fileOnly ? (
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  <span>{context.client.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500">{context.project.reference}</span>
                </p>
                <h1 className="mt-1 truncate text-base font-black tracking-tight text-slate-900 sm:text-xl">
                  {openDocument ? openDocument.title : context.project.name}
                </h1>
              </div>
              {/* PHANTOM is the desk that handles this project; a client should
                  see who they are dealing with without having to ask. */}
              <span
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800"
                title="PHANTOM is the Code Rx desk that handles this project"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                PHANTOM
                <span className="font-bold normal-case tracking-normal text-emerald-700">your Code Rx desk</span>
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        {preview ? (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Preview only — this is exactly what {context.client.name} sees. No client session was created,
              no document is downloaded, and nothing on screen can change their access.
            </span>
          </div>
        ) : null}
        {restricted && !landing.fileOnly ? (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <span>
              You opened this room with a temporary link for <strong>{linkDestinationLabel(context.destination?.destination)}</strong>.
              Anything outside that destination stays closed; your access key opens the whole room.
            </span>
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</span>
            <button
              type="button"
              aria-label="Dismiss this message"
              onClick={() => onNotice(null)}
              className="shrink-0 rounded text-xs font-black uppercase tracking-wider text-amber-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {landing.fileOnly ? (
          <FileLandingPanel
            target={context.target || null}
            clientName={context.client.name}
            canDownload={context.permissions.download === true}
            busy={busy}
            onDownload={async () => {
              if (!landing.documentId) return;
              setBusy(true);
              setError(null);
              try {
                if (!transport.download) {
                  onNotice('In preview, downloads are shown but not served.');
                  return;
                }
                await transport.download(projectId, landing.documentId, `${(context.target?.reference || 'code-rx-file')}.pdf`);
              } catch {
                onNotice('This file is not available to download yet. Please contact Code Rx Society.');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
        <div className="grid gap-6 lg:grid-cols-[230px_1fr] lg:gap-8">
          {/* Sections: a horizontal strip on small screens, a sidebar from lg up. */}
          <nav
            id="room-sections"
            aria-label="Project sections"
            className={`${navOpen ? 'block' : 'hidden'} ${navFolded ? 'lg:hidden' : 'lg:block'} lg:sticky lg:top-[124px] lg:self-start`}
          >
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {shownSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => { setNavOpen(false); void openSection(section.id); }}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-bold transition lg:w-full ${
                    activeSection === section.id
                      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900 lg:bg-transparent lg:ring-0 lg:hover:bg-white'
                  }`}
                >
                  <span className="whitespace-nowrap">{section.label}</span>
                  {section.id === 'overview' ? null : (
                    <span className={`text-[11px] font-black ${activeSection === section.id ? 'text-emerald-700' : 'text-slate-500'}`}>{section.count}</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <section className="min-w-0">
            {error ? (
              <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            ) : null}

            {openDocument ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)] sm:p-8">
                <button
                  type="button"
                  onClick={() => setOpenDocument(null)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to {sectionLabel(activeSection)}
                </button>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">
                    {CATEGORY_LABELS[openDocument.category] || 'Document'}
                  </p>
                  {freshnessBadge(openDocument as RoomDocument) ? (
                    <span
                      title={freshnessBadge(openDocument as RoomDocument)?.title}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                        freshnessBadge(openDocument as RoomDocument)?.label === 'NEW'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          : 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
                      }`}
                    >
                      {freshnessBadge(openDocument as RoomDocument)?.label}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-3xl">{openDocument.title}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
                  {openDocument.reference ? <span className="font-mono uppercase tracking-wider">{openDocument.reference}</span> : null}
                  {openDocument.version ? <span>Version {openDocument.version}</span> : null}
                  {openDocument.signature ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Signed
                    </span>
                  ) : null}
                  <span>{publicationInfo(openDocument as RoomDocument).primary}</span>
                  {publicationInfo(openDocument as RoomDocument).secondary ? <span>{publicationInfo(openDocument as RoomDocument).secondary}</span> : null}
                </div>
                {openDocument.summary ? (
                  <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">{openDocument.summary}</p>
                ) : null}

                {/* The two things a client does with something Code Rx sends
                    them, in reach before they start reading. */}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => document.getElementById('sign-this-document')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-800 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                  >
                    <PenLine className="h-3.5 w-3.5" aria-hidden="true" /> Sign this document
                  </button>
                  <button
                    type="button"
                    onClick={() => void openMessages({ id: String(openDocument.id), title: String(openDocument.title || '') })}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> Text PHANTOM about this
                  </button>
                </div>
                <StampedCopyPanel
                  delivery={openDelivery}
                  copy={copy}
                  busy={copyBusy}
                  preview={!!preview}
                  printable={canPrint(openDocument as RoomDocument, openDelivery)}
                  onLoadCopy={() => void openStampedCopy()}
                  onPrint={() => void printStampedCopy()}
                />

                <SignaturePanel
                  documentTitle={String(openDocument.title || '')}
                  signature={signature}
                  name={signerName}
                  title={signerTitle}
                  busy={signBusy}
                  notice={signNotice}
                  sendBusy={sendBusy}
                  sendNotice={sendNotice}
                  preview={preview}
                  onNameChange={setSignerName}
                  onTitleChange={setSignerTitle}
                  onSign={() => void signDocument()}
                  onSend={() => void sendDocumentToPhantom()}
                  onTextPhantom={() => void openMessages({ id: String(openDocument.id), title: String(openDocument.title || '') })}
                  hasInk={hasInk}
                  onInkPngChange={setInkPng}
                  onStrokesChange={setInkStrokes}
                  onHasInkChange={setHasInk}
                />

                {review ? (
                  <ClientReviewSection
                    review={review}
                    choice={reviewChoice}
                    comment={reviewComment}
                    busy={reviewBusy}
                    notice={reviewNotice}
                    onChoose={setReviewChoice}
                    onComment={setReviewComment}
                    onSend={() => void sendReview()}
                    onClear={() => { setReviewChoice(''); setReviewComment(''); }}
                  />
                ) : null}
                {canDownload(openDocument as RoomDocument) ? (
                  <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void download(openDocument as RoomDocument)}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-700 disabled:opacity-70"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download copy
                    </button>
                    <p className="text-xs font-medium text-slate-500">
                      Your download is the stamped Code Rx copy of this document — watermarked and print-safe.
                    </p>
                  </div>
                ) : (
                  <p className="mt-8 flex items-center gap-2 border-t border-slate-100 pt-6 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <LockKeyhole className="h-3.5 w-3.5" /> View only — this document cannot be downloaded.
                  </p>
                )}
              </article>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-3xl">{context.project.name}</h1>
                      <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{context.project.reference}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                      <ShieldCheck className="h-3.5 w-3.5" /> {facts[0].value}
                    </span>
                  </div>
                  {context.project.description ? (
                    <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">{context.project.description}</p>
                  ) : null}

                  {/* Project information. Only the client's own project facts. */}
                  <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
                    {facts.map((fact) => (
                      <div key={fact.label} className="min-w-0">
                        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{fact.label}</dt>
                        <dd className="mt-1 truncate text-sm font-bold text-slate-800" title={fact.value}>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-700">
                    {activeSection === 'overview' ? 'Recently published' : sectionLabel(activeSection)}
                  </h2>
                  <div className="flex items-center gap-3">
                    {list.some((document) => freshnessBadge(document)) ? (
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        <span className="text-emerald-700">NEW</span> recently published · <span className="text-amber-700">UPDATED</span> changed since
                      </p>
                    ) : null}
                    {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden="true" /> : null}
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-live="polite" aria-busy={loading}>
                  {loading || (busy && documents === null && activeSection !== 'overview') ? (
                    <div role="status" className="flex items-center gap-2 px-5 py-10 text-sm font-semibold text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your project…
                    </div>
                  ) : list.length ? (
                    <ul className="divide-y divide-slate-100">
                      {list.map((document) => (
                        <DocumentRow
                          key={document.id}
                          document={document}
                          busy={busy}
                          onView={() => void openDocumentById(document.id)}
                          onDownload={() => void download(document)}
                        />
                      ))}
                    </ul>
                  ) : activeSection === 'overview' && !anythingPublished && landing.fileOnly ? (
                    <div className="px-5 py-10 text-center">
                      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </span>
                      <p className="mt-4 text-sm font-bold text-slate-700">Preparing your file…</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        This link delivers a single file. Your download starts automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="px-5 py-12 text-center">
                      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <FileText className="h-5 w-5" />
                      </span>
                      <p className="mt-4 text-sm font-bold text-slate-700">
                        {activeSection === 'overview' && !anythingPublished
                          ? 'No documents available yet.'
                          : emptyMessageFor(activeSection)}
                      </p>
                      <p className="mx-auto mt-2 max-w-sm text-xs font-medium text-slate-500">
                        {activeSection === 'overview' && !anythingPublished
                          ? 'When Code Rx Society publishes something for this project, it appears here.'
                          : 'Everything published to this section will appear here.'}
                      </p>
                    </div>
                  )}
                </div>

                {activeSection === 'overview' && list.length && publishedCount > list.length ? (
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Showing the {list.length} most recent of {publishedCount} published documents. Choose a section above to see the rest.
                  </p>
                ) : null}
              </>
            )}

            <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-500">
              <LockKeyhole className="h-3.5 w-3.5" /> This room only shows documents published to {context.client.name}.
            </p>
          </section>
        </div>
        )}
      </main>

      {/* Reachable from the header on every screen, and from an open document
          when the message is about that document. */}
      <TextPhantomPanel
        open={messagesOpen}
        projectName={context.project.name}
        documentTitle={messageDocument?.title || null}
        text={messageText}
        busy={messageBusy}
        notice={messageNotice}
        messages={messages}
        preview={preview || !transport.sendMessage}
        onTextChange={setMessageText}
        onSend={() => void sendMessage()}
        onClose={() => { setMessagesOpen(false); setMessageNotice(null); }}
      />
    </div>
  );
};
