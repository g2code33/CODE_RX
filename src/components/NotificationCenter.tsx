import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, LoaderCircle, Send, Users, X } from 'lucide-react';
import { db } from '../lib/cloudflare';

const when = (value?: string) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

type Audience = 'all' | 'selected' | 'role';

export const NotificationCenter = () => {
  const [open, setOpen] = useState(false);
  const [compose, setCompose] = useState(false);
  const [inbox, setInbox] = useState<any>({ items: [], unreadCount: 0, canSend: false });
  const [audienceData, setAudienceData] = useState<any>({ members: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [selected, setSelected] = useState<number[]>([]);
  const [roleCode, setRoleCode] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setInbox(await db.notifications.inbox()); }
    finally { if (!quiet) setLoading(false); }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const openComposer = async () => {
    setCompose(true);
    setSendMessage('');
    if (!audienceData.members.length) {
      try { setAudienceData(await db.notifications.audience()); }
      catch (error: any) { setSendMessage(error?.message || 'Could not load notification audiences.'); }
    }
  };

  const markRead = async (item: any) => {
    if (item.status === 'read') return;
    try {
      await db.notifications.markRead(item.id);
      setInbox((current: any) => ({
        ...current,
        unreadCount: Math.max(0, Number(current.unreadCount || 0) - 1),
        items: current.items.map((entry: any) => entry.id === item.id ? { ...entry, status: 'read', read_at: new Date().toISOString() } : entry),
      }));
    } catch { /* The item remains visible and can be retried. */ }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setSendMessage('');
    if (!title.trim() || !message.trim()) { setSendMessage('Add a title and message before sending.'); return; }
    if (audience === 'selected' && !selected.length) { setSendMessage('Choose at least one active member.'); return; }
    if (audience === 'role' && !roleCode) { setSendMessage('Choose a responsibility profile.'); return; }
    setLoading(true);
    try {
      const result = await db.notifications.send({ title, message, audience, memberProfileIds: selected, roleCode });
      setSendMessage(result.message || 'Notification broadcast successfully.');
      setTitle(''); setMessage(''); setSelected([]); setRoleCode('');
      await load(true);
    } catch (error: any) {
      setSendMessage(error?.message || 'Could not send this notification.');
    } finally { setLoading(false); }
  };

  const selectedLabel = useMemo(() => `${selected.length} selected`, [selected.length]);

  return <div className="relative">
    <button onClick={() => { setOpen((value) => !value); setCompose(false); }} className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700" aria-label="Open notifications">
      <Bell className="h-4 w-4" />
      {Number(inbox.unreadCount || 0) > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 py-0.5 text-center text-[9px] font-black text-white">{Number(inbox.unreadCount) > 99 ? '99+' : inbox.unreadCount}</span>}
    </button>
    {open && <div className="absolute right-0 top-12 z-[160] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-sm font-black text-slate-900">Notifications</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{inbox.unreadCount || 0} unread</p></div><div className="flex items-center gap-2">{inbox.canSend && <button onClick={() => void openComposer()} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700"><Send className="mr-1 inline h-3.5 w-3.5" />Send</button>}<button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div></div>
      {compose ? <form onSubmit={send} className="max-h-[70vh] overflow-y-auto p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-black text-slate-900">Broadcast update</p><p className="mt-1 text-xs text-slate-500">Your PHANTOM-approved sender access is active.</p></div><button type="button" onClick={() => setCompose(false)} className="text-xs font-black text-emerald-700">Inbox</button></div><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Notification title" className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" /><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} placeholder="Write a clear update for recipients…" className="mt-3 min-h-28 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-emerald-400" /><label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">Audience<select value={audience} onChange={(event) => setAudience(event.target.value as Audience)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800"><option value="all">All active members</option><option value="selected">Selected members</option><option value="role">Responsibility profile</option></select></label>{audience === 'role' && <select value={roleCode} onChange={(event) => setRoleCode(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Choose responsibility profile</option>{(audienceData.roles || []).map((role: any) => <option key={role.code} value={role.code}>{role.name}</option>)}</select>}{audience === 'selected' && <div className="mt-3 rounded-xl border border-slate-200"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2"><span className="text-xs font-black text-slate-700">{selectedLabel}</span><Users className="h-4 w-4 text-slate-400" /></div><div className="max-h-40 overflow-y-auto p-2">{(audienceData.members || []).map((member: any) => <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-emerald-50"><input type="checkbox" checked={selected.includes(member.id)} onChange={() => setSelected((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><span className="min-w-0"><strong className="block truncate text-slate-800">{member.name}</strong><small className="text-slate-500">{member.member_code} · {member.role_name || member.role_code}</small></span></label>)}</div></div>}{sendMessage && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${sendMessage.includes('success') || sendMessage.includes('broadcast') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{sendMessage}</p>}<button disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send notification</button></form> : <div className="max-h-[65vh] overflow-y-auto p-2">{loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-600" /></div> : inbox.items?.length ? inbox.items.map((item: any) => <button key={item.id} onClick={() => void markRead(item)} className={`w-full rounded-xl p-3 text-left transition hover:bg-emerald-50 ${item.status === 'unread' ? 'bg-emerald-50/60' : ''}`}><div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-900">{item.title}</strong>{item.status === 'unread' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}</div><p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.sender_name || 'Code Rx Society'} · {when(item.delivered_at)}</p></button>) : <div className="grid min-h-40 place-items-center text-center"><div><Check className="mx-auto h-6 w-6 text-emerald-600" /><p className="mt-2 text-sm font-bold text-slate-700">You are up to date</p><p className="mt-1 text-xs text-slate-500">New broadcasts will appear here.</p></div></div>}</div>}
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">Inbox refreshes automatically while this portal is open.</div>
    </div>}
  </div>;
};
