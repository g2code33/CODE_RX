import { WHAT_WE_DO } from '../data/mockData';

export const WhatWeDo = ({ tracks }: { tracks: typeof WHAT_WE_DO }) => {
  return (
    <section id="what-we-do" className="py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">Society Tracks</h2>
          <p className="text-slate-500 max-w-2xl mx-auto font-medium text-lg">Exploring the intersection of pharmacy and technology through specialized tracks.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {tracks.map((item, index) => (
            <div key={index} className="group p-10 rounded-3xl border border-emerald-100 bg-emerald-50/50 hover:bg-white hover:shadow-2xl hover:shadow-emerald-100 transition-all duration-500">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500 border border-emerald-100">
                <item.icon className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">{item.title}</h3>
              <ul className="space-y-3">
                {item.items.map((sub, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-500 text-sm font-bold">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    {sub}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
