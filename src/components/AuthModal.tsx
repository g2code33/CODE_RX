import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, ArrowRight, Phone, Send, CheckCircle, ShieldAlert } from 'lucide-react';
import { db } from '../lib/cloudflare';

export const AuthModal = ({ isOpen, onClose, onLoginSuccess, onAdminLogin, onGoToTerms, defaultMode = 'join' }: { 
  isOpen: boolean, 
  onClose: () => void,
  onLoginSuccess: () => void,
  onAdminLogin: () => void,
  onGoToTerms: () => void,
  defaultMode?: 'join' | 'login'
}) => {
  const [isLogin, setIsLogin] = useState(defaultMode === 'login');
  const [isApplied, setIsApplied] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    if (isLogin) {
      // Check for admin login
      if (formData.email === 'admin@coderx.org' || formData.email === 'coderxsociety@gmail.com') {
        onAdminLogin();
      } else {
        onLoginSuccess();
      }
      setIsSubmitting(false);
    } else {
      try {
        // Save to Cloudflare D1 database
        await db.applications.create({
          name: formData.name,
          email: formData.email,
          phone: formData.phone
        });
        
        // Also add to subscribers
        await db.subscribers.create({
          email: formData.email,
          name: formData.name,
          phone: formData.phone
        });
        
        setIsApplied(true);
      } catch (error) {
        console.error('Failed to submit application:', error);
        alert('Failed to submit application. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (isApplied) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-emerald-950/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-[2.5rem] p-12 text-center shadow-2xl">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter uppercase">Application Sent!</h2>
              <p className="text-slate-500 font-medium mb-8">The Admin team will review your info and get back to you via email shortly.</p>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-8 md:p-12">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 leading-none tracking-tighter">
                  {isLogin ? 'Welcome Back' : 'Join the Society'}
                </h2>
                <p className="text-slate-500 mt-2 text-sm font-medium">
                  {isLogin ? 'Enter your credentials to access the portal' : 'Start your journey at the intersection of RX & Tech'}
                </p>
              </div>

              <form 
                className="space-y-4" 
                onSubmit={handleSubmit}
              >
                {!isLogin && (
                  <>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="tel" 
                        placeholder="Telephone Number"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        required
                      />
                    </div>
                  </>
                )}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="email" 
                    placeholder="Email Address"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                    required
                  />
                </div>
                {isLogin && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="password" 
                      placeholder="Password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                      required
                    />
                  </div>
                )}

                {!isLogin && (
                  <div className="flex items-start gap-2 px-1">
                    <input type="checkbox" id="terms" className="mt-1 accent-emerald-600" required />
                    <label htmlFor="terms" className="text-xs text-slate-500 leading-relaxed text-left">
                      I agree to the <button type="button" onClick={onGoToTerms} className="text-emerald-600 font-bold hover:underline">Terms & Conditions</button> and Privacy Policy of Code Rx Society.
                    </label>
                  </div>
                )}

                {isLogin && (
                  <div className="flex justify-between items-center px-1">
                    <button type="button" onClick={onAdminLogin} className="text-xs font-bold text-slate-400 flex items-center gap-1 hover:text-emerald-600 transition-colors">
                      <ShieldAlert className="w-4 h-4" /> Admin Access
                    </button>
                    <button type="button" className="text-xs font-bold text-emerald-600 hover:underline">Forgot Password?</button>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-500 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    'Submitting...'
                  ) : (
                    <>
                      {isLogin ? 'SIGN IN' : 'SEND APPLICATION'}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 text-center">
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

              <p className="text-center mt-8 text-sm font-medium text-slate-500">
                {isLogin ? "Not a member yet?" : "Already have an account?"}{' '}
                <button 
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setFormData({ name: '', email: '', phone: '', password: '' });
                  }}
                  className="text-emerald-600 font-black hover:underline"
                >
                  {isLogin ? 'Join Code Rx' : 'Sign In'}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
