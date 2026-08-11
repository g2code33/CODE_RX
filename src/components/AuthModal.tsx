import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, ArrowRight, Phone, Send, CheckCircle, ShieldAlert, AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { db, auth, ApiError, AuthUser } from '../lib/cloudflare';

type Mode = 'join' | 'login' | 'forgot';

export const AuthModal = ({ isOpen, onClose, onLoginSuccess, onGoToTerms, defaultMode = 'join' }: {
  isOpen: boolean,
  onClose: () => void,
  onLoginSuccess: (user: AuthUser) => void,
  onGoToTerms: () => void,
  defaultMode?: 'join' | 'login'
}) => {
  const [mode, setMode] = useState<Mode>(defaultMode === 'login' ? 'login' : 'join');
  const [isApplied, setIsApplied] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotResult, setForgotResult] = useState<{ message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Each time the modal opens, honour the mode requested by the caller.
  // Without this, a previously opened Join form could remain active when the
  // Member Portal asks for Login.
  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode === 'login' ? 'login' : 'join');
    setIsApplied(false);
    setError('');
    setForgotResult(null);
    setShowPassword(false);
    setFormData({ name: '', email: '', phone: '', password: '' });
  }, [isOpen, defaultMode]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setForgotResult(null);
    setFormData({ name: '', email: '', phone: '', password: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'forgot') {
        const res = await auth.forgotPassword(formData.email);
        setForgotResult({ message: res.message });
      } else if (mode === 'login') {
        const user = await auth.login(formData.email, formData.password);
        onLoginSuccess(user);
      } else {
        // Join: submit a pending membership application. It never creates an account.
        await db.applications.create({
          name: formData.name,
          email: formData.email,
          phone: formData.phone
        });
        try {
          await db.subscribers.create({
            email: formData.email,
            name: formData.name,
            phone: formData.phone
          });
        } catch {
          /* subscriber capture is best-effort */
        }
        setIsApplied(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isApplied) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-emerald-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-[2.5rem] p-12 text-center shadow-2xl">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter uppercase">Application Sent!</h2>
              <p className="text-slate-500 font-medium mb-8">Your pending JOIN CODE Rx request has been sent. PHANTOM will review it and contact you by email.</p>
              <button onClick={onClose} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-black transition-all">CLOSE</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-emerald-950/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="auth-dialog relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-white shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="auth-modal-content p-7 sm:p-8 md:p-10">
              <div className="auth-modal-header mb-5 text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 leading-none tracking-tighter">
                  {mode === 'join' ? 'Join the Society' : mode === 'forgot' ? 'Forgot Password?' : 'Welcome Back'}
                </h2>
                <p className="text-slate-500 mt-2 text-sm font-medium">
                  {mode === 'join'
                    ? 'Start your journey at the intersection of RX & Tech'
                    : mode === 'forgot'
                        ? 'Enter your email and we will send you a reset link'
                        : 'Enter your credentials to access the portal'}
                </p>
              </div>

              <form className="auth-modal-form space-y-3" onSubmit={handleSubmit}>
                {mode === 'join' && (
                  <>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="auth-modal-field w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        required
                        minLength={2}
                      />
                    </div>
                    {mode === 'join' && (
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="tel"
                          placeholder="Telephone Number"
                          required
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="auth-modal-field w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="auth-modal-field w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                    required
                  />
                </div>

                {mode === 'login' && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="auth-modal-field w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                      required
                      minLength={6}
                    />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                )}

                {mode === 'join' && (
                  <div className="flex items-start gap-2 px-1">
                    <input type="checkbox" id="terms" className="mt-1 accent-emerald-600" required />
                    <label htmlFor="terms" className="text-xs text-slate-500 leading-relaxed text-left">
                      I agree to the <button type="button" onClick={onGoToTerms} className="text-emerald-600 font-bold hover:underline">Terms & Conditions</button> and Privacy Policy of Code Rx Society.
                    </label>
                  </div>
                )}

                {mode === 'login' && (
                  <div className="flex justify-between items-center px-1">
                    <button
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, email: f.email || 'coderxsociety@gmail.com' }))}
                      className="text-xs font-bold text-slate-400 flex items-center gap-1 hover:text-emerald-600 transition-colors"
                      title="Sign in with your admin account"
                    >
                      <ShieldAlert className="w-4 h-4" /> Admin Access
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                {forgotResult && (
                  <div className="flex flex-col gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-medium">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{forgotResult.message}</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="auth-modal-submit w-full py-3 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-500 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <><LoaderCircle className="w-4 h-4 animate-spin" />{mode === 'login' ? 'Signing in securely...' : 'Please wait...'}</>
                  ) : (
                    <>
                      {mode === 'join' ? 'SEND APPLICATION' : mode === 'forgot' ? 'SEND RESET LINK' : 'SIGN IN'}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="auth-modal-connect mt-5 text-center">
                <p className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Connect with us</p>
                <a
                  href="https://t.me/+EdRpfR1GTGNjM2Q0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all text-sm font-bold shadow-md shadow-blue-100"
                >
                  <Send className="w-5 h-5" /> JOIN TELEGRAM
                </a>
              </div>

              <p className="auth-modal-footer text-center mt-5 text-sm font-medium text-slate-500">
                {mode === 'login' ? (
                  <>
                    New here?{' '}
                    <button onClick={() => switchMode('join')} className="text-emerald-600 font-black hover:underline">
                      Apply to JOIN CODE Rx
                    </button>
                  </>
                ) : mode === 'forgot' ? (
                  <>
                    Remembered it?{' '}
                    <button onClick={() => switchMode('login')} className="text-emerald-600 font-black hover:underline">
                      Sign In
                    </button>
                  </>
                ) : (
                  <>
                    {mode === 'join' ? 'Already have an account?' : 'Already have an account?'}{' '}
                    <button onClick={() => switchMode('login')} className="text-emerald-600 font-black hover:underline">
                      Sign In
                    </button>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
