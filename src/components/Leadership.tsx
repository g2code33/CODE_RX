export const Leadership = ({ team }: { team: Array<{ name: string, role: string, image: string }> }) => {
  return (
    <section id="leadership" className="py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">Pharmacy Team</h2>
          <p className="text-slate-500 max-w-2xl mx-auto font-medium text-lg">The clinical and technical experts driving the future of pharmacy.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
          {team.map((leader, i) => (
            <div key={i} className="text-center group">
              <div className="aspect-square rounded-3xl overflow-hidden mb-8 shadow-xl ring-4 ring-emerald-100 group-hover:ring-emerald-300 transition-all duration-500">
                <img src={leader.image} alt={leader.name} className="w-full h-full object-cover" />
              </div>
              <h4 className="text-xl font-black text-slate-900 tracking-tight">{leader.name}</h4>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.2em] mt-2">{leader.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
