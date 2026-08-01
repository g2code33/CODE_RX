
import { 
  Trophy, 
  BookOpen, 
  Code2, 
  Star, 
  Zap, 
  LayoutDashboard,
  Settings,
  MessageSquare,
  Search
} from 'lucide-react';
import { LEADERBOARD } from '../data/mockData';

export const Dashboard = () => {
  return (
    <div className="min-h-screen bg-slate-50 pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 space-y-2">
             <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 rounded-full bg-yellow-400 flex items-center justify-center text-xl font-bold">C</div>
                   <div>
                      <h4 className="font-bold text-gray-900">Calcitonin</h4>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">PharmD Tech</p>
                   </div>
                </div>
             </div>

             {[
               { icon: LayoutDashboard, label: 'Overview', active: true },
               { icon: BookOpen, label: 'My Courses', active: false },
               { icon: Code2, label: 'My Projects', active: false },
               { icon: Trophy, label: 'Challenges', active: false },
               { icon: MessageSquare, label: 'Community', active: false },
               { icon: Settings, label: 'Settings', active: false },
             ].map((item, i) => (
               <button 
                 key={i}
                 className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${item.active ? 'bg-yellow-400 text-black font-bold shadow-md' : 'text-gray-500 hover:bg-white hover:text-black'}`}
               >
                 <item.icon className="w-5 h-5" />
                 {item.label}
               </button>
             ))}
          </aside>

          {/* Main Content */}
          <main className="flex-grow space-y-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
               <div>
                  <h2 className="text-3xl font-black text-gray-900">Welcome, Calcitonin 👋</h2>
                  <p className="text-gray-500">You're in the top 5% of pharmacy technologists this week!</p>
               </div>
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search resources..." 
                    className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
               </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               {[
                 { label: 'Points', value: '840', icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-100' },
                 { label: 'Courses', value: '7', icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-100' },
                 { label: 'Projects', value: '3', icon: Code2, color: 'text-purple-600', bg: 'bg-purple-100' },
                 { label: 'Badges', value: '5', icon: Star, color: 'text-emerald-600', bg: 'bg-emerald-100' },
               ].map((stat, i) => (
                 <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-lg flex items-center justify-center mb-4`}>
                       <stat.icon className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                    <p className="text-2xl font-black text-gray-900">{stat.value}</p>
                 </div>
               ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-6">
                  <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                     <h3 className="text-xl font-black text-gray-900 mb-6">Continue Learning</h3>
                     <div className="space-y-6">
                        <div>
                           <div className="flex justify-between items-end mb-2">
                              <div>
                                 <h4 className="font-bold text-gray-900">Advanced AI in Clinical Pharmacy</h4>
                                 <p className="text-sm text-gray-500">Lesson 12 of 15</p>
                              </div>
                              <span className="text-sm font-bold text-yellow-600">80%</span>
                           </div>
                           <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="w-[80%] h-full bg-yellow-400" />
                           </div>
                        </div>
                     </div>
                  </section>

                  <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                     <h3 className="text-xl font-black text-gray-900 mb-6">Upcoming Events</h3>
                     <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 border border-gray-100 rounded-2xl">
                           <div className="w-12 h-12 bg-slate-900 text-yellow-400 rounded-xl flex flex-col items-center justify-center text-[10px] font-bold">
                              <span>AUG</span>
                              <span className="text-lg">25</span>
                           </div>
                           <div>
                              <h4 className="font-bold text-gray-900">CODE Rx DECODER CHALLENGE</h4>
                              <p className="text-sm text-gray-500 underline cursor-pointer">Set Reminder</p>
                           </div>
                        </div>
                     </div>
                  </section>

                  <section className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl">
                     <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black">Community Feed</h3>
                        <span className="text-xs bg-yellow-400 text-black px-2 py-1 rounded font-bold">12 NEW</span>
                     </div>
                     <div className="space-y-6">
                        {[
                           { user: 'Dr. Smith', text: 'Just finished the Python for Pharmacists course. Highly recommend!', time: '2h ago' },
                           { user: 'PharmDev', text: 'Anyone want to collaborate on a medication tracking API?', time: '5h ago' }
                        ].map((post, i) => (
                           <div key={i} className="border-b border-white/10 pb-4 last:border-0">
                              <p className="text-sm font-bold text-yellow-400 mb-1">{post.user}</p>
                              <p className="text-sm text-slate-300">{post.text}</p>
                              <span className="text-[10px] text-slate-500 uppercase mt-2 block font-bold">{post.time}</span>
                           </div>
                        ))}
                     </div>
                  </section>
               </div>

               <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-xl font-black text-gray-900 mb-6">Leaderboard</h3>
                  <div className="space-y-4">
                     {LEADERBOARD.slice(0, 5).map((member) => (
                        <div key={member.rank} className="flex items-center justify-between py-2">
                           <div className="flex items-center gap-3">
                              <span className={`w-6 text-sm font-black ${member.rank <= 3 ? 'text-yellow-600' : 'text-gray-400'}`}>
                                 #{member.rank}
                              </span>
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm">{member.avatar}</div>
                              <span className="font-bold text-gray-900">{member.member}</span>
                           </div>
                           <span className="text-sm font-bold text-gray-500">{member.points}</span>
                        </div>
                     ))}
                     <button className="w-full mt-4 py-2 text-sm font-bold text-yellow-600 hover:underline">
                        View Full Rankings
                     </button>
                  </div>
               </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
