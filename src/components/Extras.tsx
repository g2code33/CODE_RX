import { ArrowUpRight, Briefcase, GraduationCap, Handshake, Rocket } from 'lucide-react';
import { SectionLink } from './SectionLink';
import { PharmacyBackground } from './PharmacyBackground';

export const Extras = () => {
  return (
    <section id="extras" className="brand-section brand-grid-fine py-24 sm:py-28">
      <PharmacyBackground layout="lab" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10">
        <div className="mb-12 flex items-end justify-between gap-4"><div><div className="brand-eyebrow">Connect & grow</div><h2 className="brand-title mt-5 text-3xl sm:text-4xl">More ways to<br /><span className="brand-gradient-text">plug in.</span></h2></div><SectionLink id="extras" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="brand-card p-7 sm:p-9">
            <div className="flex items-center gap-3 text-[#15803d]"><Handshake className="h-5 w-5" /><span className="brand-number">PARTNERSHIPS</span></div>
            <p className="mt-6 max-w-xl text-sm leading-7 text-[#475569]">We collaborate with universities, pharmacy organizations, and technology teams to bridge the gap between care and code.</p>
            <div className="mt-7 grid grid-cols-2 gap-2">
              {['UCC Pharmacy', 'PharmaLink', 'TechHealth', 'MediCode'].map((partner) => <div key={partner} className="rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 px-3 py-4 text-center text-[0.66rem] font-bold uppercase tracking-wide text-[#475569]">{partner}</div>)}
            </div>
            <button type="button" className="brand-button brand-button--ghost mt-7 w-full">Partner with us <ArrowUpRight className="h-4 w-4" /></button>
          </div>

          <div className="brand-card p-7 sm:p-9">
            <div className="flex items-center gap-3 text-[#15803d]"><Briefcase className="h-5 w-5" /><span className="brand-number">OPPORTUNITIES</span></div>
            <div className="mt-6 space-y-3">
              {[
                { title: 'Clinical Tech Internship', org: 'PharmaLink AI', icon: Briefcase },
                { title: 'Tech Innovation Scholarship', org: 'Code Rx Foundation', icon: GraduationCap },
                { title: 'HealthTech Startup Grant', org: 'Health Launchpad', icon: Rocket }
              ].map((opp) => <div key={opp.title} className="group flex items-center gap-4 rounded-xl border border-[#16a34a]/20 bg-[#b8ff3d]/5 p-4 transition-colors hover:border-[#b8ff3d]/40"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#16a34a]/20 text-[#15803d]"><opp.icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-bold text-[#0f172a]">{opp.title}</span><span className="mt-1 block text-[0.64rem] font-black uppercase tracking-[0.15em] text-[#64748b]">{opp.org}</span></span><ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-[#64748b] transition-colors group-hover:text-[#15803d]" /></div>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
