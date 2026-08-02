import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { AuthModal } from './components/AuthModal';
import { ContactForm } from './components/ContactForm';
import { ValueCards, About } from './components/About';
import { WhatWeDo } from './components/WhatWeDo';
import { Academy } from './components/Academy';
import { Projects } from './components/Projects';
import { Competitions } from './components/Competitions';
import { Leadership } from './components/Leadership';
import { Extras } from './components/Extras';
import { Terms } from './components/Terms';
import { AdminPanel } from './components/AdminPanel';
import { Footer } from './components/Footer';
import { Dashboard } from './components/Dashboard';
import { ResetPassword } from './components/ResetPassword';
import { SectionLink } from './components/SectionLink';
import { PharmacyBackground } from './components/PharmacyBackground';
import { SECTION_MAP } from './data/mockData';
import { INITIAL_SITE_CONTENT, SiteContent } from './data/siteState';
import { auth, AuthUser } from './lib/cloudflare';

function App() {
  const [isDashboard, setIsDashboard] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(auth.getUser());
  const [activeTab, setActiveTab] = useState('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'join' | 'login'>('join');
  const [isResetView, setIsResetView] = useState(() => window.location.hash.startsWith('#reset'));

  // Auto-clear broken localStorage data
  useEffect(() => {
    try {
      const saved = localStorage.getItem('codeRx_siteContent');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
          localStorage.removeItem('codeRx_siteContent');
        }
      }
    } catch {
      localStorage.removeItem('codeRx_siteContent');
    }
  }, []);

  const [siteContent, setSiteContent] = useState<SiteContent>(() => {
    const saved = localStorage.getItem('codeRx_siteContent');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_SITE_CONTENT,
          ...parsed,
          home: { ...INITIAL_SITE_CONTENT.home, ...parsed.home },
          about: { ...INITIAL_SITE_CONTENT.about, ...parsed.about },
          learn: { ...INITIAL_SITE_CONTENT.learn, ...parsed.learn },
          projects: Array.isArray(parsed.projects) ? parsed.projects : INITIAL_SITE_CONTENT.projects,
          challenges: { ...INITIAL_SITE_CONTENT.challenges, ...parsed.challenges },
          community: { ...INITIAL_SITE_CONTENT.community, ...parsed.community },
          resources: { ...INITIAL_SITE_CONTENT.resources, ...parsed.resources },
          terms: { ...INITIAL_SITE_CONTENT.terms, ...parsed.terms },
        };
      } catch (e) {
        console.error('Failed to load saved content:', e);
        return INITIAL_SITE_CONTENT;
      }
    }
    return INITIAL_SITE_CONTENT;
  });

  useEffect(() => {
    auth.me().then((u) => {
      if (!u) return;
      setUser(u);
      if (u.role === 'admin') {
        setIsAdmin(true);
        setIsDashboard(false);
      } else {
        setIsDashboard(true);
        setIsAdmin(false);
      }
    });
  }, []);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    const idFromHash = () => window.location.hash.replace(/^#\/?/, '').trim() || 'home';
    const applyHash = () => {
      if (window.location.hash.startsWith('#reset')) {
        setIsResetView(true);
        return;
      }
      setIsResetView(false);
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
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 80);
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
    } else {
      auth.logout();
      setUser(null);
      setIsDashboard(false);
      setIsAdmin(false);
    }
  };

  const handleLoginSuccess = (u: AuthUser) => {
    setUser(u);
    setIsAuthOpen(false);
    if (u.role === 'admin') {
      setIsAdmin(true);
      setIsDashboard(false);
    } else {
      setIsDashboard(true);
      setIsAdmin(false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (tabId: string) => {
    const section = SECTION_MAP[tabId];
    const tab = section ? section.tab : tabId;
    setActiveTab(tab);
    setIsDashboard(false);
    if (window.location.hash !== `#${tabId}`) {
      window.location.hash = tabId;
    }
    if (tabId === tab) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      setTimeout(() => {
        const el = document.getElementById(tabId);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
    }
  };

  const renderContent = () => {
    if (isAdmin) return <AdminPanel siteContent={siteContent} setSiteContent={setSiteContent} />;
    if (isDashboard) return <Dashboard user={user} />;

    const safe = {
      home: {
        ...siteContent.home,
        latestNews: Array.isArray(siteContent.home?.latestNews) ? siteContent.home.latestNews : [],
      },
      about: {
        ...siteContent.about,
        tracks: Array.isArray(siteContent.about?.tracks) ? siteContent.about.tracks : [],
        team: Array.isArray(siteContent.about?.team) ? siteContent.about.team : [],
      },
      learn: {
        ...siteContent.learn,
        steps: Array.isArray(siteContent.learn?.steps) ? siteContent.learn.steps : [],
      },
      projects: Array.isArray(siteContent.projects) ? siteContent.projects : [],
      resources: {
        ...siteContent.resources,
        categories: Array.isArray(siteContent.resources?.categories) ? siteContent.resources.categories : [],
      },
      challenges: siteContent.challenges,
      community: siteContent.community,
      terms: siteContent.terms,
    };

    switch (activeTab) {
      case 'home':
        return (
          <>
            <Hero content={safe.home} onJoin={handleOpenJoin} />
            <ValueCards />
            <section id="news" className="brand-section brand-section--panel border-y border-[#b8ff3d]/12 py-24 sm:py-28">
              <PharmacyBackground layout="lab" />
              <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
                <div className="mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                  <div>
                    <div className="brand-eyebrow mb-5">Latest signal</div>
                    <h2 className="brand-title text-4xl sm:text-5xl">What’s moving<br /><span className="brand-gradient-text">the network.</span></h2>
                  </div>
                  <SectionLink id="news" />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {(safe.home.latestNews || []).map((news, index) => (
                    <article key={news.id} className="brand-card brand-card-hover p-6 sm:p-7">
                      <div className="flex items-center justify-between"><span className="brand-number">0{index + 1} / {news.category}</span><span className="h-1.5 w-1.5 rounded-full bg-[#b8ff3d] shadow-[0_0_10px_#b8ff3d]" /></div>
                      <h3 className="mt-8 text-xl font-black leading-tight tracking-tight text-[#f2f8ed]">{news.title}</h3>
                      <p className="mt-4 text-sm leading-7 text-[#8da18e]">{news.text}</p>
                      <div className="mt-7 h-px w-12 bg-[#b8ff3d]/60" />
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </>
        );
      case 'about':
        return (
          <>
            <About mission={safe.about.mission} vision={safe.about.vision} motto={safe.about.motto} />
            <WhatWeDo tracks={safe.about.tracks} />
            <Leadership team={safe.about.team} />
            <Extras />
          </>
        );
      case 'learn':
        return <Academy steps={safe.learn.steps} />;
      case 'projects':
        return <Projects projects={safe.projects} />;
      case 'challenges':
        return <Competitions active={safe.challenges.active} />;
      case 'community':
        return (
          <section id="community" className="brand-section brand-grid min-h-[70vh] py-28 sm:py-36">
            <PharmacyBackground layout="clinic" />
            <div className="brand-glow right-[-12rem] top-20 opacity-50" />
            <div className="relative z-10 mx-auto flex min-h-[55vh] max-w-[1440px] items-center px-5 sm:px-8 lg:px-10">
              <div className="max-w-3xl">
                <div className="mb-6 flex items-center gap-5"><div className="brand-eyebrow">Community hub</div><SectionLink id="community" /></div>
                <h2 className="brand-title text-5xl sm:text-6xl lg:text-8xl">{safe.community.hubTitle}<span className="brand-gradient-text block text-[0.7em]">Find your people.</span></h2>
                <p className="brand-copy mt-7 max-w-2xl text-base sm:text-lg">{safe.community.description}</p>
                <a href={safe.community.telegramLink} target="_blank" rel="noopener noreferrer" className="brand-button mt-9">Join Telegram channel <ArrowRight className="h-4 w-4" /></a>
              </div>
            </div>
          </section>
        );
      case 'resources':
        return (
          <section id="resources" className="brand-section brand-section--alt min-h-[70vh] py-28 sm:py-36">
            <PharmacyBackground layout="lab" />
            <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
              <div className="mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="brand-eyebrow mb-5">The library</div><h2 className="brand-title text-4xl sm:text-5xl">Tools for the<br /><span className="brand-gradient-text">next prescription.</span></h2></div><SectionLink id="resources" /></div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {(safe.resources.categories || []).map((cat, index) => (
                  <article key={cat.name} className="brand-card brand-card-hover p-6 sm:p-7"><span className="brand-number">0{index + 1} / LIBRARY</span><h3 className="mt-8 text-xl font-black text-[#f2f8ed]">{cat.name}</h3><ul className="mt-6 space-y-3 border-t border-[#b8ff3d]/12 pt-5 text-sm text-[#8da18e]">{cat.items.map((item, i) => <li key={i} className="flex items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-[#b8ff3d]" />{item}</li>)}</ul></article>
                ))}
              </div>
            </div>
          </section>
        );
      case 'terms':
        return <Terms content={safe.terms} />;
      default:
        return <Hero content={safe.home} onJoin={handleOpenJoin} />;
    }
  };

  if (isResetView) {
    return (
      <ResetPassword
        onDone={() => {
          window.location.hash = '';
          setIsResetView(false);
          window.scrollTo({ top: 0, behavior: 'instant' });
        }}
      />
    );
  }

  return (
    <div className="brand-app min-h-screen">
      <Navbar 
        onDashboardToggle={toggleDashboard} 
        isDashboard={isDashboard} 
        activeTab={activeTab}
        setActiveTab={handleTabChange}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onGoToTerms={() => {
          setIsAuthOpen(false);
          handleTabChange('terms');
        }}
        defaultMode={authMode}
      />

      <ContactForm isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />
      
      {!isDashboard && !isAdmin && (
        <button 
          onClick={handleOpenJoin}
          className="fixed bottom-6 right-5 z-50 grid h-14 w-14 place-items-center rounded-full border border-[#b8ff3d] bg-[#b8ff3d] text-[0.62rem] font-black uppercase tracking-wide text-[#020604] shadow-[0_0_24px_rgba(184,255,61,0.35)] transition-all hover:scale-110 active:scale-95 md:hidden"
        >
           <div className="flex flex-col items-center">
              <span className="text-xl font-black leading-none uppercase">Join</span>
           </div>
        </button>
      )}

      <main>
        {renderContent()}
        {!isDashboard && !isAdmin && (
          <section id="join" className="brand-section brand-grid relative overflow-hidden border-y border-[#b8ff3d]/20 py-28 sm:py-36">
            <PharmacyBackground layout="hero" />
            <div className="brand-glow left-1/2 top-[-16rem] -translate-x-1/2 opacity-50" />
            <div className="brand-scanlines absolute inset-0" />
            <div className="relative z-10 mx-auto max-w-4xl px-5 text-center sm:px-8">
              <div className="mb-6 flex items-center justify-center gap-4"><div className="brand-eyebrow">Your next build starts here</div><SectionLink id="join" /></div>
              <h2 className="brand-title text-5xl sm:text-6xl lg:text-8xl">Ready to code<br /><span className="brand-gradient-text">the future?</span></h2>
              <p className="brand-copy mx-auto mt-7 max-w-2xl text-base sm:text-lg">Join the CODE Rx Society and turn your pharmacy perspective into something the world can use.</p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleOpenJoin} className="brand-button"><span>Join the society</span><ArrowRight className="h-4 w-4" /></motion.button><motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="brand-button brand-button--ghost">Back to top <ArrowRight className="h-4 w-4 -rotate-45" /></motion.button></div>
            </div>
          </section>
        )}
      </main>

      {!isAdmin && <Footer />}
    </div>
  );
}

export default App;