import { useEffect, useState } from 'react';
import { Archive, BookOpen, Code2, Compass, FolderKanban, LayoutDashboard, MessageSquare, Search, Settings, Trophy, UserRound, Users, Zap } from 'lucide-react';
import { db, type AuthUser } from '../lib/cloudflare';
import { CodenameBallot } from './CodenameBallot';
import { NotificationCenter } from './NotificationCenter';
import { RecentItems } from './RecentItems';

type View = 'overview' | 'courses' | 'projects' | 'challenges' | 'community' | 'profile';

const browsePublic = (target: string) => { window.location.hash = target; };

export const Dashboard = ({ user, onOpenVault }: { user: AuthUser | null; onOpenVault: () => void }) => {
  const [view, setView] = useState<View>('overview');
  const [member, setMember] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [vaultHome, setVaultHome] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any>({ items: [], unreadCount: 0 });
  const [memberError, setMemberError] = useState('');
  const [loading, setLoading] = useState(true);
  const firstName = user?.name?.split(' ')[0] || 'Member';
  const initial = (user?.name || user?.email || 'C').charAt(0).toUpperCase();

  const loadPortal = async () => {
    setLoading(true);
    const [profile, scores, home, projectRows, inbox] = await Promise.allSettled([
      db.member.me(),
      db.member.leaderboard(10),
      db.vault.home(),
      db.vault.projects(),
      db.notifications.inbox(),
    ]);
    if (profile.status === 'fulfilled') {
      setMember(profile.value);
      setMemberError('');
    } else {
      setMemberError((profile.reason as any)?.message || 'Member profile could not be loaded.');
    }
    if (scores.status === 'fulfilled') setLeaderboard(scores.value);
    if (home.status === 'fulfilled') setVaultHome(home.value);
    if (projectRows.status === 'fulfilled') setProjects(projectRows.value);
    if (inbox.status === 'fulfilled') setNotifications(inbox.value);
    setLoading(false);
  };

  useEffect(() => { void loadPortal(); }, []);

  const navigation = [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' as View },
    { icon: BookOpen, label: 'My Courses', id: 'courses' as View },
    { icon: Code2, label: 'My Projects', id: 'projects' as View },
    { icon: Trophy, label: 'Challenges', id: 'challenges' as View },
    { icon: MessageSquare, label: 'Community', id: 'community' as View },
    { icon: Archive, label: 'Code Rx Vault', id: 'vault' as const },
    { icon: Settings, label: 'Profile', id: 'profile' as View },
  ];

  const content = view === 'profile'
    ? <Profile member={member} error={memberError} onOpenVault={onOpenVault} />
    : view === 'courses'
      ? <CoursesView />
      : view === 'projects'
        ? <ProjectsView projects={projects} onOpenVault={onOpenVault} />
        : view === 'challenges'
          ? <ChallengesView />
          : view === 'community'
            ? <CommunityView notifications={notifications.items || []} />
            : <Overview firstName={firstName} member={member} leaderboard={leaderboard} vaultHome={vaultHome} notifications={notifications} memberError={memberError} loading={loading} onCodenameClaimed={() => { void loadPortal(); }} onOpenVault={onOpenVault} />;

  return <div className="min-h-screen bg-[#f7faf8] pt-20"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="flex flex-col gap-8 lg:flex-row"><aside className="lg:w-64"><div className="mb-6 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#fff1ae] text-xl font-bold text-slate-800">{initial}</div><div className="min-w-0"><h4 className="truncate font-bold text-slate-800">{user?.name || 'Member'}</h4><p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-500">{member?.memberCode || user?.email || 'Code Rx Member'}</p>{member?.codename && <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">{member.codename}</p>}</div></div></div><nav className="space-y-2">{navigation.map((item) => <button key={item.label} onClick={() => item.id === 'vault' ? onOpenVault() : setView(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${view === item.id ? 'bg-[#fff1ae] font-bold text-slate-800 shadow-md shadow-amber-200/50' : 'text-slate-500 hover:bg-white hover:text-slate-800'}`}><item.icon className="h-5 w-5" />{item.label}</button>)}</nav></aside><main className="min-w-0 flex-grow">{content}</main></div></div></div>;
};

const Overview = ({ firstName, member, leaderboard, vaultHome, notifications, memberError, loading, onCodenameClaimed, onOpenVault }: { firstName: string; member: any; leaderboard: any[]; vaultHome: any; notifications: any; memberError: string; loading: boolean; onCodenameClaimed: () => void; onOpenVault: () => void }) => {
  const accessibleDocuments = (vaultHome?.sections || []).reduce((total: number, section: any) => total + Number(section.documentCount || 0), 0);
  return <div className="space-y-8"><header className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-3xl font-black text-slate-800">Welcome, {firstName} 👋</h2><p className="text-slate-500">Your real Code Rx member space is ready for learning, building, and contributing.</p></div><div className="flex items-center gap-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search resources..." className="rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#fff1ae]" /></div><NotificationCenter /></div></header>{memberError && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{memberError}</p>}{member && !member.codename && <CodenameBallot codenamePath={member.codenamePath} onClaimed={onCodenameClaimed} />}<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[{ label: 'Points', value: Number(member?.points || 0).toLocaleString(), icon: Zap, color: 'text-amber-700', bg: 'bg-amber-100' }, { label: 'Accessible Docs', value: loading ? '—' : accessibleDocuments.toLocaleString(), icon: BookOpen, color: 'text-sky-700', bg: 'bg-sky-100' }, { label: 'Projects', value: loading ? '—' : String((vaultHome?.sections || []).find((section: any) => section.slug === 'projects')?.documentCount || 0), icon: FolderKanban, color: 'text-violet-700', bg: 'bg-violet-100' }, { label: 'Updates', value: Number(notifications?.unreadCount || 0).toLocaleString(), icon: MessageSquare, color: 'text-emerald-700', bg: 'bg-emerald-100' }].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><div className={`${stat.bg} ${stat.color} mb-4 grid h-10 w-10 place-items-center rounded-lg`}><stat.icon className="h-6 w-6" /></div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">{stat.label}</p><p className="text-2xl font-black text-slate-800">{stat.value}</p></div>)}</div><div className="grid gap-8 lg:grid-cols-3"><div className="space-y-6 lg:col-span-2"><section className="rounded-3xl border border-emerald-100 bg-[#f2fbf5] p-7 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Live score system</p><h3 className="mt-2 text-xl font-black text-slate-800">Your verified Code Rx balance</h3><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">PHANTOM-approved adjustments and enabled automatic achievements update your score. Every real change is recorded in your notification inbox.</p></div><span className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-2xl font-black text-emerald-700 shadow-sm">{Number(member?.points || 0).toLocaleString()}</span></div></section><section className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-xl font-black text-slate-800">Recent Vault work</h3><p className="mt-1 text-sm text-slate-500">Only real documents you can access appear here.</p></div><button onClick={onOpenVault} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100">Open Vault</button></div><div className="mt-5 space-y-2"><RecentItems items={vaultHome?.recentDocuments || []} label="documents" render={(document) => <div key={document.id} className="rounded-xl border border-slate-100 px-4 py-3"><p className="font-bold text-slate-800">{document.title}</p><p className="mt-1 text-xs text-slate-500">{document.document_code ? `${document.document_code} · ` : ''}{document.section_title || document.section_slug}</p></div>} />{!(vaultHome?.recentDocuments || []).length && <EmptyPanel icon={Archive} title="No Vault documents yet" text="Open the Vault when you are ready to review or contribute to Society documentation." action="Open Vault" onAction={onOpenVault} />}</div></section></div><Leaderboard leaderboard={leaderboard} /></div></div>;
};

const CoursesView = () => <PortalPage eyebrow="Learning" title="My Courses" text="You have not started a tracked course yet. Course progress will appear here once the Academy learning records are connected to your member account." icon={BookOpen} action="Explore Academy" onAction={() => browsePublic('learn')} />;

const ProjectsView = ({ projects, onOpenVault }: { projects: any[]; onOpenVault: () => void }) => <div className="space-y-6"><PortalHeader eyebrow="Projects" title="My Projects" text="Real Vault projects you are allowed to view are listed here." />{projects.length ? <div className="grid gap-4 md:grid-cols-2">{projects.map((project) => <article key={project.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{project.status || 'Planning'}</p><h3 className="mt-2 text-lg font-black text-slate-800">{project.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{project.description || 'No project summary has been added yet.'}</p></article>)}</div> : <PortalPage eyebrow="Projects" title="No accessible projects yet" text="When PHANTOM or your role grants access to a Vault project, it will appear here." icon={FolderKanban} action="Open Vault Projects" onAction={onOpenVault} />}</div>;

const ChallengesView = () => <PortalPage eyebrow="Challenges" title="No active challenges announced" text="Challenge activity is not fabricated for new members. New challenges will appear here when the Society publishes them." icon={Trophy} action="Explore public challenges" onAction={() => browsePublic('challenges')} />;

const CommunityView = ({ notifications }: { notifications: any[] }) => <div className="space-y-6"><PortalHeader eyebrow="Community" title="Community updates" text="Real PHANTOM and delegated-member broadcasts are shown below." />{notifications.length ? <div className="space-y-3"><RecentItems items={notifications} label="community updates" render={(notification) => <article key={notification.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-slate-800">{notification.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">{notification.sender_name || 'Code Rx Society'} · {notification.delivered_at || notification.created_at}</p></div>{notification.status === 'unread' && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />}</div></article>} /></div> : <PortalPage eyebrow="Community" title="No community updates yet" text="PHANTOM broadcasts and approved community notices will appear here when they are sent." icon={Users} action="Explore public community" onAction={() => browsePublic('community')} />}</div>;

const Leaderboard = ({ leaderboard }: { leaderboard: any[] }) => <section className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm"><div className="mb-6 flex items-center justify-between"><h3 className="text-xl font-black text-slate-800">Live Leaderboard</h3><Trophy className="h-5 w-5 text-amber-500" /></div><div className="space-y-4">{leaderboard.length ? leaderboard.slice(0, 10).map((entry) => <div key={entry.member_profile_id} className="flex items-center justify-between"><div className="flex min-w-0 items-center gap-3"><span className="w-7 text-sm font-black text-slate-400">#{entry.rank}</span><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-sm">{entry.rank === 1 ? '🏆' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '✦'}</span><span className="min-w-0"><span className="block truncate font-bold text-slate-800">{entry.display_name}</span><small className="block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{entry.level || entry.member_code}</small></span></div><span className="text-sm font-black text-emerald-700">{Number(entry.points || 0).toLocaleString()}</span></div>) : <p className="text-sm text-slate-500">Scores will appear here as members earn points.</p>}</div></section>;

const Profile = ({ member, error, onOpenVault }: { member: any; error: string; onOpenVault: () => void }) => <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-sm sm:p-9"><div className="flex items-center gap-3"><UserRound className="h-7 w-7 text-emerald-600" /><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Code Rx identity</p><h2 className="text-2xl font-black text-slate-800">Member profile</h2></div></div>{error ? <p className="mt-5 text-sm text-red-600">{error}</p> : <div className="mt-7 grid gap-4 sm:grid-cols-2"><ProfileField label="Member ID" value={member?.memberCode || 'Loading…'} /><ProfileField label="Codename" value={member?.codename || 'Not selected yet'} /><ProfileField label="Points" value={Number(member?.points || 0).toLocaleString()} /><ProfileField label="Responsibility" value={member?.role?.name || member?.level || 'Member'} /><ProfileField label="Account status" value={member?.memberStatus || '—'} /></div>}<button onClick={onOpenVault} className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100">Open Code Rx Vault</button></div>;

const PortalHeader = ({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) => <header><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">{eyebrow}</p><h2 className="mt-2 text-3xl font-black text-slate-800">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{text}</p></header>;
const PortalPage = ({ eyebrow, title, text, icon: Icon, action, onAction }: { eyebrow: string; title: string; text: string; icon: typeof Compass; action: string; onAction: () => void }) => <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm"><PortalHeader eyebrow={eyebrow} title={title} text={text} /><div className="mt-8 grid min-h-48 place-items-center rounded-2xl border border-dashed border-emerald-200 bg-[#f5fcf7] text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm"><Icon className="h-6 w-6" /></div><button onClick={onAction} className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50">{action}</button></div></div></div>;
const EmptyPanel = ({ icon: Icon, title, text, action, onAction }: { icon: typeof Compass; title: string; text: string; action: string; onAction: () => void }) => <div className="rounded-2xl border border-dashed border-emerald-200 bg-[#f5fcf7] p-6 text-center"><Icon className="mx-auto h-7 w-7 text-emerald-600" /><h4 className="mt-3 font-black text-slate-800">{title}</h4><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p><button onClick={onAction} className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50">{action}</button></div>;
const ProfileField = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-2 font-black text-slate-800">{value}</p></div>;
