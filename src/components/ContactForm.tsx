import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Handshake,
  Mail,
  MessageCircle,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { db } from '../lib/cloudflare';

type ContactFormProps = {
  isOpen: boolean;
  onClose: () => void;
  supportEmail?: string;
};

type ContactTopic = {
  label: string;
  subject: string;
  icon: typeof Sparkles;
};

const TOPICS: ContactTopic[] = [
  { label: 'JOIN Code Rx', subject: 'Question about joining Code Rx', icon: Sparkles },
  { label: 'Project or research', subject: 'Project or research enquiry', icon: MessageCircle },
  { label: 'Partnership', subject: 'Partnership opportunity', icon: Handshake },
];

const emptyForm = () => ({ name: '', email: '', subject: '', message: '' });

/** "Talk to PHANTOM" — the public channel routed to PHANTOM through the existing D1 + EmailJS API. */
export const ContactForm = ({ isOpen, onClose, supportEmail = 'coderxsociety@gmail.com' }: ContactFormProps) => {
  const [formData, setFormData] = useState(emptyForm);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const close = () => {
    setStatus('idle');
    onClose();
  };

  const chooseTopic = (topic: ContactTopic) => {
    setFormData((current) => ({ ...current, subject: topic.subject }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');

    try {
      await db.contacts.create(formData);
      setStatus('sent');
    } catch (error) {
      console.error('Failed to send message:', error);
      setStatus('error');
    }
  };

  const startAnotherMessage = () => {
    setFormData(emptyForm());
    setStatus('idle');
  };

  const fieldLabel = 'mb-1.5 block text-[12px] font-black uppercase tracking-[0.12em] text-[#334155]';
  const fieldBox = 'w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-[15px] font-medium text-[#0f172a] outline-none transition placeholder:text-[#64748b] focus:border-[#15803d] focus:ring-4 focus:ring-[#16a34a]/15';

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#04120b]/75 p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="phantom-contact-title"
        >
          <motion.button
            type="button"
            aria-label="Close Talk to PHANTOM"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 cursor-default"
          />

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.12 }}
            className="relative my-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-[0_28px_90px_rgba(2,20,12,0.45)]"
          >
            {/* Header: deep green, high-contrast text, no decoration over the words. */}
            <header className="relative bg-[#063b2a] px-6 py-5 sm:px-8 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#b8ff3d]">Code Rx Society</p>
                  <h2 id="phantom-contact-title" className="mt-2 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                    Talk to <span className="text-[#b8ff3d]">PHANTOM.</span>
                  </h2>
                  <p className="mt-2 max-w-xl text-[13px] font-medium leading-6 text-[#dcefe2] sm:text-sm">
                    Joining, research, partnerships or a project — send one clear message and the Code Rx leadership team
                    routes it to the right next step. Replies normally arrive within 24–48 hours.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close Talk to PHANTOM"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#b8ff3d]/40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="px-6 py-6 sm:px-8 sm:py-7">
              {status === 'sent' ? (
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#ecfdf5] text-[#15803d]">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <p className="mt-6 text-[11px] font-black uppercase tracking-[0.18em] text-[#15803d]">Message received</p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f172a] sm:text-3xl">Your message is in.</h3>
                  <p className="mt-3 max-w-md text-sm leading-7 text-[#475569]">
                    We will reply to <strong className="text-[#0f172a]">{formData.email}</strong>. Thank you for reaching out to Code Rx Society.
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={startAnotherMessage} className="rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#15803d] transition hover:bg-[#d1fae5]">
                      Send another message
                    </button>
                    <button type="button" onClick={close} className="rounded-xl bg-[#0f172a] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#1e293b]">
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[12px] font-black uppercase tracking-[0.14em] text-[#15803d]">Talk to PHANTOM</p>
                  <h3 className="mt-1.5 text-2xl font-black tracking-[-0.03em] text-[#0f172a]">How can we help?</h3>
                  <p className="mt-2 text-sm leading-6 text-[#475569]">
                    Choose a starting point, then tell us what you need. Your email is used only to reply to this message.
                  </p>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {TOPICS.map((topic) => {
                      const Icon = topic.icon;
                      const selected = formData.subject === topic.subject;
                      return (
                        <button
                          key={topic.label}
                          type="button"
                          onClick={() => chooseTopic(topic)}
                          aria-pressed={selected}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-[12px] font-black uppercase tracking-[0.06em] transition ${
                            selected
                              ? 'border-[#15803d] bg-[#ecfdf5] text-[#14532d]'
                              : 'border-[#cbd5e1] bg-white text-[#334155] hover:border-[#15803d] hover:bg-[#f0fdf4]'
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-[#15803d]' : 'text-[#64748b]'}`} />
                          {topic.label}
                        </button>
                      );
                    })}
                  </div>

                  <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className={fieldLabel}>Your name</span>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
                          <input
                            type="text"
                            autoComplete="name"
                            placeholder="Your full name"
                            value={formData.name}
                            onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                            className={`${fieldBox} pl-11`}
                            required
                          />
                        </div>
                      </label>
                      <label className="block">
                        <span className={fieldLabel}>Reply email</span>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
                          <input
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                            className={`${fieldBox} pl-11`}
                            required
                          />
                        </div>
                      </label>
                    </div>

                    <label className="block">
                      <span className={fieldLabel}>Subject</span>
                      <input
                        type="text"
                        placeholder="What would you like to discuss?"
                        value={formData.subject}
                        onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))}
                        className={fieldBox}
                        required
                      />
                    </label>

                    <label className="block">
                      <span className={fieldLabel}>Your message</span>
                      <textarea
                        placeholder="Share the details PHANTOM should know…"
                        rows={5}
                        value={formData.message}
                        onChange={(event) => setFormData((current) => ({ ...current, message: event.target.value }))}
                        className={`${fieldBox} resize-y leading-6`}
                        required
                      />
                    </label>

                    {status === 'error' && (
                      <p role="alert" className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">
                        We could not send your message just now. Please check your connection and try again.
                      </p>
                    )}

                    <div className="flex flex-col gap-3 border-t border-[#e2e8f0] pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-[#475569]">
                        By sending, you agree that Code Rx may use your email only to respond to this enquiry.
                      </p>
                      <button
                        type="submit"
                        disabled={status === 'sending'}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#15803d] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#14652f] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#16a34a]/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {status === 'sending' ? 'Sending…' : 'Send to PHANTOM'}
                        <Send className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-center text-xs font-semibold text-[#475569] sm:text-left">
                      Prefer email?{' '}
                      <a href={`mailto:${supportEmail}`} className="font-black text-[#15803d] underline-offset-2 hover:underline">
                        {supportEmail}
                      </a>
                    </p>
                  </form>
                </>
              )}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );

  // Rendered at the end of the document so no page animation, blur or overflow
  // rule on an ancestor can clip it, fade it or trap its stacking order.
  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);

};
