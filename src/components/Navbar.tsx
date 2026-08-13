import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, Home, Menu, X } from 'lucide-react';
import { NAV_LINKS } from '../data/mockData';
import { MediaAsset } from '../data/editorSchema';
import { getCopy, getMedia } from '../data/editorSchema';
import { EditableImage, EditableRegion, EditableText } from './VisualEditorContext';

export const Navbar = ({
  onDashboardToggle,
  isDashboard,
  isAdmin = false,
  activeTab,
  setActiveTab,
  copy,
  media,
}: {
  onDashboardToggle: () => void;
  isDashboard: boolean;
  isAdmin?: boolean;
  activeTab: string;
  setActiveTab: (id: string) => void;
  copy?: Record<string, string>;
  media?: Record<string, MediaAsset>;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const logo = getMedia(media, 'brand.logoSmall', { src: '/logo-small.png', alt: 'Code Rx Society' });

  const goHome = () => {
    setActiveTab('home');
    setIsOpen(false);
  };

  const goBack = () => {
    setIsOpen(false);
    if (window.history.length > 1) window.history.back();
    else goHome();
  };

  const navLabel = (id: string, fallback: string) => getCopy(copy, `nav.${id}`, fallback);
  const portalCopyKey = isAdmin ? 'nav.portal.signout' : isDashboard ? 'nav.portal.exit' : 'nav.portal.enter';
  const portalLabel = isAdmin ? 'Sign out' : isDashboard ? 'Exit Portal' : 'Member Portal';

  return (
    <EditableRegion as="nav" elementKey="nav.section" label="Navigation bar" className="brand-nav fixed inset-x-0 top-0 z-50 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <button
          type="button"
          onClick={goHome}
          className="group flex min-w-0 items-center gap-2.5 text-left"
          aria-label="Go to CODE Rx Society home"
        >
          <span className="relative h-11 w-11 shrink-0 sm:h-12 sm:w-12">
            <span className="absolute inset-1 rounded-full bg-lime-300/10 blur-lg transition-opacity group-hover:opacity-100" />
            <EditableImage elementKey="nav.logo" mediaKey="brand.logoSmall" label="Navigation logo" src={logo.src} alt={logo.alt} className="brand-logo-glow relative h-full w-full object-contain" />
          </span>
          <span className="header-wordmark flex flex-col">
            <span className="header-wordmark-title"><EditableText elementKey="nav.brand.before" copyKey="nav.brand.before" label="Navigation brand">{getCopy(copy, 'nav.brand.before', 'CODE')}</EditableText> <span><EditableText elementKey="nav.brand.accent" copyKey="nav.brand.accent" label="Navigation brand accent">{getCopy(copy, 'nav.brand.accent', 'Rx')}</EditableText></span></span>
            <span className="header-wordmark-subtitle"><EditableText elementKey="nav.brand.subtitle" copyKey="nav.brand.subtitle" label="Navigation subtitle">{getCopy(copy, 'nav.brand.subtitle', 'Society')}</EditableText></span>
          </span>
        </button>

        <div className="hidden items-center gap-0.5 lg:flex">
          {!isDashboard && <button type="button" onClick={goBack} className="mr-1 grid h-9 w-9 place-items-center rounded-lg text-[#244f31] transition hover:bg-[#0f2a17]/5" aria-label="Go back" title="Back"><ArrowLeft className="h-4 w-4" /></button>}
          {!isDashboard && NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={() => setActiveTab(link.id)}
              aria-current={activeTab === link.id ? 'page' : undefined}
              className={`brand-nav-link rounded-lg px-2.5 py-2.5 xl:px-3 ${activeTab === link.id ? 'is-active' : ''}`}
            >
              <EditableText elementKey={`nav.link.${link.id}`} copyKey={`nav.${link.id}`} label={`${link.label} navigation label`}>{navLabel(link.id, link.label)}</EditableText>
            </a>
          ))}
          <button
            type="button"
            onClick={onDashboardToggle}
            className="brand-button brand-button--small ml-3"
          >
            <EditableText elementKey="nav.portal" copyKey={portalCopyKey} label="Portal button label">{getCopy(copy, portalCopyKey, portalLabel)}</EditableText>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#06110a]/15 text-[#0f2a17] transition-colors hover:bg-[#0f2a17]/5 lg:hidden"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="brand-nav-dropdown px-5 pb-5 pt-3 shadow-2xl backdrop-blur-xl lg:hidden">
          <div className="mx-auto max-w-[1440px] space-y-1">
            {!isDashboard && <div className="grid grid-cols-2 gap-2 pb-2"><button type="button" onClick={goBack} className="flex items-center justify-center gap-2 rounded-xl border border-[#06110a]/10 px-4 py-3 text-xs font-black text-[#244f31] hover:bg-[#0f2a17]/5"><ArrowLeft className="h-4 w-4" />Back</button><button type="button" onClick={goHome} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800 hover:bg-emerald-100"><Home className="h-4 w-4" />Home</button></div>}
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
                <EditableText elementKey={`nav.mobile.${link.id}`} copyKey={`nav.${link.id}`} label={`${link.label} mobile navigation label`}>{navLabel(link.id, link.label)}</EditableText>
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
              <EditableText elementKey="nav.mobile.portal" copyKey={portalCopyKey} label="Mobile portal button label">{getCopy(copy, portalCopyKey, portalLabel)}</EditableText>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </EditableRegion>
  );
};
