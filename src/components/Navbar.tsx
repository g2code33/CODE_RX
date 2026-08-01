import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NAV_LINKS } from '../data/mockData';

export const Navbar = ({ 
  onDashboardToggle, 
  isDashboard, 
  activeTab, 
  setActiveTab 
}: { 
  onDashboardToggle: () => void, 
  isDashboard: boolean,
  activeTab: string,
  setActiveTab: (id: string) => void
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed w-full z-50 bg-white/95 backdrop-blur-md shadow-lg py-2 border-b border-emerald-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0" onClick={() => setActiveTab('home')}>
            <div className="w-11 h-11 sm:w-11 sm:h-11 shrink-0">
              <img src="/logo.png" alt="Code Rx Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-black text-lg leading-none tracking-tight text-emerald-600 whitespace-nowrap">CODE Rx</span>
              <span className="text-[9px] tracking-[0.25em] font-black text-emerald-400 uppercase whitespace-nowrap">Society</span>
            </div>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-1">
            {!isDashboard && NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={() => setActiveTab(link.id)}
                className={`px-3 py-2 text-sm font-bold transition-all uppercase tracking-wide rounded-lg ${
                  activeTab === link.id 
                    ? 'text-emerald-600 bg-emerald-50' 
                    : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50/50'
                }`}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={onDashboardToggle}
              className="bg-emerald-500 text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-emerald-600 transition-all transform hover:scale-105 ml-4 shadow-lg shadow-emerald-200"
            >
              {isDashboard ? 'Exit Portal' : 'Member Portal'}
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {isOpen && (
        <div className="md:hidden bg-emerald-700 border-t border-emerald-500 animate-in slide-in-from-top duration-300">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {!isDashboard && NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={`block w-full text-left px-3 py-2 text-base font-black rounded-md ${
                  activeTab === link.id ? 'text-white bg-emerald-800' : 'text-emerald-100 hover:text-white hover:bg-emerald-600'
                }`}
                onClick={() => {
                  setActiveTab(link.id);
                  setIsOpen(false);
                }}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={() => {
                onDashboardToggle();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-base font-black text-white bg-emerald-900 mt-2 rounded-md"
            >
              {isDashboard ? 'Exit Portal' : 'Member Portal'}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
