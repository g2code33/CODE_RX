import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, LockKeyhole, Menu, MessageCircle, Plus, Send, X } from 'lucide-react';
import { db, type AuthUser } from '../lib/cloudflare';

type PublicGuest = { token: string; handle: string; expiresAt: string };
type PublicView = 'threads' | 'chat';
type PrivateView = 'chat' | 'groups' | 'members';

const GUEST_STORAGE = 'codeRx_communityGuest';
const time = (value?: string) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const loadGuest = (): PublicGuest | null => {
  try { const parsed = JSON.parse(localStorage.getItem(GUEST_STORAGE) || 'null'); return parsed?.token && parsed?.handle ? parsed : null; } catch { return null; }
};

export const CommunityHub = ({ user, onLogin }: { user: AuthUser | null; onLogin: () => void }) => {
  const [area, setArea] = useState<'public' | 'private'>('public');
  const [publicView, setPublicView] = useState<PublicView>('threads');
  const [guest, setGuest] = useState<PublicGuest | null>(() => loadGuest());
  const [email, setEmail] = useState('');
  const [publicThreads, setPublicThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [publicChat, setPublicChat] = useState<any[]>([]);
  const [publicMessage, setPublicMessage] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [publicSearch, setPublicSearch] = useState('');
  const [privateView, setPrivateView] = useState<PrivateView>('chat');
  const [conversations, setConversations] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selfProfileId, setSelfProfileId] = useState<number | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<any>({ connected: false });
  const [activeConversation, setActiveConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [mediaPolicy, setMediaPolicy] = useState<any[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState({ title: '', description: '', joinMode: 'invite' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const publicToken = guest?.token || '';

  const loadPublic = async () => {
    try {
      const [threads, chat] = await Promise.all([db.community.publicThreads(publicSearch), db.community.publicChat()]);
      setPublicThreads(threads); setPublicChat(chat);
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not load the public community.' }); }
  };

  const loadPrivate = async () => {
    if (!user) return;
    try {
      const [inbox, groupRows, memberRows, telegram, profile] = await Promise.all([db.community.conversations(), db.community.groups(), db.community.members(memberSearch), db.community.telegramStatus(), db.member.me()]);
      setConversations(inbox); setGroups(groupRows); setMembers(memberRows); setTelegramStatus(telegram); setSelfProfileId(Number(profile.memberProfileId || profile.profileId || 0) || null);
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not load the private Code Rx Community.' }); }
  };

  useEffect(() => { void loadPublic(); const interval = window.setInterval(() => { void loadPublic(); }, 20_000); return () => window.clearInterval(interval); }, [publicSearch]);
  useEffect(() => { if (area === 'private') void loadPrivate(); }, [area, user, memberSearch]);
  useEffect(() => {
    if (!activeConversation || !user) return;
    const loadMessages = async () => {
      try {
        const [data, policy] = await Promise.all([db.community.messages(activeConversation.id), db.community.mediaPolicy(activeConversation.id)]);
        setMessages(data.messages || []);
        setMediaPolicy(policy);
        const latest = data.messages?.[data.messages.length - 1];
        if (latest) void db.community.markRead(activeConversation.id, latest.id);
      } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not load this conversation.' }); }
    };
    void loadMessages();
    const interval = window.setInterval(() => { void loadMessages(); }, 12_000);
    return () => window.clearInterval(interval);
  }, [activeConversation?.id, user]);

  const enterPublic = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setMessage(null);
    try {
      const result = await db.community.enterPublic(email);
      const next = { token: result.data.token, handle: result.data.handle, expiresAt: result.data.expiresAt };
      localStorage.setItem(GUEST_STORAGE, JSON.stringify(next));
      setGuest(next); setEmail(''); setMessage({ type: 'success', text: `Welcome, ${next.handle}. Your email remains private.` });
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not enter the public community.' }); }
    finally { setLoading(false); }
  };

  const createThread = async (event: React.FormEvent) => {
    event.preventDefault(); if (!publicToken) return; setLoading(true); setMessage(null);
    try {
      await db.community.createPublicThread(publicToken, { title: threadTitle, body: threadBody });
      setThreadTitle(''); setThreadBody(''); setMessage({ type: 'success', text: 'Discussion created.' }); await loadPublic();
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not create this discussion.' }); }
    finally { setLoading(false); }
  };

  const openThread = async (thread: any) => {
    try { setSelectedThread(await db.community.publicThread(thread.id)); setPublicView('threads'); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not open this discussion.' }); }
  };

  const replyThread = async (event: React.FormEvent) => {
    event.preventDefault(); if (!publicToken || !selectedThread) return; setLoading(true);
    try { await db.community.replyPublicThread(publicToken, selectedThread.thread.id, { body: replyBody }); setReplyBody(''); setSelectedThread(await db.community.publicThread(selectedThread.thread.id)); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not post this reply.' }); }
    finally { setLoading(false); }
  };

  const editPublicPost = async (post: any) => {
    if (!publicToken || !selectedThread) return;
    const next = window.prompt('Edit public post', post.body || '');
    if (next === null || !next.trim()) return;
    try { await db.community.editPublicPost(publicToken, post.id, next); setSelectedThread(await db.community.publicThread(selectedThread.thread.id)); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not edit this public post.' }); }
  };
  const deletePublicPost = async (post: any) => {
    if (!publicToken || !selectedThread || !window.confirm('Delete this public post?')) return;
    try { await db.community.deletePublicPost(publicToken, post.id); setSelectedThread(await db.community.publicThread(selectedThread.thread.id)); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not delete this public post.' }); }
  };
  const reportPublicPost = async (post: any) => {
    if (!publicToken) return;
    const reason = window.prompt('Why should PHANTOM review this post?');
    if (!reason?.trim()) return;
    try { await db.community.reportPublic(publicToken, { postId: post.id, reason }); setMessage({ type: 'success', text: 'Report sent for PHANTOM review.' }); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not report this post.' }); }
  };

  const sendPublicMessage = async (event: React.FormEvent) => {
    event.preventDefault(); if (!publicToken || !publicMessage.trim()) return; setLoading(true);
    try { await db.community.sendPublicChat(publicToken, publicMessage); setPublicMessage(''); await loadPublic(); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not send this public message.' }); }
    finally { setLoading(false); }
  };

  const openDm = async (profileId: number) => {
    try {
      const conversation = await db.community.openDm(profileId);
      setActiveConversation(conversation); setPrivateView('chat'); await loadPrivate();
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not open this direct message.' }); }
  };

  const sendPrivateMessage = async (event: React.FormEvent) => {
    event.preventDefault(); if (!activeConversation || !messageBody.trim()) return; setLoading(true);
    try {
      await db.community.sendMessage(activeConversation.id, { body: messageBody, replyToMessageId: replyTo?.id });
      setMessageBody(''); setReplyTo(null);
      const data = await db.community.messages(activeConversation.id); setMessages(data.messages || []); await loadPrivate();
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not send this message.' }); }
    finally { setLoading(false); }
  };

  const uploadAttachment = async () => {
    if (!activeConversation || !attachmentFile) return;
    setLoading(true);
    try {
      await db.community.uploadAttachment(activeConversation.id, attachmentFile, messageBody);
      setAttachmentFile(null); setMessageBody('');
      const data = await db.community.messages(activeConversation.id); setMessages(data.messages || []); await loadPrivate();
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not upload this attachment.' }); }
    finally { setLoading(false); }
  };

  const editPrivateMessage = async (chat: any) => {
    const next = window.prompt('Edit message', chat.body || '');
    if (next === null || !next.trim()) return;
    try { await db.community.editMessage(chat.id, next); if (activeConversation) { const data = await db.community.messages(activeConversation.id); setMessages(data.messages || []); } }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not edit this message.' }); }
  };

  const deletePrivateMessage = async (chat: any) => {
    if (!window.confirm('Delete this message?')) return;
    try { await db.community.deleteMessage(chat.id); if (activeConversation) { const data = await db.community.messages(activeConversation.id); setMessages(data.messages || []); } }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not delete this message.' }); }
  };

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true);
    try {
      const group = await db.community.createGroup(groupForm);
      setGroupForm({ title: '', description: '', joinMode: 'invite' }); setShowGroupForm(false); setActiveConversation(group); setPrivateView('chat'); await loadPrivate();
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not create this group.' }); }
    finally { setLoading(false); }
  };

  const joinGroup = async (group: any) => {
    try { const result = await db.community.joinGroup(group.id); setMessage({ type: 'success', text: result.message || 'Group request updated.' }); await loadPrivate(); }
    catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Could not join this group.' }); }
  };

  const allowedAttachment = mediaPolicy.some((policy) => policy.enabled);
  const connectTelegram = async () => {
    try {
      const result = await db.community.telegramLink();
      window.open(result.deepLink, '_blank', 'noopener,noreferrer');
      setMessage({ type: 'success', text: 'Open Telegram, press Start, then return here. The secure link expires in 10 minutes.' });
    } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Telegram linking is not available yet.' }); }
  };

  const publicControls = <div className="flex flex-wrap gap-2"><button onClick={() => { setPublicView('threads'); setSelectedThread(null); }} className={`community-tab ${publicView === 'threads' ? 'is-active' : ''}`}>Discussions</button><button onClick={() => setPublicView('chat')} className={`community-tab ${publicView === 'chat' ? 'is-active' : ''}`}>Public Chat</button></div>;
  const privateControls = <div className="flex flex-wrap gap-2"><button onClick={() => setPrivateView('chat')} className={`community-tab ${privateView === 'chat' ? 'is-active' : ''}`}>Chat</button><button onClick={() => setPrivateView('groups')} className={`community-tab ${privateView === 'groups' ? 'is-active' : ''}`}>Groups</button><button onClick={() => setPrivateView('members')} className={`community-tab ${privateView === 'members' ? 'is-active' : ''}`}>Members</button></div>;

  return <main className="min-h-screen bg-[#f7faf8] pt-[4.5rem] text-slate-900"><header className="sticky top-[4.5rem] z-40 border-b border-emerald-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-7"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3"><div className="flex items-center gap-3"><img src="/logo.png" alt="Code Rx Society" className="h-10 w-10 object-contain" /><div><p className="text-sm font-black tracking-wide">CODE <span className="text-emerald-600">Rx</span> COMMUNITY</p><p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">Public forum + private society messaging</p></div></div><button onClick={() => setMenuOpen((current) => !current)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800"><Menu className="h-5 w-5" /></button></div>{menuOpen && <div className="mx-auto mt-3 flex max-w-[1600px] flex-wrap gap-2"><button onClick={() => { setArea('public'); setMenuOpen(false); }} className="community-tab is-active">General Community</button><button onClick={() => { setArea('private'); setMenuOpen(false); }} className="community-tab">Code Rx Community</button></div>}</header><section className="mx-auto max-w-[1600px] px-4 py-8 sm:px-7 lg:px-10"><div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-[#fbfffc] via-[#effaf3] to-[#e1f5e9] p-6 shadow-xl shadow-emerald-950/5 sm:p-10"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Community hub</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Connect. Build. Belong.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">Use the General Community for public discussion, or enter the private Code Rx Community for secure conversations, DMs, groups, and the member directory.</p></div><div className="rounded-2xl border border-emerald-200 bg-white p-2 shadow-sm"><button onClick={() => setArea('public')} className={`rounded-xl px-4 py-2 text-xs font-black ${area === 'public' ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}>🌍 General</button><button onClick={() => setArea('private')} className={`rounded-xl px-4 py-2 text-xs font-black ${area === 'private' ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}>🔐 Code Rx</button></div></div></div>{message && <p role="status" className={`mt-5 rounded-xl px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{message.text}</p>}

    {area === 'public' ? <section className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">General Community</p><h2 className="mt-2 text-xl font-black">Welcome to everyone</h2>{guest ? <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">Public identity</p><p className="mt-1 text-lg font-black text-slate-900">{guest.handle}</p><p className="mt-2 text-xs leading-5 text-slate-600">Your email is private and is never displayed in discussions or chat.</p></div> : <form onSubmit={enterPublic} className="mt-5"><label className="text-xs font-black text-slate-700">Email address</label><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /><button disabled={loading} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">Enter Community</button></form>}<div className="mt-6">{publicControls}</div></aside><div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">{publicView === 'threads' ? selectedThread ? <div><button onClick={() => setSelectedThread(null)} className="inline-flex items-center gap-2 text-xs font-black text-emerald-700"><ChevronLeft className="h-4 w-4" />All discussions</button><h2 className="mt-5 text-3xl font-black">{selectedThread.thread.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{selectedThread.thread.body}</p><p className="mt-3 text-xs font-bold text-slate-400">{selectedThread.thread.author_handle} · {time(selectedThread.thread.created_at)}</p><div className="mt-8 space-y-3 border-t border-slate-100 pt-6">{(selectedThread.posts || []).map((post: any) => <article key={post.id} className="rounded-xl bg-slate-50 p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{post.body}</p><p className="mt-2 text-xs font-black text-slate-400">{post.author_handle} · {time(post.created_at)}</p><div className="mt-3 flex gap-2">{['👍','❤️','🔥','✅'].map((emoji) => <button key={emoji} disabled={!publicToken} onClick={() => void db.community.reactPublicPost(publicToken, post.id, emoji).then(() => openThread(selectedThread.thread))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">{emoji} {(post.reactions || []).find((reaction: any) => reaction.emoji === emoji)?.count || ''}</button>)}<button disabled={!publicToken} onClick={() => void reportPublicPost(post)} className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white">Report</button>{guest?.handle === post.author_handle && <><button onClick={() => void editPublicPost(post)} className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white">Edit</button><button onClick={() => void deletePublicPost(post)} className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50">Delete</button></>}</div></article>)}</div>{guest && <form onSubmit={replyThread} className="mt-6"><textarea required value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Reply to this discussion…" className="min-h-24 w-full rounded-xl border border-emerald-200 p-3 text-sm" /><button disabled={loading} className="mt-3 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white">Post reply</button></form>}</div> : <div><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-black">Public discussions</h2><p className="mt-1 text-sm text-slate-500">Ask, learn, and discuss without exposing personal contact details.</p></div><input value={publicSearch} onChange={(event) => setPublicSearch(event.target.value)} placeholder="Search discussions" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>{guest && <form onSubmit={createThread} className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><input required value={threadTitle} onChange={(event) => setThreadTitle(event.target.value)} placeholder="Discussion title" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm" /><textarea required value={threadBody} onChange={(event) => setThreadBody(event.target.value)} placeholder="Start a respectful discussion…" className="mt-3 min-h-24 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm" /><button disabled={loading} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white"><Plus className="h-4 w-4" />New discussion</button></form>}<div className="mt-6 space-y-3">{publicThreads.map((thread) => <button key={thread.id} onClick={() => void openThread(thread)} className="block w-full rounded-2xl border border-slate-100 p-5 text-left transition hover:border-emerald-200 hover:bg-emerald-50"><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-black text-slate-900">{thread.title}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{thread.body}</p><p className="mt-3 text-xs font-bold text-slate-400">{thread.author_handle} · {thread.reply_count} replies · {time(thread.updated_at)}</p></div>{thread.is_pinned && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">Pinned</span>}</div></button>)}{!publicThreads.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No public discussions yet.</p>}</div></div> : <div><h2 className="text-2xl font-black">Public general chat</h2><p className="mt-1 text-sm text-slate-500">Public visitors use a safe guest identity. Member emails and private details never appear here.</p><div className="mt-6 max-h-[32rem] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4">{publicChat.map((chat) => <article key={chat.id} className="rounded-xl bg-white p-3 shadow-sm"><p className="text-sm text-slate-700">{chat.body}</p><p className="mt-2 text-[10px] font-black text-emerald-700">{chat.author_handle}{chat.is_member ? ' · Code Rx Member' : ''} · {time(chat.created_at)}</p></article>)}{!publicChat.length && <p className="p-6 text-center text-sm text-slate-500">No public messages yet.</p>}</div>{guest && <form onSubmit={sendPublicMessage} className="mt-4 flex gap-2"><input value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} placeholder="Write a public message" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm" /><button disabled={loading} className="rounded-xl bg-emerald-600 px-4 text-white"><Send className="h-4 w-4" /></button></form>}</div>}</div></section> : !user ? <section className="mt-7 grid min-h-96 place-items-center rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-sm"><div><LockKeyhole className="mx-auto h-10 w-10 text-emerald-600" /><p className="mt-4 text-[10px] font-black uppercase tracking-widest text-emerald-600">Code Rx Community</p><h2 className="mt-2 text-3xl font-black">Login required</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Private DMs, groups, member directory, messages, and Code Names are available only to authenticated Code Rx members.</p><button onClick={onLogin} className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white">Login required</button></div></section> : <section className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Code Rx Community</p><h2 className="mt-2 text-xl font-black">{user.codename || user.memberCode || 'Member'}</h2><div className="mt-5">{privateControls}</div><button onClick={() => void connectTelegram()} className={`mt-5 w-full rounded-xl border px-3 py-2 text-xs font-black ${telegramStatus.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>{telegramStatus.connected ? 'Telegram connected' : 'Connect Telegram'}</button>{privateView === 'chat' && <div className="mt-6 space-y-2">{conversations.map((conversation) => <button key={conversation.id} onClick={() => setActiveConversation(conversation)} className={`w-full rounded-xl border p-3 text-left ${activeConversation?.id === conversation.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><p className="font-black text-slate-800">{conversation.title || 'Conversation'}</p>{Number(conversation.unread_count || 0) > 0 && <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">{conversation.unread_count}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{conversation.latest_body || 'No messages yet'}</p></button>)}{!conversations.length && <p className="text-sm text-slate-500">Open a DM or join a group to begin.</p>}</div>}</aside><div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">{privateView === 'members' ? <div><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black">Members</h2><p className="mt-1 text-sm text-slate-500">Code Names are the primary identity. Private contact details stay hidden.</p></div><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search Code Name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{members.map((member) => <article key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-4"><div><p className="font-black text-slate-800">{member.codename}</p><p className="mt-1 text-xs text-slate-500">Code Rx member</p></div>{!member.isSelf && <button onClick={() => void openDm(member.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Message</button>}</article>)}</div></div> : privateView === 'groups' ? <div><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black">Code Rx Groups</h2><p className="mt-1 text-sm text-slate-500">Discover groups you are allowed to see and join.</p></div>{user.isPhantom && <button onClick={() => setShowGroupForm((current) => !current)} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white"><Plus className="mr-1 inline h-4 w-4" />Create group</button>}</div>{showGroupForm && <form onSubmit={createGroup} className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><input required value={groupForm.title} onChange={(event) => setGroupForm({ ...groupForm, title: event.target.value })} placeholder="Group name" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm" /><textarea value={groupForm.description} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Group description" className="mt-3 min-h-20 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm" /><select value={groupForm.joinMode} onChange={(event) => setGroupForm({ ...groupForm, joinMode: event.target.value })} className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"><option value="invite">Invite only</option><option value="open">Open to Members</option><option value="approval">Approval required</option><option value="assigned">PHANTOM assigned</option></select><button disabled={loading} className="mt-3 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white">Create official group</button></form>}<div className="mt-6 grid gap-4 md:grid-cols-2">{groups.map((group) => <article key={group.id} className="rounded-2xl border border-slate-100 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{group.join_mode}</p><h3 className="mt-2 text-lg font-black">{group.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{group.description || 'No group description yet.'}</p><p className="mt-3 text-xs font-bold text-slate-400">{group.member_count} members</p><div className="mt-4 flex gap-2">{group.is_member ? <button onClick={() => setActiveConversation(group)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Open chat</button> : <button onClick={() => void joinGroup(group)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700">{group.join_mode === 'approval' ? 'Request to join' : 'Join group'}</button>}</div></article>)}{!groups.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No groups are available yet.</p>}</div></div> : <div className="flex min-h-[34rem] flex-col">{activeConversation ? <><div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{activeConversation.type === 'dm' ? 'Direct message' : 'Group chat'}</p><h2 className="mt-1 text-xl font-black">{activeConversation.title}</h2></div><button onClick={() => setActiveConversation(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="mt-5 flex-1 space-y-3 overflow-y-auto">{messages.map((chat) => <article key={chat.id} className={`max-w-[85%] rounded-2xl p-4 ${Number(chat.sender_member_profile_id) === Number(user.id) ? 'ml-auto bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}><p className="text-[10px] font-black uppercase tracking-wider opacity-70">{chat.sender_codename}</p>{chat.reply_body && <button onClick={() => setReplyTo({ id: chat.reply_to_message_id, body: chat.reply_body, sender: chat.reply_sender_codename })} className="mt-2 block rounded-lg border border-current/20 px-2 py-1 text-left text-xs opacity-80">↳ {chat.reply_sender_codename}: {chat.reply_body}</button>}<p className="mt-2 whitespace-pre-wrap text-sm leading-6">{chat.body}</p>{(chat.attachments || []).map((attachment: any) => <button key={attachment.id} onClick={() => void db.community.downloadAttachment(attachment.id).then(({ url }) => window.open(url, '_blank', 'noopener,noreferrer'))} className="mt-2 inline-flex rounded-lg border border-current/20 px-2 py-1 text-xs hover:bg-white/15">📎 {attachment.original_name}</button>)}<div className="mt-3 flex flex-wrap gap-1">{['👍','❤️','🔥','✅'].map((emoji) => <button key={emoji} onClick={() => void db.community.reactMessage(chat.id, emoji).then(async () => { const data = await db.community.messages(activeConversation.id); setMessages(data.messages || []); })} className="rounded px-1.5 py-0.5 text-xs hover:bg-white/15">{emoji} {(chat.reactions || []).find((reaction: any) => reaction.emoji === emoji)?.count || ''}</button>)}<button onClick={() => setReplyTo(chat)} className="rounded px-1.5 py-0.5 text-xs hover:bg-white/15">Reply</button>{Number(chat.sender_member_profile_id) === selfProfileId && <><button onClick={() => void editPrivateMessage(chat)} className="rounded px-1.5 py-0.5 text-xs hover:bg-white/15">Edit</button><button onClick={() => void deletePrivateMessage(chat)} className="rounded px-1.5 py-0.5 text-xs hover:bg-white/15">Delete</button></>}</div><p className="mt-2 text-[10px] opacity-70">{time(chat.created_at)}{chat.edited_at ? ' · edited' : ''}</p></article>)}{!messages.length && <p className="grid flex-1 place-items-center text-sm text-slate-500">No messages yet. Say hello.</p>}</div>{replyTo && <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Replying to {replyTo.sender_codename || replyTo.sender}<button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button></div>}<form onSubmit={sendPrivateMessage} className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><input ref={attachmentInput} type="file" className="sr-only" onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)} /><textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="Write a secure message… use @CODENAME to mention" className="min-h-12 flex-1 resize-y rounded-xl border border-slate-200 p-3 text-sm" />{allowedAttachment && <button type="button" onClick={() => attachmentInput.current?.click()} className={`rounded-xl border px-3 text-xs font-black ${attachmentFile ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>{attachmentFile ? 'File ready' : '＋'}</button>}{attachmentFile && <button type="button" disabled={loading} onClick={() => void uploadAttachment()} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700">Upload</button>}<button disabled={loading} className="rounded-xl bg-emerald-600 px-4 text-white"><Send className="h-4 w-4" /></button></form></> : <div className="grid flex-1 place-items-center text-center"><div><MessageCircle className="mx-auto h-9 w-9 text-emerald-600" /><h2 className="mt-4 text-xl font-black">Choose a conversation</h2><p className="mt-2 text-sm text-slate-500">Open a DM, join a group, or select a group chat.</p></div></div>}</div>}</div></section>}</section></main>;
};
