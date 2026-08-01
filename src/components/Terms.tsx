import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { SiteContent } from '../data/siteState';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';

export const Terms = ({ content }: { content: SiteContent['terms'] }) => {
  return (
    <section id="terms" className="brand-section brand-grid-fine min-h-screen py-28 text-[#a9bf9f] sm:py-36">
      <PharmacyBackground layout="clinic" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-16 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><div className="brand-eyebrow mb-5"><FileText className="h-3.5 w-3.5" /> Legal / society terms</div><h1 className="brand-title text-4xl sm:text-5xl lg:text-6xl">Terms <span className="brand-gradient-text">&</span><br />Conditions</h1><p className="mt-6 text-sm uppercase tracking-[0.14em] text-[#718675]">Coding the future of pharmacy</p></div><SectionLink id="terms" /></div>

          <div className="mb-10 grid gap-3 sm:grid-cols-3">
            {[['VERSION', content.version], ['EFFECTIVE DATE', '22/03/2026'], ['LAST UPDATED', '22/03/2026']].map(([label, value]) => <div key={label} className="brand-card p-5"><p className="brand-number">{label}</p><p className="mt-2 text-sm font-bold text-[#f2f8ed]">{value}</p></div>)}
          </div>

          <div className="grid items-start gap-4 md:grid-cols-2">
            {content.sections.map((section) => (
              <motion.article key={section.id} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="brand-card brand-card-hover p-6 sm:p-8">
                <div className="mb-6 flex items-start gap-4 border-b border-[#b8ff3d]/12 pb-5"><span className="brand-number text-lg">{section.id}</span><h2 className="text-base font-black leading-snug text-[#f2f8ed]">{section.title}</h2></div>
                <div className="whitespace-pre-line text-sm leading-7 text-[#8da18e]">{section.content}</div>
              </motion.article>
            ))}
          </div>

          <div className="relative mt-16 overflow-hidden rounded-2xl border border-[#b8ff3d]/30 bg-[#0b1c10] p-8 text-center sm:p-12"><div className="brand-glow left-1/2 top-[-14rem] -translate-x-1/2 opacity-40" /><div className="relative z-10"><p className="brand-eyebrow justify-center">Official acceptance</p><h3 className="mt-5 text-2xl font-black text-[#f2f8ed] sm:text-3xl">Build with care. Build with purpose.</h3><p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#8da18e]">By registering for Code Rx Society membership, you acknowledge that you have read, understood, and agreed to these Terms & Conditions.</p><p className="mt-7 text-sm font-black uppercase tracking-[0.12em] text-[#b8ff3d]">We don't just learn pharmacy. We build what moves it forward.</p><p className="mt-9 text-[0.58rem] font-black uppercase tracking-[0.18em] text-[#718675]">Code Rx Society © 2026 / Ghana</p></div></div>
        </motion.div>
      </div>
    </section>
  );
};
