import { useEffect, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { Dashboard } from './components/Dashboard';
import { Vault } from './components/Vault';
import { ResetPassword } from './components/ResetPassword';
import { ActivateAccount } from './components/ActivateAccount';
import { SiteFlow } from './components/SiteFlow';
import { VisualEditorProvider } from './components/VisualEditorContext';
import { SECTION_MAP } from './data/mockData';
import { INITIAL_SITE_CONTENT, SiteContent, normalizeSiteContent } from './data/siteState';
import { auth, AuthUser, db, isAdminUser } from './lib/cloudflare';

function App() {
  const [isDashboard, setIsDashboard] = useState(false);
  const [isMemberVault, setIsMemberVault] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminWorkspace, setAdminWorkspace] = useState<'controller' | 'builder' | 'vault'>('controller');
  const [user, setUser] = useState<AuthUser | null>(auth.getUser());
  const [activeTab, setActiveTab] = useState('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'join' | 'login'>('join');
  const [isResetView, setIsResetView] = useState(() => window.location.hash.startsWith('#reset'));
  const [isActivationView, setIsActivationView] = useState(() => window.location.hash.startsWith('#activate'));

  // Auto-clear corrupted localStorage data. Schema gaps are repaired below.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('codeRx_siteContent');
      if (saved) JSON.parse(saved);
    } catch {
      localStorage.removeItem('codeRx_siteContent');
    }
  }, []);

  const [siteContent, setSiteContent] = useState<SiteContent>(() => {
    try {
      const saved = localStorage.getItem('codeRx_siteContent');
      if (saved) return normalizeSiteContent(JSON.parse(saved));
    } catch (error) {
      console.error('Failed to load saved content:', error);
      localStorage.removeItem('codeRx_siteContent');
    }
    return INITIAL_SITE_CONTENT;
  });

  // Public visitors now load the same published D1 document as the builder.
  // A locally queued admin publish always wins until it has been retried.
  useEffect(() => {
    if (localStorage.getItem('codeRx_pendingSiteContent')) return;
    db.siteContent.get()
      .then((published) => {
        if (published) setSiteContent(normalizeSiteContent(published));
      })
      .catch((error) => console.warn('Unable to load published site content:', error));
  }, []);

  // All entry points—including the visual builder and legacy controller—pass
  // through the normalizer, so older D1 documents cannot crash public renders.
  const handleSetSiteContent: React.Dispatch<React.SetStateAction<SiteContent>> = (action) => {
    setSiteContent((previous) => normalizeSiteContent(
      typeof action === 'function' ? (action as (current: SiteContent) => SiteContent)(previous) : action,
    ));
  };

  useEffect(() => {
    auth.me().then((authenticatedUser) => {
      if (!authenticatedUser) return;
      setUser(authenticatedUser);
      if (isAdminUser(authenticatedUser)) {
        setIsAdmin(true);
        setIsDashboard(false);
        setIsMemberVault(false);
        setAdminWorkspace('controller');
      } else {
        setIsDashboard(true);
        setIsMemberVault(false);
        setIsAdmin(false);
      }
    });
  }, []);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    const idFromHash = () => window.location.hash.replace(/^#\/?/, '').trim() || 'home';
    const applyHash = () => {
      if (window.location.hash.startsWith('#activate')) {
        setIsActivationView(true);
        setIsResetView(false);
        return;
      }
      if (window.location.hash.startsWith('#reset')) {
        setIsResetView(true);
        setIsActivationView(false);
        return;
      }
      setIsResetView(false);
      setIsActivationView(false);
      const id = idFromHash();
      const section = SECTION_MAP[id];
      const tab = section ? section.tab : 'home';
      if (tab !== activeTabRef.current) {
        setActiveTab(tab);
        setIsDashboard(false);
      }
      if (id === tab) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const handleOpenJoin = () => {
    setAuthMode('join');
    setIsAuthOpen(true);
  };

  const toggleDashboard = () => {
    if (!isDashboard && !isAdmin) {
      setAuthMode('login');
      setIsAuthOpen(true);
      return;
    }
    auth.logout();
    setUser(null);
    setIsDashboard(false);
    setIsMemberVault(false);
    setIsAdmin(false);
    setAdminWorkspace('controller');
  };

  const handleLoginSuccess = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    setIsAuthOpen(false);
    if (isAdminUser(authenticatedUser)) {
      setIsAdmin(true);
      setIsDashboard(false);
      setIsMemberVault(false);
      setAdminWorkspace('controller');
    } else {
      setIsDashboard(true);
      setIsMemberVault(false);
      setIsAdmin(false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (tabId: string) => {
    const section = SECTION_MAP[tabId];
    const tab = section ? section.tab : tabId;
    setActiveTab(tab);
    setIsDashboard(false);
    if (window.location.hash !== `#${tabId}`) window.location.hash = tabId;
    if (tabId === tab) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      setTimeout(() => document.getElementById(tabId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
    }
  };

  if (isResetView) {
    return <ResetPassword onDone={() => { window.location.hash = ''; setIsResetView(false); window.scrollTo({ top: 0, behavior: 'instant' }); }} />;
  }

  if (isActivationView) {
    return <ActivateAccount
      onDone={() => { window.location.hash = ''; setIsActivationView(false); }}
      onActivated={(activatedUser) => { setIsActivationView(false); handleLoginSuccess(activatedUser); }}
    />;
  }

  const inImmersiveWorkspace = (isAdmin && (adminWorkspace === 'builder' || adminWorkspace === 'vault')) || (!isAdmin && isDashboard && isMemberVault);
  const mainContent = isAdmin
    ? <AdminPanel siteContent={siteContent} setSiteContent={handleSetSiteContent} workspace={adminWorkspace} onWorkspaceChange={setAdminWorkspace} activeTab={activeTab} onNavigate={handleTabChange} onJoin={handleOpenJoin} user={user} />
    : isDashboard
      ? isMemberVault
        ? <Vault workspaceMode="member" onBack={() => setIsMemberVault(false)} />
        : <Dashboard user={user} onOpenVault={() => setIsMemberVault(true)} />
      : <SiteFlow siteContent={siteContent} activeTab={activeTab} onJoin={handleOpenJoin} includeFooter includeJoinCta />;

  const shell = (
    <div className="brand-app min-h-screen">
      {!inImmersiveWorkspace && <Navbar onDashboardToggle={toggleDashboard} isDashboard={isDashboard} activeTab={activeTab} setActiveTab={handleTabChange} copy={siteContent.copy} media={siteContent.media} />}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onGoToTerms={() => { setIsAuthOpen(false); handleTabChange('terms'); }}
        defaultMode={authMode}
      />
      {!isDashboard && !isAdmin && <button onClick={handleOpenJoin} className="fixed bottom-6 right-5 z-50 grid h-14 w-14 place-items-center rounded-full border border-[#b8ff3d] bg-[#b8ff3d] text-[0.66rem] font-black uppercase tracking-wide text-[#020604] shadow-[0_0_24px_rgba(184,255,61,0.35)] transition-all hover:scale-110 active:scale-95 md:hidden"><span className="text-xl font-black leading-none uppercase">Join</span></button>}
      <main>{mainContent}</main>
    </div>
  );

  // Public pages use the same design renderer as the live builder, without
  // any selectable outlines or editor controls.
  return !isAdmin && !isDashboard
    ? <VisualEditorProvider enabled={false} interactionMode="preview" selected={null} select={() => undefined} design={siteContent.design}>{shell}</VisualEditorProvider>
    : shell;
}

export default App;
