import { useState } from 'react';
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
import { INITIAL_SITE_CONTENT, SiteContent } from './data/siteState';

function App() {
  const [isDashboard, setIsDashboard] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'join' | 'login'>('join');
  
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

  const handleOpenJoin = () => {
    setAuthMode('join');
    setIsAuthOpen(true);
  };

  const toggleDashboard = () => {
    if (!isDashboard && !isAdmin) {
      handleOpenJoin();
    } else {
      setIsDashboard(false);
      setIsAdmin(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthOpen(false);
    setIsDashboard(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminLogin = () => {
    setIsAuthOpen(false);
    setIsAdmin(true);
    setIsDashboard(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setIsDashboard(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const renderContent = () => {
    if (isAdmin) return <AdminPanel siteContent={siteContent} setSiteContent={setSiteContent} />;
    if (isDashboard) return <Dashboard />;

    switch (activeTab) {
      case 'home':
        return (
          <>
            <Hero 
              content={siteContent.home} 
              onJoin={handleOpenJoin}
            />
            <ValueCards />
            <div className="py-20 bg-slate-50 border-y border-slate-100">
               <div className="max-w-7xl mx-auto px-4">
                  <h3 className="text-3xl font-black mb-8 uppercase text-center tracking-tight">Latest News</h3>
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
          <section className="py-40 bg-white min-h-[70vh] flex items-center justify-center">
            <div className="text-center px-4">
              <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase">{siteContent.community.hubTitle}</h2>
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
          <section className="py-40 bg-slate-50 min-h-[70vh]">
            <div className="max-w-7xl mx-auto px-4">
               <h2 className="text-5xl font-black mb-12 uppercase tracking-tighter">Resource Library</h2>
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
        onAdminLogin={handleAdminLogin}
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
          <section className="py-32 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 relative overflow-hidden">
             {/* Background Pattern */}
             <div className="absolute inset-0 pointer-events-none opacity-10">
                <motion.div animate={{ y: [0, -20, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute left-[10%] top-[20%] text-6xl"></motion.div>
                <motion.div animate={{ y: [0, -25, 0] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }} className="absolute right-[15%] top-[10%] text-6xl"></motion.div>
                <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 3, repeat: Infinity, delay: 1 }} className="absolute left-[20%] bottom-[30%] text-5xl">🧪</motion.div>
                <motion.div animate={{ y: [0, -18, 0] }} transition={{ duration: 2.8, repeat: Infinity, delay: 0.8 }} className="absolute right-[25%] bottom-[20%] text-5xl"></motion.div>
             </div>

             <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
                <h2 className="text-5xl lg:text-7xl font-black mb-8 leading-tight text-white tracking-tight">Ready to Code the Future?</h2>
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
