import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, UserPlus } from 'lucide-react';
import { SiteContent } from '../data/siteState';

export const Hero = ({ content, onJoin }: { 
  content: SiteContent['home'], 
  onJoin?: () => void
}) => {
  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 pt-20">
      {/* Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-10">
        <div className="absolute top-20 left-10 text-8xl">💊</div>
        <div className="absolute top-40 right-20 text-6xl">🧪</div>
        <div className="absolute bottom-40 left-20 text-7xl">🔬</div>
        <div className="absolute bottom-20 right-10 text-6xl"></div>
        <div className="absolute top-1/2 left-1/3 text-5xl">🏥</div>
        <div className="absolute top-1/3 right-1/4 text-6xl">🧬</div>
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/50 via-transparent to-teal-900/50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-400/20 border border-yellow-400/30 text-yellow-400 text-sm font-bold mb-8 backdrop-blur-sm">
              <Sparkles className="w-4 h-4" />
              <span>{content.heroTagline}</span>
            </div>
            
            <h1 className="text-6xl lg:text-8xl font-black text-white leading-none mb-8 tracking-tight">
              {content.heroTitle} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">{content.heroSubtitle}</span>
            </h1>
            
            <p className="text-xl text-emerald-100 mb-10 max-w-xl leading-relaxed">
              {content.heroDescription}
            </p>

            <div className="flex flex-wrap gap-4">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onJoin}
                className="px-10 py-5 bg-emerald-500 text-white font-bold rounded-full hover:bg-emerald-400 shadow-xl shadow-emerald-500/30 transition-all flex items-center gap-3 group text-lg"
              >
                <UserPlus className="w-5 h-5" />
                Join Code Rx
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                className="px-10 py-5 bg-white/10 text-white font-bold rounded-full border border-white/20 hover:bg-white/20 backdrop-blur-sm transition-all flex items-center gap-2 text-lg"
              >
                Explore
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>

            <div className="mt-12 flex items-center gap-6">
              <div className="flex -space-x-3">
                {content.communityMembers.slice(0, 4).map((member) => (
                  <div key={member.id} className="w-12 h-12 rounded-full border-2 border-emerald-800 bg-emerald-700 flex items-center justify-center overflow-hidden">
                    <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <p className="text-sm text-emerald-200 font-medium">
                Join <span className="text-white font-bold">{content.communityCount}+</span> pharmacists and developers already building the future.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <div className="relative z-10 bg-emerald-800/50 border border-emerald-500/30 p-8 rounded-[3rem] shadow-2xl overflow-hidden backdrop-blur-md">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
              
              {/* Animated Code Lines */}
              <div className="absolute inset-0 p-8 flex flex-col gap-3 opacity-20">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="h-2 bg-emerald-400 rounded-full animate-pulse" style={{ width: `${Math.random()*60+20}%`, animationDelay: `${i*0.1}s` }} />
                ))}
              </div>

              <div className="relative flex flex-col items-center justify-center aspect-square">
                <img src="/logo.png" alt="Code Rx" className="w-96 h-96 max-w-[90vw] object-contain drop-shadow-[0_0_50px_rgba(16,185,129,0.4)] animate-pulse" />
              </div>
            </div>
            
            {/* Floating Challenge Card */}
            <motion.div 
              animate={{ y: [-10, 10, -10] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-8 -left-8 bg-white p-6 rounded-3xl shadow-2xl z-20 max-w-[280px]"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Challenge</span>
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-4">CRX-DECODER-001</h4>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Prize Pool</p>
                  <p className="text-2xl font-black text-emerald-600"> 2,500</p>
                </div>
                <button className="text-emerald-600 font-bold text-sm hover:underline">JOIN →</button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
