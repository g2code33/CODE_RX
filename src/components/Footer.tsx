import { ArrowUpRight, Check, Globe, Mail, Phone, Send, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { db } from '../lib/cloudflare';

export const Footer = () => {
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribeStatus('submitting');
    try {
      await db.subscribers.create({ email: subscribeEmail });
      setSubscribeStatus('success');
      setSubscribeEmail('');
      window.setTimeout(() => setSubscribeStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to subscribe:', error);
      setSubscribeStatus('idle');
      alert('Failed to subscribe. Please try again.');
    }
  };

  return (
    <>
      <footer className="brand-section brand-grid border-t border-[#b8ff3d]/15 pt-20 sm:pt-28">
        <div className="brand-scanlines absolute inset-0" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-8 sm:px-8 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1fr]">
            <div>
              <a href="#home" className="inline-flex items-center gap-3 no-underline">
                <img src="/logo.png" alt="Code Rx Society" className="brand-logo-glow h-14 w-14 object-contain" />
                <span><span className="block text-lg font-black tracking-[0.12em] text-[#f2f8ed]">CODE <span className="text-[#b8ff3d]">Rx</span></span><span className="mt-1 block text-[0.55rem] font-black uppercase tracking-[0.28em] text-[#8da18e]">Society / Ghana</span></span>
              </a>
              <p className="mt-7 max-w-sm text-sm leading-7 text-[#8da18e]">Equipping pharmacists with the technological skills to innovate, build, and lead in the digital healthcare era.</p>
              <div className="mt-7 flex items-center gap-4"><a href="https://t.me/+EdRpfR1GTGNjM2Q0" target="_blank" rel="noopener noreferrer" aria-label="Join Telegram" className="grid h-10 w-10 place-items-center rounded-lg border border-[#b8ff3d]/20 text-[#b8ff3d] transition-colors hover:bg-[#b8ff3d]/10"><Send className="h-4 w-4" /></a><a href="#community" aria-label="Community" className="grid h-10 w-10 place-items-center rounded-lg border border-[#b8ff3d]/20 text-[#b8ff3d] transition-colors hover:bg-[#b8ff3d]/10"><Globe className="h-4 w-4" /></a><button type="button" onClick={() => setIsContactOpen(true)} aria-label="Contact us" className="grid h-10 w-10 place-items-center rounded-lg border border-[#b8ff3d]/20 text-[#b8ff3d] transition-colors hover:bg-[#b8ff3d]/10"><Mail className="h-4 w-4" /></button></div>
              <div className="mt-8 max-w-sm border-t border-[#b8ff3d]/15 pt-6"><p className="brand-number">SIGNAL / NEWSLETTER</p><p className="mt-2 text-xs text-[#8da18e]">Updates in pharmacy tech, projects, and community events.</p><form className="mt-4 flex gap-2" onSubmit={handleSubscribe}><input type="email" required placeholder="Your email" value={subscribeEmail} onChange={(event) => setSubscribeEmail(event.target.value)} className="brand-input px-3 py-2.5 text-xs" /><button type="submit" disabled={subscribeStatus === 'submitting'} className="brand-button brand-button--small shrink-0 disabled:opacity-50">{subscribeStatus === 'submitting' ? '...' : subscribeStatus === 'success' ? <Check className="h-4 w-4" /> : 'Join'}</button></form></div>
            </div>

            <div><p className="brand-number mb-6">EXPLORE</p><ul className="space-y-3 text-sm text-[#8da18e]"><li><a href="#about" className="transition-colors hover:text-[#b8ff3d]">About us</a></li><li><a href="#learn" className="transition-colors hover:text-[#b8ff3d]">Academy</a></li><li><a href="#projects" className="transition-colors hover:text-[#b8ff3d]">Project lab</a></li><li><a href="#challenges" className="transition-colors hover:text-[#b8ff3d]">Challenges</a></li><li><a href="#community" className="transition-colors hover:text-[#b8ff3d]">Community</a></li></ul></div>
            <div><p className="brand-number mb-6">RESOURCES</p><ul className="space-y-3 text-sm text-[#8da18e]"><li><a href="#resources" className="transition-colors hover:text-[#b8ff3d]">Documentation</a></li><li><a href="#resources" className="transition-colors hover:text-[#b8ff3d]">Research papers</a></li><li><a href="#resources" className="transition-colors hover:text-[#b8ff3d]">Open source</a></li><li><a href="#terms" className="transition-colors hover:text-[#b8ff3d]">Terms & conditions</a></li></ul></div>
            <div><p className="brand-number mb-6">CONTACT</p><div className="space-y-4 text-sm text-[#8da18e]"><a href="mailto:coderxsociety@gmail.com" className="flex items-center gap-3 transition-colors hover:text-[#b8ff3d]"><Mail className="h-4 w-4 text-[#b8ff3d]" /> coderxsociety@gmail.com</a><div className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#b8ff3d]" /> 053 734 5524</div><div className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#b8ff3d]" /> 050 773 0598</div><div className="flex items-center gap-3"><Globe className="h-4 w-4 text-[#b8ff3d]" /> Ghana</div></div><a href="https://t.me/+EdRpfR1GTGNjM2Q0" target="_blank" rel="noopener noreferrer" className="brand-button brand-button--ghost mt-7 w-full">Join Telegram <ArrowUpRight className="h-4 w-4" /></a></div>
          </div>

          <div className="mt-16 flex flex-col justify-between gap-4 border-t border-[#b8ff3d]/15 pt-6 text-[0.58rem] font-black uppercase tracking-[0.16em] text-[#718675] sm:flex-row"><p>© 2026 Code Rx Society / Ghana</p><div className="flex flex-wrap gap-5"><button type="button" onClick={() => setIsPrivacyOpen(true)} className="transition-colors hover:text-[#b8ff3d]">Privacy</button><button type="button" onClick={() => setIsCodeOpen(true)} className="transition-colors hover:text-[#b8ff3d]">Code of conduct</button><a href="#terms" className="transition-colors hover:text-[#b8ff3d]">Terms</a></div></div>
        </div>
      </footer>

      {isContactOpen && <Modal title="Contact Code Rx" onClose={() => setIsContactOpen(false)}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); alert('Message sent! We will get back to you soon.'); setIsContactOpen(false); }}><Field label="Name"><input required className="brand-input mt-2 px-4 py-3 text-sm" /></Field><Field label="Email"><input required type="email" className="brand-input mt-2 px-4 py-3 text-sm" /></Field><Field label="Message"><textarea required rows={4} className="brand-input mt-2 resize-none px-4 py-3 text-sm" /></Field><button type="submit" className="brand-button w-full">Send message <ArrowUpRight className="h-4 w-4" /></button></form></Modal>}
      {isPrivacyOpen && <Modal title="Privacy policy" onClose={() => setIsPrivacyOpen(false)}><PolicyContent><p>We collect information you provide directly to process membership applications, communicate updates, and respond to enquiries.</p><p>We seek to handle personal information responsibly and in accordance with applicable Ghanaian data-protection requirements.</p><p>For data-related requests, contact <a className="text-[#b8ff3d]" href="mailto:coderxsociety@gmail.com">coderxsociety@gmail.com</a>.</p></PolicyContent></Modal>}
      {isCodeOpen && <Modal title="Code of conduct" onClose={() => setIsCodeOpen(false)}><PolicyContent><p>Code Rx is a respectful, inclusive, and professional community focused on advancing pharmacy through technology.</p><ul className="list-disc space-y-2 pl-5"><li>Be respectful and inclusive.</li><li>Share feedback constructively.</li><li>Respect privacy and intellectual property.</li><li>Do not harass, discriminate, or publish private information.</li></ul><p>Reports can be sent to <a className="text-[#b8ff3d]" href="mailto:coderxsociety@gmail.com">coderxsociety@gmail.com</a>.</p></PolicyContent></Modal>}
    </>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-[0.62rem] font-black uppercase tracking-[0.16em] text-[#8da18e]">{label}{children}</label>;
const PolicyContent = ({ children }: { children: React.ReactNode }) => <div className="space-y-5 text-sm leading-7 text-[#8da18e]">{children}</div>;
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}><div className="brand-card max-h-[90vh] w-full max-w-xl overflow-y-auto p-7 sm:p-9" onClick={(event) => event.stopPropagation()}><div className="mb-7 flex items-start justify-between gap-4"><h2 className="text-2xl font-black text-[#f2f8ed]">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="text-[#8da18e] transition-colors hover:text-[#b8ff3d]"><X className="h-5 w-5" /></button></div>{children}</div></div>;
