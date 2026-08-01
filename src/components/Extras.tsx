import { Handshake, GraduationCap, Briefcase, Rocket } from 'lucide-react';

export const Extras = () => {
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16">
          {/* Partnerships */}
          <div>
            <div className="flex items-center gap-2 text-yellow-600 mb-6">
               <Handshake className="w-6 h-6" />
               <h3 className="text-2xl font-black uppercase tracking-tight">Partnerships</h3>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
               <p className="text-gray-600 mb-8">We collaborate with top universities, pharmacy organizations, and tech giants to bridge the gap.</p>
               <div className="grid grid-cols-2 gap-4">
                  {['UCC Pharmacy', 'PharmaLink', 'TechHealth', 'MediCode'].map((partner, i) => (
                    <div key={i} className="h-16 bg-slate-50 rounded-xl flex items-center justify-center font-bold text-gray-400 border border-slate-100 italic">
                       {partner}
                    </div>
                  ))}
               </div>
               <button className="mt-8 w-full py-4 border-2 border-black font-black rounded-xl hover:bg-black hover:text-white transition-all">
                  PARTNER WITH US
               </button>
            </div>
          </div>

          {/* Opportunities */}
          <div>
            <div className="flex items-center gap-2 text-blue-600 mb-6">
               <Briefcase className="w-6 h-6" />
               <h3 className="text-2xl font-black uppercase tracking-tight">Opportunities</h3>
            </div>
            <div className="space-y-4">
               {[
                 { title: 'Clinical Tech Internship', org: 'PharmaLink AI', icon: Briefcase, color: 'text-blue-500' },
                 { title: 'Tech Innovation Scholarship', org: 'Code Rx Foundation', icon: GraduationCap, color: 'text-purple-500' },
                 { title: 'HealthTech Startup Grant', org: 'Health Launchpad', icon: Rocket, color: 'text-orange-500' },
               ].map((opp, i) => (
                 <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-6 group cursor-pointer">
                    <div className={`w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center ${opp.color} group-hover:scale-110 transition-transform`}>
                       <opp.icon className="w-6 h-6" />
                    </div>
                    <div>
                       <h4 className="font-bold text-gray-900">{opp.title}</h4>
                       <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{opp.org}</p>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
