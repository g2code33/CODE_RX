import { motion } from 'framer-motion';
import { SiteContent } from '../data/siteState';
import { SectionLink } from './SectionLink';

export const Terms = ({ content }: { content: SiteContent['terms'] }) => {
  return (
    <section id="terms" className="py-32 bg-gradient-to-br from-emerald-50 to-teal-50 min-h-screen text-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto"
        >
          <div className="text-center mb-24">
            <h1 className="text-6xl font-black text-slate-900 mb-4 tracking-tight">Terms <span className="text-emerald-500">&</span> Conditions</h1>
            <div className="flex justify-center"><SectionLink id="terms" /></div>
            <p className="text-emerald-600 font-black tracking-[0.3em] text-xs uppercase mb-12">"Coding the Future of Pharmacy" 💊💻</p>
            
            <div className="inline-flex flex-wrap justify-center gap-12 p-8 bg-white rounded-3xl border border-emerald-100 shadow-lg">
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Version</p>
                <p className="text-lg font-black text-slate-900 tracking-tight">{content.version}</p>
              </div>
              <div className="w-px h-10 bg-emerald-100 hidden md:block" />
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Effective Date</p>
                <p className="text-lg font-black text-slate-900 tracking-tight">22/03/2026</p>
              </div>
              <div className="w-px h-10 bg-emerald-100 hidden md:block" />
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Last Updated</p>
                <p className="text-lg font-black text-emerald-600 tracking-tight">22/03/2026</p>
              </div>
            </div>
          </div>

          {/* Side-by-Side Two Column Layout */}
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {content.sections.map((section) => (
              <motion.section 
                key={section.id} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group bg-white p-10 rounded-3xl border border-emerald-100 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-100 transition-all duration-500"
              >
                <div className="flex items-center gap-6 mb-8 pb-6 border-b border-emerald-50">
                  <span className="text-4xl font-black text-emerald-500 font-mono">
                    {section.id}
                  </span>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">
                    {section.title}
                  </h2>
                </div>
                <div className="prose prose-emerald max-w-none">
                  <div className="text-slate-600 font-medium leading-relaxed whitespace-pre-line text-sm">
                    {section.content}
                  </div>
                </div>
              </motion.section>
            ))}
          </div>

          <div className="mt-32 p-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[4rem] text-white text-center shadow-2xl shadow-emerald-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/20 blur-[100px] rounded-full" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 blur-[100px] rounded-full" />
            
            <div className="relative z-10">
              <h3 className="text-4xl font-black mb-6 tracking-tight">Official Acceptance</h3>
              <p className="text-emerald-100 mb-12 font-medium max-w-2xl mx-auto text-lg leading-relaxed">
                By registering for Code Rx Society membership, you acknowledge that you have read, understood, and agreed to these Terms & Conditions.
              </p>
              <div className="p-8 bg-white/20 rounded-3xl backdrop-blur-sm border border-white/30 inline-block">
                <p className="font-black text-yellow-300 text-2xl tracking-tight leading-tight">
                  "We don't just learn pharmacy.<br/>We build the technology that moves it forward." 💊💻🚀
                </p>
              </div>
              <div className="mt-12 text-[10px] font-black tracking-widest opacity-60 uppercase">
                Code Rx Society © 2026 • Ghana
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
