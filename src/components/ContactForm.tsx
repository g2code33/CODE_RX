import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  CheckCircle2,
  Handshake,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
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

/** Public contact channel routed to PHANTOM through the existing D1 + EmailJS API. */
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="phantom-contact-title">
          <motion.button
            type="button"
            aria-label="Close Contact PHANTOM form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-md"
          />

          <motion.section
            initial={{ opacity: 0, scale: 0.97, y: 22 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: 'spring', duration: 0.42, bounce: 0.16 }}
            className="relative grid max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-[0_28px_100px_rgba(2,44,34,0.45)] lg:grid-cols-[0.86fr_1.14fr]"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close Contact PHANTOM form"
              className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 lg:right-5 lg:top-5"
            >
              <X className="h-5 w-5" />
            </button>

            <aside className="relative overflow-hidden bg-[#063b2a] px-7 py-9 text-white sm:px-10 sm:py-12">
              <div className="absolute -left-24 -top-16 h-56 w-56 rounded-full bg-[#b8ff3d]/15 blur-3xl" />
              <div className="absolute -bottom-20 right-[-4rem] h-72 w-72 rounded-full border border-[#b8ff3d]/20" />
              <div className="relative z-10 flex h-full flex-col">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b8ff3d]/25 bg-[#b8ff3d]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#d9ff9c]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Direct PHANTOM channel
                </div>

                <div className="mt-8">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b8ff3d]">Code Rx Society</p>
                  <h2 id="phantom-contact-title" className="mt-3 max-w-sm text-4xl font-black leading-[0.94] tracking-[-0.06em] text-white sm:text-5xl">
                    Talk to <span className="text-[#b8ff3d]">PHANTOM.</span>
                  </h2>
                  <p className="mt-5 max-w-sm text-sm leading-7 text-emerald-50/80">
                    Questions about joining, partnerships, research or a project? Send a clear message and the Code Rx leadership team will route it to the right next step.
                  </p>
                </div>

                <div className="mt-9 space-y-3 border-t border-white/10 pt-7 text-sm text-emerald-50/80">
                  <div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[#b8ff3d]">01</span><p><strong className="text-white">Choose a topic</strong><br />Give PHANTOM the right context from the start.</p></div>
                  <div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[#b8ff3d]">02</span><p><strong className="text-white">Receive a response</strong><br />Replies normally arrive within 24–48 hours.</p></div>
                </div>

                <a href={`mailto:${supportEmail}`} className="mt-auto inline-flex items-center gap-2 pt-10 text-sm font-bold text-[#d9ff9c] transition hover:text-white">
                  <Mail className="h-4 w-4" />
                  Prefer email? {supportEmail}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </aside>

            <div className="p-7 sm:p-10 lg:p-12">
              {status === 'sent' ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="grid h-20 w-20 place-items-center rounded-[1.6rem] bg-emerald-50 text-emerald-600 shadow-[0_12px_30px_rgba(5,150,105,0.14)]">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <p className="mt-8 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Message received</p>
                  <h3 className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-900 sm:text-4xl">Your message is in.</h3>
                  <p className="mt-4 max-w-md text-sm leading-7 text-slate-500">
                    We will reply to <strong className="text-slate-700">{formData.email}</strong>. Thank you for reaching out to Code Rx Society.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={startAnotherMessage} className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-emerald-700 transition hover:bg-emerald-100">Send another message</button>
                    <button type="button" onClick={close} className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-slate-700">Close</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Contact PHANTOM</p>
                  <h3 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">How can we help?</h3>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">Choose a starting point, then tell us what you need. Your email is used only to reply to this message.</p>

                  <div className="mt-7 grid gap-2 sm:grid-cols-3">
                    {TOPICS.map((topic) => {
                      const Icon = topic.icon;
                      const selected = formData.subject === topic.subject;
                      return (
                        <button
                          key={topic.label}
                          type="button"
                          onClick={() => chooseTopic(topic)}
                          aria-pressed={selected}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50'}`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-emerald-600' : 'text-slate-400'}`} />
                          {topic.label}
                        </button>
                      );
                    })}
                  </div>

                  <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Your name</span>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            autoComplete="name"
                            placeholder="Your full name"
                            value={formData.name}
                            onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                            required
                          />
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Reply email</span>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                            required
                          />
                        </div>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Subject</span>
                      <input
                        type="text"
                        placeholder="What would you like to discuss?"
                        value={formData.subject}
                        onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Your message</span>
                      <textarea
                        placeholder="Share the details PHANTOM should know…"
                        rows={5}
                        value={formData.message}
                        onChange={(event) => setFormData((current) => ({ ...current, message: event.target.value }))}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                        required
                      />
                    </label>

                    {status === 'error' && (
                      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                        We could not send your message just now. Please check your connection and try again.
                      </p>
                    )}

                    <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-slate-400">By sending, you agree that Code Rx may use your email only to respond to this enquiry.</p>
                      <button
                        type="submit"
                        disabled={status === 'sending'}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_24px_rgba(5,150,105,0.22)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {status === 'sending' ? 'Sending…' : 'Send to PHANTOM'}
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
};
