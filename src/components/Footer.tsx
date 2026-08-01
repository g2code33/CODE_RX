import { Globe, Send, Mail, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { db } from '../lib/cloudflare';

export const Footer = () => {
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribeStatus('submitting');
    
    try {
      await db.subscribers.create({
        email: subscribeEmail
      });
      setSubscribeStatus('success');
      setSubscribeEmail('');
      setTimeout(() => setSubscribeStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to subscribe:', error);
      setSubscribeStatus('idle');
      alert('Failed to subscribe. Please try again.');
    }
  };

  return (
    <>
      <footer className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 shrink-0">
                  <img src="/logo.png" alt="Code Rx Logo" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-black text-lg leading-none tracking-tight text-white">CODE Rx</span>
                  <span className="text-[8px] tracking-[0.25em] font-black text-emerald-300 uppercase">Society</span>
                </div>
              </div>
              <p className="text-emerald-100 text-sm leading-relaxed">
                Equipping pharmacists with the technological skills to innovate and lead in the digital healthcare era.
              </p>
              <div className="flex gap-4">
                <a href="https://t.me/+EdRpfR1GTGNjM2Q0" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform">
                  <Send className="w-5 h-5 text-emerald-200 hover:text-white cursor-pointer transition-colors" />
                </a>
                <a href="#" className="hover:scale-110 transition-transform">
                  <Globe className="w-5 h-5 text-emerald-200 hover:text-white cursor-pointer transition-colors" />
                </a>
                <button onClick={() => setIsContactOpen(true)} className="hover:scale-110 transition-transform">
                  <Mail className="w-5 h-5 text-emerald-200 hover:text-white cursor-pointer transition-colors" />
                </button>
              </div>

              {/* Newsletter Subscription */}
              <div className="pt-6 border-t border-emerald-700/50">
                <h4 className="font-bold text-sm mb-3">Subscribe to Newsletter</h4>
                <p className="text-xs text-emerald-200 mb-3">Get latest updates in pharmacy tech</p>
                <form className="flex gap-2" onSubmit={handleSubscribe}>
                  <input 
                    type="email" 
                    placeholder="Your email" 
                    value={subscribeEmail}
                    onChange={(e) => setSubscribeEmail(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs w-full focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    required
                  />
                  <button 
                    type="submit" 
                    disabled={subscribeStatus === 'submitting'}
                    className="bg-emerald-500 text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-emerald-400 transition-all disabled:opacity-50"
                  >
                    {subscribeStatus === 'submitting' ? '...' : subscribeStatus === 'success' ? '✓' : 'Join'}
                  </button>
                </form>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-6 text-lg">Quick Links</h4>
              <ul className="space-y-3 text-emerald-200 text-sm">
                <li><a href="#about" className="hover:text-white cursor-pointer transition-colors">About Us</a></li>
                <li><a href="#learn" className="hover:text-white cursor-pointer transition-colors">Academy</a></li>
                <li><a href="#projects" className="hover:text-white cursor-pointer transition-colors">Projects</a></li>
                <li><a href="#challenges" className="hover:text-white cursor-pointer transition-colors">Decoder Challenge</a></li>
                <li><a href="#community" className="hover:text-white cursor-pointer transition-colors">Community</a></li>
                <li><a href="#resources" className="hover:text-white cursor-pointer transition-colors">Resources</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-6 text-lg">Resources</h4>
              <ul className="space-y-3 text-emerald-200 text-sm">
                <li><a href="#" className="hover:text-white cursor-pointer transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white cursor-pointer transition-colors">Research Papers</a></li>
                <li><a href="#" className="hover:text-white cursor-pointer transition-colors">Open Source</a></li>
                <li><a href="#" className="hover:text-white cursor-pointer transition-colors">Community Forum</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-6 text-lg">Contact Us</h4>
              <div className="space-y-3 text-sm text-emerald-200">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <a href="mailto:coderxsociety@gmail.com" className="hover:text-white transition-colors">coderxsociety@gmail.com</a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>053 734 5524</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>050 773 0598</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  <span>Ghana</span>
                </div>
              </div>
              <a 
                href="https://t.me/+EdRpfR1GTGNjM2Q0" 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-6 w-full bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all block text-center"
              >
                Join Telegram Group
              </a>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold text-emerald-300 uppercase tracking-widest">
            <p> 2026 CODE Rx SOCIETY. ALL RIGHTS RESERVED.</p>
            <div className="flex gap-6">
              <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-white cursor-pointer transition-colors">Privacy Policy</button>
              <button onClick={() => setIsCodeOpen(true)} className="hover:text-white cursor-pointer transition-colors">Code of Conduct</button>
              <a href="#terms" className="hover:text-white cursor-pointer transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Contact Form Modal */}
      {isContactOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsContactOpen(false)}>
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsContactOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-black text-slate-900 mb-6">Contact Us</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              alert('Message sent! We will get back to you soon.');
              setIsContactOpen(false);
            }} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Name</label>
                <input type="text" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Email</label>
                <input type="email" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Message</label>
                <textarea rows={4} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>
              <button type="submit" className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl hover:bg-emerald-600 transition-all">
                Send Message
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsPrivacyOpen(false)}>
          <div className="bg-white rounded-3xl max-w-2xl max-h-[80vh] overflow-y-auto p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsPrivacyOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-black text-slate-900 mb-6">Privacy Policy</h2>
            <div className="prose prose-emerald text-slate-600">
              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">1. Information We Collect</h3>
              <p>We collect information you provide directly to us, including:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Name and contact information</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Membership application details</li>
              </ul>
              
              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">2. How We Use Information</h3>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Process membership applications</li>
                <li>Send newsletters and updates</li>
                <li>Respond to your inquiries</li>
                <li>Improve our services</li>
              </ul>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">3. Data Protection</h3>
              <p>We implement appropriate security measures to protect your personal information in accordance with Ghanaian data protection laws.</p>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">4. Third-Party Services</h3>
              <p>We may share information with third-party service providers who perform services on our behalf, such as email delivery and data storage.</p>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">5. Your Rights</h3>
              <p>You have the right to access, correct, or delete your personal information. Contact us at coderxsociety@gmail.com for any data-related requests.</p>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">6. Contact</h3>
              <p>For privacy-related questions, contact: coderxsociety@gmail.com</p>
              
              <p className="text-sm text-slate-500 mt-8">Last Updated: 22/03/2026</p>
            </div>
          </div>
        </div>
      )}

      {/* Code of Conduct Modal */}
      {isCodeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsCodeOpen(false)}>
          <div className="bg-white rounded-3xl max-w-2xl max-h-[80vh] overflow-y-auto p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsCodeOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-black text-slate-900 mb-6">Code of Conduct</h2>
            <div className="prose prose-emerald text-slate-600">
              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">1. Our Pledge</h3>
              <p>As members of CODE Rx Society, we pledge to maintain a professional, respectful, and inclusive community focused on advancing pharmacy through technology.</p>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">2. Expected Behavior</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Be respectful and inclusive in all interactions</li>
                <li>Accept constructive criticism gracefully</li>
                <li>Focus on what is best for the community</li>
                <li>Show empathy towards other members</li>
                <li>Respect different viewpoints and experiences</li>
              </ul>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">3. Unacceptable Behavior</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Harassment or discrimination of any kind</li>
                <li>Trolling, insulting, or derogatory comments</li>
                <li>Publishing others' private information</li>
                <li>Professional misconduct</li>
                <li>Plagiarism or intellectual property violations</li>
              </ul>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">4. Reporting</h3>
              <p>Instances of unacceptable behavior can be reported to coderxsociety@gmail.com. All reports will be reviewed and investigated promptly.</p>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">5. Enforcement</h3>
              <p>Violations may result in warnings, temporary suspension, or permanent removal from the society.</p>

              <h3 className="text-lg font-black text-slate-900 mt-6 mb-3">6. Contact</h3>
              <p>For conduct-related issues, contact: coderxsociety@gmail.com</p>
              
              <p className="text-sm text-slate-500 mt-8">Last Updated: 22/03/2026</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
