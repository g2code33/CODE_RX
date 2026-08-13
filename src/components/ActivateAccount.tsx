import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';
import { auth, AuthUser } from '../lib/cloudflare';

const activationParams = () => {
  const hash = window.location.hash;
  if (!hash.startsWith('#activate')) return null;
  const params = new URLSearchParams(hash.replace(/^#activate\??/, ''));
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  return token && email ? { token, email: decodeURIComponent(email) } : null;
};

const PasswordField = ({ value, onChange, placeholder, visible, onToggle, label }: { value: string; onChange: (value: string) => void; placeholder: string; visible: boolean; onToggle: () => void; label: string }) => <label className="block"><span className="sr-only">{label}</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required minLength={8} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-20 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" /><button type="button" onClick={onToggle} aria-label={visible ? `Hide ${label}` : `Show ${label}`} className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">{visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{visible ? 'Hide' : 'Show'}</button></span></label>;

export const ActivateAccount = ({ onDone, onActivated }: { onDone: () => void; onActivated: (user: AuthUser) => void }) => {
  const params = activationParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!params) return <div className="min-h-screen bg-slate-50 px-4 pt-28"><div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-xl shadow-emerald-950/5"><AlertCircle className="mx-auto h-10 w-10 text-red-500" /><h1 className="mt-5 text-2xl font-black text-slate-800">Invalid activation link</h1><p className="mt-3 text-sm leading-6 text-slate-500">Ask PHANTOM to issue a new member activation link.</p><button onClick={onDone} className="mt-7 w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100">Back to home</button></div></div>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) { setMessage({ type: 'error', text: 'Use at least 8 characters for your new password.' }); return; }
    if (password !== confirmPassword) { setMessage({ type: 'error', text: 'Passwords do not match.' }); return; }
    setSubmitting(true);
    try {
      const user = await auth.activate(params.email, params.token, password);
      setMessage({ type: 'success', text: 'Account activated. Your Code Rx identity is ready to choose.' });
      window.location.hash = '';
      window.setTimeout(() => onActivated(user), 650);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Activation failed. Ask PHANTOM for a new activation link.' });
    } finally { setSubmitting(false); }
  };

  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-slate-50 px-4 pt-24 sm:pt-32"><motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-7 shadow-xl shadow-emerald-950/5 sm:p-10"><div className="flex items-start justify-between"><div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><KeyRound className="h-6 w-6" /></div><p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Code Rx membership approved</p><h1 className="mt-2 text-2xl font-black text-slate-800">Create your private password</h1><p className="mt-2 text-sm leading-6 text-slate-500">PHANTOM approved your invitation. Only you choose and know this password; PHANTOM cannot view it.</p></div><button onClick={onDone} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Close activation"><X className="h-5 w-5" /></button></div><p className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{params.email}</p><div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800"><strong className="block text-[10px] uppercase tracking-widest">Next steps</strong><span className="mt-1 block">1. Create your password. 2. Activate your membership. 3. Complete your protected Code Name path.</span></div>{message && <div className={`mt-4 flex gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-600'}`}>{message.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{message.text}</span></div>}<form onSubmit={submit} className="mt-6 space-y-3"><PasswordField label="new password" value={password} onChange={setPassword} placeholder="New password — at least 8 characters" visible={showPassword} onToggle={() => setShowPassword((value) => !value)} /><PasswordField label="confirmed password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} /><button disabled={submitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3.5 text-sm font-black text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-60">{submitting ? 'Activating account…' : 'Activate membership'}</button></form></motion.div></motion.div>;
};
