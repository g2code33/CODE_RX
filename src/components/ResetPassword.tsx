import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, CheckCircle, X, Eye, EyeOff } from 'lucide-react';
import { auth } from '../lib/cloudflare';

// Reads ?token=...&email=... from the URL hash (e.g. /#reset?token=abc&email=x)
function parseResetParams(): { token: string; email: string } | null {
  const hash = window.location.hash; // "#reset?token=abc&email=x@y.z"
  if (!hash.startsWith('#reset')) return null;
  const query = hash.replace(/^#reset\??/, '');
  const params = new URLSearchParams(query);
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  if (!token || !email) return null;
  return { token, email: decodeURIComponent(email) };
}

export const ResetPassword = ({ onDone }: { onDone: () => void }) => {
  const params = parseResetParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!params) {
    return (
      <div className="min-h-screen bg-slate-50 pt-28 flex items-start justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Invalid reset link</h2>
          <p className="text-slate-500 text-sm font-medium mb-6">This link is missing information. Please request a new password reset.</p>
          <button onClick={onDone} className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await auth.resetPassword(params.email, params.token, password);
      setMessage({ type: 'success', text: 'Password reset successfully! You can now sign in.' });
      setPassword('');
      setConfirm('');
      // Clear the hash so the link can't be reused accidentally
      window.location.hash = '';
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to reset password.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-slate-50 pt-28 flex items-start justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full"
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Set a new password</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">For <span className="font-bold text-emerald-600">{params.email}</span></p>
          </div>
          <button onClick={onDone} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-2xl text-sm font-bold mb-4 flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-600 border border-red-100'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              placeholder="New password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
            />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showConfirm ? "text" : "password"}
              required
              minLength={6}
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
            />
            <button type="button" onClick={() => setShowConfirm((visible) => !visible)} aria-label={showConfirm ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">{showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Resetting...' : 'Reset Password'}
          </button>
          <button type="button" onClick={onDone} className="w-full py-2 text-sm font-bold text-slate-400 hover:text-emerald-600 transition-colors">
            Back to Home
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};
