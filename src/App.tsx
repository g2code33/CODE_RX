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

  // Load from localStorage on mount
  const [siteContent, setSiteContent] = useState<SiteContent>(() => {
    const saved = localStorage.getItem('codeRx_siteContent');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load saved content:', e);
        return INITIAL_SITE_CONTENT;
      }
    }
    return INITIAL_SITE_CONTENT;
  });

  // Restore a valid session on load (validates the stored token with the API)
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

  // Keep a ref of activeTab for the hash handler (avoids re-binding)
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Deep-linkable sections: every section has its own URL hash, e.g.
  // https://coderxsociety.pages.dev/#learn or .../#what-we-do. Tab-level hashes
  // open the page (scrolled to top); sub-section hashes open the parent page and
  // then smooth-scroll straight to that section.
  useEffect(() => {
    const idFromHash = () => window.location.hash.replace(/^#\/?/, '').trim() || 'home';
    const applyHash = () => {
      // Password-reset links look like #reset?token=...&email=... — show the
      // reset screen instead of mapping the hash to a section.
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
        // The parent tab may not be rendered yet — wait for it, then scroll.
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 80);
      }
    };
    applyHash(); // on first load, honor any incoming hash (deep link)
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
      // Exiting the portal / admin panel signs the session out
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
    // A section id may point at a sub-section of a page (e.g. #what-we-do lives
    // on the About page). Resolve it to its parent tab and scroll to it.
    const section = SECTION_MAP[tabId];
    const tab = section ? section.tab : tabId;
    setActiveTab(tab);
    setIsDashboard(false);
    // Update the URL hash so the section is shareable / directly visitable.
    // The hashchange listener keeps the state in sync (guarded, so no loop).
    if (window.location.hash !== `#${tabId}`) {
      window.location.hash = tabId;
    }
    if (tabId === tab) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (tab !== activeTabRef.current) {
      // The parent page just switched — let it render, then scroll to the section.
      setTimeout(() => {
        const el = document.getElementById(tabId);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
    } else {
      const el = document.getElementById(tabId);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  const renderContent = () => {
    if (isAdmin) return <AdminPanel siteContent={siteContent} setSiteContent={setSiteContent} />;
    if (isDashboard) return <Dashboard user={user} />;

    switch (activeTab) {
      case 'home':
        return (
          <>
            <Hero 
              content={siteContent.home} 
              onJoin={handleOpenJoin}
            />
            <ValueCards />
            <div id="news" className="py-20 bg-slate-50 border-y border-slate-100">
               <div className="max-w-7xl mx-auto px-4">
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <h3 className="text-3xl font-black uppercase tracking-tight">Latest News</h3>
                    <SectionLink id="news" />
                  </div>
                  <div className="grid md:grid-cols-3 gap-8">
                     {siteContent.home.latestNews.map(news => (
                        <div key={news.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-shadow">
                           <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">{news.category}</span>
                           <h4 className="font-black text-xl mt-3 mb-3 text-slate-900">{news.title}</h4>
                           <p className="text-sm text-slate-500 leading-relaxed">{news.text}</p>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </>
        );
      case 'about':
        return (
          <>
            <About mission={siteContent.about.mission} vision={siteContent.about.vision} motto={siteContent.about.motto} />
            <WhatWeDo tracks={siteContent.about.tracks} />
            <Leadership team={siteContent.about.team} />
            <Extras />
          </>
        );
      case 'learn':
        return <Academy steps={siteContent.learn.steps} />;
      case 'projects':
        return <Projects projects={siteContent.projects} />;
      case 'challenges':
        return <Competitions active={siteContent.challenges.active} />;
      case 'community':
        return (
          <section id="community" className="py-40 bg-white min-h-[70vh] flex items-center justify-center">
            <div className="text-center px-4">
              <div className="flex items-center justify-center gap-4 mb-6">
                <h2 className="text-5xl font-black tracking-tighter uppercase">{siteContent.community.hubTitle}</h2>
                <SectionLink id="community" />
              </div>
              <p className="text-xl text-slate-500 mb-8 max-w-2xl mx-auto">{siteContent.community.description}</p>
              <a 
                href={siteContent.community.telegramLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-block px-10 py-4 bg-blue-500 text-white font-black rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-blue-100"
              >
                JOIN TELEGRAM CHANNEL
              </a>
            </div>
          </section>
        );
      case 'resources':
        return (
          <section id="resources" className="py-40 bg-slate-50 min-h-[70vh]">
            <div className="max-w-7xl mx-auto px-4">
               <div className="flex items-center gap-4 mb-12">
                  <h2 className="text-5xl font-black uppercase tracking-tighter">Resource Library</h2>
                  <SectionLink id="resources" />
               </div>
               <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {siteContent.resources.categories.map(cat => (
                    <div key={cat.name} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                       <h3 className="text-xl font-bold mb-4">{cat.name}</h3>
                       <ul className="space-y-3 text-sm text-slate-600">
                          {cat.items.map((item, i) => (
                            <li key={i}>• {item}</li>
                          ))}
                       </ul>
                    </div>
                  ))}
               </div>
            </div>
          </section>
        );
      case 'terms':
        return <Terms content={siteContent.terms} />;
      default:
        return <Hero content={siteContent.home} onJoin={handleOpenJoin} />;
    }
  };

  // Password reset view (reached via the email's reset link) — full screen,
  // no navbar/footer.
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
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-emerald-200 selection:text-black">
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
      
      {/* Floating Action Button */}
      {!isDashboard && !isAdmin && (
        <button 
          onClick={handleOpenJoin}
          className="fixed bottom-8 right-8 w-16 h-16 bg-emerald-500 text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:scale-110 active:scale-90 transition-all group md:hidden border-2 border-white"
        >
           <div className="flex flex-col items-center">
              <span className="text-xl font-black leading-none uppercase">Join</span>
           </div>
        </button>
      )}

      <main>
        {renderContent()}
        {!isDashboard && !isAdmin && (
          <section id="join" className="py-32 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 relative overflow-hidden">
             {/* Background Pattern */}
             <div className="absolute inset-0 pointer-events-none opacity-10">
                <motion.div animate={{ y: [0, -20, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute left-[10%] top-[20%] text-6xl"></motion.div>
                <motion.div animate={{ y: [0, -25, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }} className="absolute right-[15%] top-[10%] text-6xl"></motion.div>
                <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 3, repeat: Infinity, delay: 1 }} className="absolute left-[20%] bottom-[30%] text-5xl">🧪</motion.div>
                <motion.div animate={{ y: [0, -18, 0] }} transition={{ duration: 2.8, repeat: Infinity, delay: 0.8 }} className="absolute right-[25%] bottom-[20%] text-5xl"></motion.div>
             </div>

             <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
                <div className="flex items-center justify-center gap-4 mb-8">
                  <h2 className="text-5xl lg:text-7xl font-black leading-tight text-white tracking-tight">Ready to Code the Future?</h2>
                  <SectionLink id="join" light />
                </div>
                <p className="text-2xl font-bold mb-12 text-emerald-100">Join the CODE Rx Society today and start building.</p>
                <div className="flex flex-col sm:flex-row gap-6 justify-center">
                   <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleOpenJoin}
                    className="px-14 py-6 bg-white text-emerald-600 font-black rounded-full hover:bg-emerald-50 transition-all text-xl shadow-2xl shadow-white/20 flex items-center justify-center gap-3"
                   >
                      <span>JOIN THE SOCIETY</span>
                      <ArrowRight className="w-6 h-6" />
                   </motion.button>
                   <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}
                    className="px-14 py-6 bg-emerald-700/30 text-white font-black rounded-full border-2 border-white/30 hover:bg-emerald-700/50 backdrop-blur-sm transition-all text-xl flex items-center justify-center gap-2"
                   >
                      EXPLORE
                      <ArrowRight className="w-5 h-5" />
                   </motion.button>
                </div>
             </div>
          </section>
        )}
      </main>

      {!isAdmin && <Footer />}
    </div>
  );
}

export default App;
