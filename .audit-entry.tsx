import { renderToStaticMarkup } from 'react-dom/server';
import { SiteFlow } from './src/components/SiteFlow';
import { INITIAL_SITE_CONTENT } from './src/data/siteState';
import { ContactForm } from './src/components/ContactForm';
import { Dashboard } from './src/components/Dashboard';
import { ClientAccessScreen } from './src/components/ClientAccessScreen';
import { ClientSupportContact } from './src/components/ClientSupportContact';

const render = (element: any) => renderToStaticMarkup(element);

export const pages = () => ({
  home: render(<SiteFlow siteContent={INITIAL_SITE_CONTENT} activeTab="home" onJoin={() => undefined} includeFooter includeJoinCta />),
  contact: render(<ContactForm isOpen onClose={() => undefined} />),
  dashboard: render(<Dashboard user={{ id: 1, displayName: 'Ada', email: 'a@b.test', codename: 'Calcitonin' } as any} />),
  clientAccess: render(<ClientAccessScreen onSubmit={async () => undefined} />),
  clientSupport: render(<ClientSupportContact contact={{ email: 'coderxsociety@gmail.com', telegram: 'https://t.me/x' }} links={undefined} />),
});

export const renderOne = () => {
  const out: Record<string, string> = {};
  const attempt = (name: string, element: any) => {
    try { out[name] = render(element); } catch (error: any) { out[name] = ''; console.log(`  [${name}] render failed: ${error.message}`); }
  };
  attempt('home', <SiteFlow siteContent={INITIAL_SITE_CONTENT} activeTab="home" onJoin={() => undefined} includeFooter includeJoinCta />);
  attempt('contact', <ContactForm isOpen onClose={() => undefined} />);
  attempt('clientAccess', <ClientAccessScreen onSubmit={async () => undefined} />);
  attempt('clientSupport', <ClientSupportContact contact={{ email: 'coderxsociety@gmail.com', telegram: 'https://t.me/x' }} links={undefined} />);
  return out;
};
