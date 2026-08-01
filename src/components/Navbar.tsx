import { useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { NAV_LINKS } from '../data/mockData';

export const Navbar = ({
  onDashboardToggle,
  isDashboard,
  activeTab,
  setActiveTab
}: {
  onDashboardToggle: () => void;
  isDashboard: boolean;
  activeTab: string;
  setActiveTab: (id: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const goHome = () => {
    setActiveTab('home');
    setIsOpen(false);
  };

  return (
    <nav className="brand-nav fixed inset-x-0 top-0 z-50 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <button
          type="button"
          onClick={goHome}
          className="group flex min-w-0 items-center gap-2.5 text-left"
          aria-label="Go to CODE Rx Society home"
        >
          <span className="relative h-11 w-11 shrink-0 sm:h-12 sm:w-12">
            <span className="absolute inset-1 rounded-full bg-lime-300/10 blur-lg transition-opacity group-hover:opacity-100" />
            <img src="/logo.png" alt="" className="brand-logo-glow relative h-full w-full object-contain" />
          </span>
          <span className="hidden min-[420px]:flex flex-col">
            <span className="text-[0.92rem] font-black leading-none tracking-[0.12em] text-[#f2f8ed]">CODE <span className="text-[#b8ff3d]">Rx</span></span>
            <span className="mt-1 text-[0.52rem] font-black uppercase tracking-[0.34em] text-[#8da18e]">Society / Ghana</span>
          </span>
        </button>

        <div className="hidden items-center gap-0.5 lg:flex">
          {!isDashboard && NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={() => setActiveTab(link.id)}
              aria-current={activeTab === link.id ? 'page' : undefined}
              className={`brand-nav-link rounded-lg px-2.5 py-2.5 xl:px-3 ${activeTab === link.id ? 'is-active' : ''}`}
            >
              {link.label}
            </a>
          ))}
          <button
            type="button"
            onClick={onDashboardToggle}
            className="brand-button brand-button--small ml-3"
          >
            {isDashboard ? 'Exit Portal' : 'Member Portal'}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-lime-300/20 text-[#b8ff3d] transition-colors hover:bg-lime-300/10 lg:hidden"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-lime-300/15 bg-[#030a06]/98 px-5 pb-5 pt-3 shadow-2xl backdrop-blur-xl lg:hidden">
          <div className="mx-auto max-w-[1440px] space-y-1">
            {!isDashboard && NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={() => {
                  setActiveTab(link.id);
                  setIsOpen(false);
                }}
                className={`brand-nav-link block rounded-xl px-4 py-3.5 ${activeTab === link.id ? 'is-active' : ''}`}
              >
                {link.label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => {
                onDashboardToggle();
                setIsOpen(false);
              }}
              className="brand-button mt-3 w-full"
            >
              {isDashboard ? 'Exit Portal' : 'Member Portal'}
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
