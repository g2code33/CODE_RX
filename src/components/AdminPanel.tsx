import { useState, useEffect } from 'react';
import {
  Users, 
  Trophy, 
  LayoutDashboard,
  Edit3,
  Plus,
  Home,
  BookOpen,
  MessageSquare,
  FileText,
  HelpCircle,
  Settings,
  Save,
  RotateCcw,
  Trash2,
  CheckCircle,
  X,
  KeyRound,
  Lock,
  ShieldAlert,
  UserPlus,
  UserCheck,
  Power
} from 'lucide-react';
import { SiteContent, INITIAL_SITE_CONTENT, normalizeSiteContent } from '../data/siteState';
import { db, auth } from '../lib/cloudflare';

const STORAGE_KEY = 'codeRx_siteContent';

// Applications Section Component
const ApplicationsSection = ({ onPendingCount }: { onPendingCount?: (n: number) => void }) => {
  const [applications, setApplications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  // Report pending count to the sidebar badge
  useEffect(() => {
    onPendingCount?.(applications.filter((a) => a.status === 'pending').length);
  }, [applications, onPendingCount]);

  const loadApplications = async () => {
    try {
      const data = await db.applications.getAll();
      setApplications(data || []);
    } catch (error) {
      console.error('Failed to load applications:', error);
      setApplications([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await db.applications.updateStatus(id, 'approved');
      const updated = applications.map(app => 
        app.id === id ? { ...app, status: 'approved' } : app
      );
      setApplications(updated);
      
      // Create member record when approved
      const app = applications.find(a => a.id === id);
      if (app) {
        await db.members.create({
          name: app.name,
          email: app.email,
          phone: app.phone,
          role: 'member'
        });
      }
    } catch (error) {
      console.error('Failed to approve application:', error);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await db.applications.updateStatus(id, 'rejected');
      const updated = applications.filter(app => app.id !== id);
      setApplications(updated);
    } catch (error) {
      console.error('Failed to reject application:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Membership Applications</h3>
        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
          {applications.filter(a => a.status === 'pending').length} Pending
        </span>
      </div>
      
      {isLoading ? (
        <div className="text-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mx-auto"></div>
          <p className="text-slate-500 mt-4">Loading applications...</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">No applications yet</p>
          <p className="text-slate-400 text-sm mt-2">Applications will appear here when users join</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div key={app.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-black text-lg">{app.name[0]}</div>
                <div>
                  <p className="font-black text-slate-900">{app.name}</p>
                  <p className="text-xs text-slate-500 font-medium">{app.email} • {app.phone}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Applied: {app.date}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleApprove(app.id)}
                  className="px-6 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-xs uppercase tracking-wide"
                >
                  Approve
                </button>
                <button 
                  onClick={() => handleReject(app.id)}
                  className="px-6 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all text-xs uppercase tracking-wide"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Subscribers Section */}
      <div className="mt-12 pt-12 border-t border-slate-200">
        <h4 className="text-xl font-black text-slate-900 mb-6">Newsletter Subscribers</h4>
        <SubscribersList />
      </div>
      
      {/* Contact Messages Section */}
      <div className="mt-12 pt-12 border-t border-slate-200">
        <h4 className="text-xl font-black text-slate-900 mb-6">Contact Messages</h4>
        <ContactMessagesList />
      </div>
    </div>
  );
};

// Subscribers List Component
const SubscribersList = () => {
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSubscribers();
  }, []);

  const loadSubscribers = async () => {
    try {
      const data = await db.subscribers.getAll();
      setSubscribers(data || []);
    } catch (error) {
      console.error('Failed to load subscribers:', error);
      setSubscribers([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500 mx-auto"></div></div>;
  }

  if (subscribers.length === 0) {
    return <p className="text-slate-500 text-sm">No subscribers yet</p>;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {subscribers.map((sub) => (
            <tr key={sub.id}>
              <td className="px-6 py-4 text-sm font-bold text-slate-900">{sub.name}</td>
              <td className="px-6 py-4 text-sm text-slate-600">{sub.email}</td>
              <td className="px-6 py-4 text-sm text-slate-600">{sub.phone || '-'}</td>
              <td className="px-6 py-4 text-sm text-slate-400">{sub.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Contact Messages List Component
const ContactMessagesList = () => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const data = await db.contacts.getAll();
      setContacts(data || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500 mx-auto"></div></div>;
  }

  if (contacts.length === 0) {
    return <p className="text-slate-500 text-sm">No contact messages yet</p>;
  }

  return (
    <div className="space-y-4">
      {contacts.map((contact) => (
        <div key={contact.id} className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="font-black text-slate-900">{contact.name}</p>
              <p className="text-sm text-slate-500">{contact.email}</p>
            </div>
            <span className="text-[10px] text-slate-400">{contact.date}</span>
          </div>
          <p className="font-bold text-slate-700 mb-2">{contact.subject}</p>
          <p className="text-slate-600 text-sm leading-relaxed">{contact.message}</p>
        </div>
      ))}
    </div>
  );
};

interface AdminStats {
  applications: number;
  pendingApplications: number;
  members: number;
  subscribers: number;
  contacts: number;
  unreadContacts: number;
}

// Members Section — manage members (add, edit points/level, activate/deactivate, remove)
const MembersSection = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newMember, setNewMember] = useState({ name: '', email: '', phone: '', role: 'member' });

  const loadMembers = async () => {
    try {
      const data = await db.members.getAll();
      setMembers(data || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to load members.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name.trim() || !newMember.email.trim()) {
      flash('error', 'Name and email are required.');
      return;
    }
    try {
      await db.members.create({ ...newMember, phone: newMember.phone, role: newMember.role });
      flash('success', `${newMember.name} added as a member.`);
      setNewMember({ name: '', email: '', phone: '', role: 'member' });
      loadMembers();
    } catch (err: any) {
      flash('error', err?.message || 'Failed to add member.');
    }
  };

  const handleSave = async (id: number, updates: { points?: number; level?: string }) => {
    try {
      await db.members.update(id, updates);
      flash('success', 'Member updated.');
      loadMembers();
    } catch (err: any) {
      flash('error', err?.message || 'Failed to update member.');
    }
  };

  const handleToggleActive = async (member: any) => {
    try {
      await db.members.update(member.id, { is_active: member.is_active === 1 ? false : true });
      flash('success', member.is_active === 1 ? `${member.name} deactivated.` : `${member.name} activated.`);
      loadMembers();
    } catch (err: any) {
      flash('error', err?.message || 'Failed to update member.');
    }
  };

  const handleRemove = async (member: any) => {
    if (!window.confirm(`Remove ${member.name} from the members list?`)) return;
    try {
      await db.members.remove(member.id);
      flash('success', `${member.name} removed.`);
      loadMembers();
    } catch (err: any) {
      flash('error', err?.message || 'Failed to remove member.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Members</h3>
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
          {members.length} Members
        </span>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-red-50 text-red-600 border border-red-100'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Add member form */}
      <form onSubmit={handleAdd} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
        <h4 className="font-black text-slate-900 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-600" /> Add New Member
        </h4>
        <div className="grid md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Full name *"
            value={newMember.name}
            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
            required
          />
          <input
            type="email"
            placeholder="Email *"
            value={newMember.email}
            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
            required
          />
          <input
            type="tel"
            placeholder="Phone"
            value={newMember.phone}
            onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
          />
          <select
            value={newMember.role}
            onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          className="px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-xs uppercase tracking-wide"
        >
          Add Member
        </button>
      </form>

      {isLoading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mx-auto"></div>
          <p className="text-slate-500 mt-4">Loading members...</p>
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">No members yet</p>
          <p className="text-slate-400 text-sm mt-2">Members appear here when applications are approved</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Member</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Level</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Points</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  onSave={(updates) => handleSave(member.id, updates)}
                  onToggleActive={() => handleToggleActive(member)}
                  onRemove={() => handleRemove(member)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Single member row with inline level/points editing
const MemberRow = ({
  member,
  onSave,
  onToggleActive,
  onRemove,
}: {
  member: any;
  onSave: (updates: { points?: number; level?: string }) => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) => {
  const [level, setLevel] = useState(member.level || '');
  const [points, setPoints] = useState(String(member.points ?? 0));
  const [editing, setEditing] = useState(false);

  return (
    <tr className={member.is_active === 1 ? '' : 'opacity-50'}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0">
            {(member.name || '?')[0]}
          </div>
          <div>
            <p className="font-bold text-slate-900">{member.name}</p>
            <p className="text-xs text-slate-500">{member.email}</p>
            {member.phone && <p className="text-[10px] text-slate-400">{member.phone}</p>}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        {editing ? (
          <input
            type="text"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-40"
          />
        ) : (
          <span className="text-sm font-bold text-slate-700">{member.level || '—'}</span>
        )}
      </td>
      <td className="px-6 py-4">
        {editing ? (
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-24"
          />
        ) : (
          <span className="text-sm font-black text-emerald-600">{member.points ?? 0}</span>
        )}
      </td>
      <td className="px-6 py-4">
        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
          member.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600'
        }`}>
          {member.role || 'member'}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
          member.is_active === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
        }`}>
          {member.is_active === 1 ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => { onSave({ level, points: parseInt(points) || 0 }); setEditing(false); }}
                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                title="Save"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-all"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
              title="Edit level & points"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onToggleActive}
            className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-all"
            title={member.is_active === 1 ? 'Deactivate' : 'Activate'}
          >
            <Power className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Remove member"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// Security Section — change the signed-in admin's password
const SecuritySection = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to change password.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Security Settings</h3>
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Account</span>
      </div>

      <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 max-w-xl space-y-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
            <KeyRound className="w-7 h-7" />
          </div>
          <div>
            <h4 className="font-black text-slate-900">Change Password</h4>
            <p className="text-sm text-slate-500">You will need to sign in again with the new password.</p>
          </div>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-600 border border-red-100'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">
              Current Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat the new password"
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export const AdminPanel = ({ 
  siteContent, 
  setSiteContent 
}: { 
  siteContent: SiteContent, 
  setSiteContent: React.Dispatch<React.SetStateAction<SiteContent>> 
}) => {
  const [activeView, setActiveView] = useState<'overview' | 'applications' | 'members' | 'security' | 'home' | 'about' | 'learn' | 'projects' | 'challenges' | 'community' | 'resources' | 'terms'>('overview');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [contentHistory, setContentHistory] = useState<SiteContent[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedToStorage, setSavedToStorage] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Defensive: never trust external payloads to have the full schema.
  const projectsList = Array.isArray(siteContent.projects) ? siteContent.projects : [];

  // Load from Cloudflare D1 on mount (with localStorage fallback)
  useEffect(() => {
    const loadContent = async () => {
      try {
        // Try to load from the API first
        const content = await db.siteContent.get();
        if (content) {
          // Normalize: payloads saved by older builds may be missing whole
          // sections (e.g. `projects`), which would crash the renders below.
          const normalized = normalizeSiteContent(content);
          setSiteContent(normalized);
          setContentHistory([normalized]);
          setHistoryIndex(0);
          setSavedToStorage(true);
          return;
        }
      } catch (error) {
        console.error('Failed to load from API, using localStorage:', error);
      }
      
      // Fallback to localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = normalizeSiteContent(JSON.parse(saved));
          setSiteContent(parsed);
          setContentHistory([parsed]);
          setHistoryIndex(0);
          setSavedToStorage(true);
        } catch (e) {
          console.error('Failed to load saved content:', e);
          setContentHistory([INITIAL_SITE_CONTENT]);
          setHistoryIndex(0);
        }
      } else {
        setContentHistory([INITIAL_SITE_CONTENT]);
        setHistoryIndex(0);
      }
    };
    
    loadContent();
  }, []);

  // Load live stats for the dashboard overview
  useEffect(() => {
    db.getStats()
      .then((s) => setStats(s))
      .catch((e) => console.error('Failed to load stats:', e));
  }, []);

  // Save to history when content changes
  useEffect(() => {
    if (historyIndex >= 0 && JSON.stringify(contentHistory[historyIndex]) !== JSON.stringify(siteContent)) {
      const newHistory = contentHistory.slice(0, historyIndex + 1);
      newHistory.push(siteContent);
      setContentHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [siteContent]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      setSiteContent(contentHistory[historyIndex - 1]);
      setHistoryIndex(historyIndex - 1);
      setHasUnsavedChanges(true);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Reset all content to default values? This cannot be undone.')) {
      setSiteContent(INITIAL_SITE_CONTENT);
      localStorage.removeItem(STORAGE_KEY);
      setSavedToStorage(false);
      setHasUnsavedChanges(true);
    }
  };

  const handleSave = async () => {
    try {
      // Save to Cloudflare D1
      await db.siteContent.update(siteContent);
      
      // Also save to localStorage as backup
      localStorage.setItem(STORAGE_KEY, JSON.stringify(siteContent));
      
      setShowSuccess(true);
      setSavedToStorage(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setHasUnsavedChanges(false);
      
      // Dispatch custom event to notify other components of the change
      window.dispatchEvent(new CustomEvent('siteContentUpdated', { detail: siteContent }));
    } catch (error) {
      console.error('Failed to save to Cloudflare:', error);
      alert('Could not save to the database. Check that the API and D1 binding are working.');
    }
  };

  const handleUpdateHome = (updates: Partial<SiteContent['home']>) => {
    setSiteContent(prev => ({
      ...prev,
      home: { ...prev.home, ...updates }
    }));
    setHasUnsavedChanges(true);
  };

  const handleUpdateAbout = (updates: Partial<SiteContent['about']>) => {
    setSiteContent(prev => ({
      ...prev,
      about: { ...prev.about, ...updates }
    }));
    setHasUnsavedChanges(true);
  };

  const handleUpdateTeamMember = (index: number, field: 'name' | 'role' | 'image', value: string) => {
    const newTeam = [...siteContent.about.team];
    newTeam[index] = { ...newTeam[index], [field]: value };
    handleUpdateAbout({ team: newTeam });
  };

  const handleAddTeamMember = () => {
    const newTeam = [...siteContent.about.team, { name: 'New Member', role: 'Role', image: 'https://via.placeholder.com/400' }];
    handleUpdateAbout({ team: newTeam });
  };

  const handleRemoveTeamMember = (index: number) => {
    const newTeam = siteContent.about.team.filter((_, i) => i !== index);
    handleUpdateAbout({ team: newTeam });
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-20">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-24 right-8 z-50 bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right">
          <CheckCircle className="w-6 h-6" />
          <div>
            <p className="font-bold">Changes saved successfully!</p>
            <p className="text-xs opacity-80">Saved to the Cloudflare D1 database</p>
          </div>
        </div>
      )}

      {/* Saved Indicator */}
      {savedToStorage && !hasUnsavedChanges && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-100 text-emerald-700 px-6 py-3 rounded-full shadow-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5" />
          <span className="font-bold text-sm">All changes saved</span>
        </div>
      )}

      {/* Unsaved Changes Warning */}
      {hasUnsavedChanges && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-yellow-400 text-black px-6 py-3 rounded-full shadow-xl flex items-center gap-3">
          <Edit3 className="w-5 h-5" />
          <span className="font-bold text-sm">Unsaved changes</span>
          <button onClick={handleSave} className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-slate-800 transition-all">
            SAVE NOW
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Admin Sidebar */}
          <aside className="lg:w-72 space-y-1 shrink-0">
            <div className="p-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl text-white mb-6 shadow-xl shadow-emerald-200">
              <h3 className="text-2xl font-black tracking-tight uppercase leading-none">Admin Core</h3>
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-[0.2em] mt-2">Global Controller</p>
              {savedToStorage && (
                <div className="mt-3 flex items-center gap-2 text-xs bg-white/20 px-3 py-1.5 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  <span>Saved</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-4 space-y-2">
              <button 
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm"
              >
                <Save className="w-4 h-4" /> Save Changes
              </button>
              <button 
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" /> Undo
              </button>
              <button 
                onClick={handleResetToDefault}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all text-sm"
              >
                <X className="w-4 h-4" /> Reset Default
              </button>
            </div>

            <nav className="space-y-1">
               <p className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">System</p>
               {[
                 { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
                 { id: 'applications', label: 'Applications', icon: Users, badge: pendingCount },
                 { id: 'members', label: 'Members', icon: UserCheck },
                 { id: 'security', label: 'Security', icon: ShieldAlert },
               ].map((item) => (
                 <button
                   key={item.id}
                   onClick={() => setActiveView(item.id as any)}
                   className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                     activeView === item.id 
                     ? 'bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-200' 
                     : 'text-slate-600 hover:bg-slate-100'
                   }`}
                 >
                   <div className="flex items-center gap-3">
                     <item.icon className="w-5 h-5" />
                     <span className="text-xs uppercase tracking-wide font-bold">{item.label}</span>
                   </div>
                   {item.badge && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">{item.badge}</span>}
                 </button>
               ))}

               <p className="px-4 py-2 mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Content Editor</p>
               {[
                 { id: 'home', label: 'Home', icon: Home },
                 { id: 'about', label: 'About', icon: HelpCircle },
                 { id: 'learn', label: 'Academy', icon: BookOpen },
                 { id: 'projects', label: 'Projects', icon: Trophy },
                 { id: 'challenges', label: 'Challenges', icon: Settings },
                 { id: 'community', label: 'Community', icon: MessageSquare },
                 { id: 'resources', label: 'Resources', icon: Plus },
                 { id: 'terms', label: 'Terms', icon: FileText },
               ].map((item) => (
                 <button
                   key={item.id}
                   onClick={() => setActiveView(item.id as any)}
                   className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                     activeView === item.id 
                     ? 'bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-200' 
                     : 'text-slate-600 hover:bg-slate-100'
                   }`}
                 >
                   <item.icon className="w-5 h-5" />
                   <span className="text-xs uppercase tracking-wide font-bold">{item.label}</span>
                 </button>
               ))}
            </nav>
          </aside>

          {/* Main Admin Content */}
          <main className="flex-grow space-y-6 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            {activeView === 'overview' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard Overview</h3>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Live System</span>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    { label: 'Total Members', value: stats ? String(stats.members) : '—', color: 'text-emerald-600' },
                    { label: 'Active Projects', value: String(projectsList.length), color: 'text-slate-900' },
                    { label: 'Pending Applications', value: stats ? String(stats.pendingApplications) : '—', color: 'text-yellow-600' },
                    { label: 'Subscribers', value: stats ? String(stats.subscribers) : '—', color: 'text-blue-600' },
                    { label: 'Total Applications', value: stats ? String(stats.applications) : '—', color: 'text-slate-900' },
                    { label: 'Unread Messages', value: stats ? String(stats.unreadContacts) : '—', color: 'text-red-600' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
                      <p className={`text-4xl font-black ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                
                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                  <h4 className="font-black text-emerald-800 mb-2">Database Status</h4>
                  <p className="text-sm text-emerald-600">
                    {stats ? '✅ Connected to Cloudflare D1 — data is live and shared across all visitors.' : '⏳ Checking database connection...'}
                  </p>
                  <p className="text-xs text-emerald-500 mt-2">
                    Applications, subscribers, contacts, members, and site content are stored in Cloudflare D1.
                  </p>
                </div>
              </div>
            )}

            {activeView === 'home' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Home Page Editor</h3>
                  <span className="text-xs font-bold text-slate-400">All changes apply immediately</span>
                </div>

                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Hero Title</label>
                      <input 
                        type="text" 
                        value={siteContent.home.heroTitle}
                        onChange={(e) => handleUpdateHome({ heroTitle: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Hero Subtitle</label>
                      <input 
                        type="text" 
                        value={siteContent.home.heroSubtitle}
                        onChange={(e) => handleUpdateHome({ heroSubtitle: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Tagline</label>
                    <input 
                      type="text" 
                      value={siteContent.home.heroTagline}
                      onChange={(e) => handleUpdateHome({ heroTagline: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Description</label>
                    <textarea 
                      rows={4}
                      value={siteContent.home.heroDescription}
                      onChange={(e) => handleUpdateHome({ heroDescription: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700 leading-relaxed"
                    />
                  </div>
                </div>

                {/* Community Stats Editor */}
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <h4 className="text-lg font-black text-slate-900 mb-6">Community Stats (Hero Section)</h4>
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Community Count</label>
                      <input 
                        type="number"
                        value={siteContent.home.communityCount}
                        onChange={(e) => handleUpdateHome({ communityCount: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">Community Member Avatars</label>
                        <button 
                          onClick={() => {
                            const newMembers = [...siteContent.home.communityMembers, { id: Date.now(), image: 'https://i.pravatar.cc/100', name: 'New Member' }];
                            handleUpdateHome({ communityMembers: newMembers });
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-600 transition-all text-xs"
                        >
                          <Plus className="w-3 h-3" /> Add Member
                        </button>
                      </div>
                      <div className="space-y-3">
                        {siteContent.home.communityMembers.map((member, idx) => (
                          <div key={member.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                              <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                            </div>
                            <input 
                              type="text"
                              value={member.image}
                              onChange={(e) => {
                                const newMembers = [...siteContent.home.communityMembers];
                                newMembers[idx].image = e.target.value;
                                handleUpdateHome({ communityMembers: newMembers });
                              }}
                              className="flex-grow bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-xs text-slate-600"
                              placeholder="Image URL (e.g., https://i.pravatar.cc/100?img=11)"
                            />
                            <button 
                              onClick={() => {
                                const newMembers = siteContent.home.communityMembers.filter((_, i) => i !== idx);
                                handleUpdateHome({ communityMembers: newMembers });
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Latest News Editor */}
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-lg font-black text-slate-900">Latest News Articles</h4>
                    <button 
                      onClick={() => {
                        const newNews = [...siteContent.home.latestNews, { 
                          id: Date.now(), 
                          category: 'ANNOUNCEMENT', 
                          title: 'New Article', 
                          text: 'Article description...' 
                        }];
                        handleUpdateHome({ latestNews: newNews });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-xs"
                    >
                      <Plus className="w-3 h-3" /> Add News
                    </button>
                  </div>
                  <div className="space-y-4">
                    {siteContent.home.latestNews.map((news, idx) => (
                      <div key={news.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded">#{idx + 1}</span>
                            <select 
                              value={news.category}
                              onChange={(e) => {
                                const newNews = [...siteContent.home.latestNews];
                                newNews[idx].category = e.target.value;
                                handleUpdateHome({ latestNews: newNews });
                              }}
                              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
                              <option value="EVENT">EVENT</option>
                              <option value="RESEARCH">RESEARCH</option>
                              <option value="ACHIEVEMENT">ACHIEVEMENT</option>
                            </select>
                          </div>
                          <button 
                            onClick={() => {
                              const newNews = siteContent.home.latestNews.filter((_, i) => i !== idx);
                              handleUpdateHome({ latestNews: newNews });
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input 
                          type="text"
                          value={news.title}
                          onChange={(e) => {
                            const newNews = [...siteContent.home.latestNews];
                            newNews[idx].title = e.target.value;
                            handleUpdateHome({ latestNews: newNews });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                          placeholder="News Title"
                        />
                        <textarea 
                          rows={3}
                          value={news.text}
                          onChange={(e) => {
                            const newNews = [...siteContent.home.latestNews];
                            newNews[idx].text = e.target.value;
                            handleUpdateHome({ latestNews: newNews });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                          placeholder="News description..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'about' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">About Page Editor</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Mission Statement</label>
                    <textarea 
                      rows={3}
                      value={siteContent.about.mission}
                      onChange={(e) => handleUpdateAbout({ mission: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Vision Statement</label>
                    <textarea 
                      rows={3}
                      value={siteContent.about.vision}
                      onChange={(e) => handleUpdateAbout({ vision: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                    />
                  </div>
                </div>

                {/* Team Editor */}
                <div className="mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-black text-slate-900">Pharmacy Team Members</h4>
                    <button onClick={handleAddTeamMember} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm">
                      <Plus className="w-4 h-4" /> Add Member
                    </button>
                  </div>
                  <div className="space-y-4">
                    {siteContent.about.team.map((member, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-wrap items-center gap-4">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                          <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-grow grid md:grid-cols-3 gap-3 flex-1 min-w-[300px]">
                          <input 
                            type="text" 
                            value={member.name}
                            onChange={(e) => handleUpdateTeamMember(idx, 'name', e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm"
                            placeholder="Name"
                          />
                          <input 
                            type="text" 
                            value={member.role}
                            onChange={(e) => handleUpdateTeamMember(idx, 'role', e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm"
                            placeholder="Role"
                          />
                          <input 
                            type="text" 
                            value={member.image}
                            onChange={(e) => handleUpdateTeamMember(idx, 'image', e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-xs text-slate-600"
                            placeholder="Image URL"
                          />
                        </div>
                        <button onClick={() => handleRemoveTeamMember(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'learn' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Academy Curriculum</h3>
                </div>
                <div className="space-y-3">
                  {siteContent.learn.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">{(idx+1).toString().padStart(2, '0')}</span>
                      <input 
                        type="text"
                        value={step}
                        onChange={(e) => {
                          const newSteps = [...siteContent.learn.steps];
                          newSteps[idx] = e.target.value;
                          setSiteContent({...siteContent, learn: {steps: newSteps}});
                          setHasUnsavedChanges(true);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm flex-grow"
                      />
                      <button 
                        onClick={() => {
                          const newSteps = siteContent.learn.steps.filter((_, i) => i !== idx);
                          setSiteContent({...siteContent, learn: {steps: newSteps}});
                          setHasUnsavedChanges(true);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const newSteps = [...siteContent.learn.steps, 'New Module'];
                      setSiteContent({...siteContent, learn: {steps: newSteps}});
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold hover:border-emerald-500 hover:text-emerald-500 transition-all"
                  >
                    + Add Module
                  </button>
                </div>
              </div>
            )}

            {activeView === 'projects' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Project Portfolio Manager</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm">
                    <Plus className="w-4 h-4" /> Add Project
                  </button>
                </div>
                
                <div className="space-y-4">
                  {projectsList.map((proj) => (
                    <div key={proj.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{proj.category}</p>
                          <h4 className="font-black text-slate-900 text-lg">{proj.title}</h4>
                        </div>
                        <div className="flex gap-2">
                          <button className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1 mb-1 block">Description</label>
                          <input type="text" value={proj.description} readOnly className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1 mb-1 block">Status</label>
                          <input type="text" value={proj.status} readOnly className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === 'challenges' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Decoder Challenge Controller</h3>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Challenge ID</label>
                      <input 
                        type="text" 
                        value={siteContent.challenges.active.id}
                        onChange={(e) => setSiteContent({...siteContent, challenges: {active: {...siteContent.challenges.active, id: e.target.value}}})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Title</label>
                      <input 
                        type="text" 
                        value={siteContent.challenges.active.title}
                        onChange={(e) => setSiteContent({...siteContent, challenges: {active: {...siteContent.challenges.active, title: e.target.value}}})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Difficulty</label>
                      <input 
                        type="text" 
                        value={siteContent.challenges.active.difficulty}
                        onChange={(e) => setSiteContent({...siteContent, challenges: {active: {...siteContent.challenges.active, difficulty: e.target.value}}})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Prize</label>
                      <input 
                        type="text" 
                        value={siteContent.challenges.active.prize}
                        onChange={(e) => setSiteContent({...siteContent, challenges: {active: {...siteContent.challenges.active, prize: e.target.value}}})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Time Remaining</label>
                      <input 
                        type="text" 
                        value={siteContent.challenges.active.timeRemaining}
                        onChange={(e) => setSiteContent({...siteContent, challenges: {active: {...siteContent.challenges.active, timeRemaining: e.target.value}}})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Challenge Brief</label>
                    <textarea 
                      rows={4}
                      value={siteContent.challenges.active.problem}
                      onChange={(e) => setSiteContent({...siteContent, challenges: {active: {...siteContent.challenges.active, problem: e.target.value}}})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeView === 'community' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Community Hub Settings</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Hub Title</label>
                    <input 
                      type="text" 
                      value={siteContent.community.hubTitle}
                      onChange={(e) => setSiteContent({...siteContent, community: {...siteContent.community, hubTitle: e.target.value}})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Description</label>
                    <textarea 
                      rows={3}
                      value={siteContent.community.description}
                      onChange={(e) => setSiteContent({...siteContent, community: {...siteContent.community, description: e.target.value}})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">Telegram Link</label>
                    <input 
                      type="text" 
                      value={siteContent.community.telegramLink}
                      onChange={(e) => setSiteContent({...siteContent, community: {...siteContent.community, telegramLink: e.target.value}})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeView === 'terms' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Terms & Conditions Master Control</h3>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">32 Sections</span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">v{siteContent.terms.version}</span>
                  </div>
                </div>
                
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4">
                  {siteContent.terms.sections.map((section, idx) => (
                    <div key={section.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-emerald-600 font-mono font-black">{section.id}</span>
                          <input 
                            type="text"
                            value={section.title}
                            onChange={(e) => {
                              const newSections = [...siteContent.terms.sections];
                              newSections[idx].title = e.target.value;
                              setSiteContent({...siteContent, terms: {...siteContent.terms, sections: newSections}});
                              setHasUnsavedChanges(true);
                            }}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-black uppercase tracking-tight flex-1"
                          />
                        </div>
                        <Trash2 className="w-4 h-4 text-red-500 cursor-pointer hover:text-red-600 transition-colors" />
                      </div>
                      <textarea 
                        rows={4}
                        value={section.content}
                        onChange={(e) => {
                          const newSections = [...siteContent.terms.sections];
                          newSections[idx].content = e.target.value;
                          setSiteContent({...siteContent, terms: {...siteContent.terms, sections: newSections}});
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600 text-sm font-medium leading-relaxed"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeView === 'resources' && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                 <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6 border-2 border-emerald-100">
                    <Settings className="w-10 h-10 text-emerald-500" />
                 </div>
                 <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-4">Resources Editor</h3>
                 <p className="text-slate-500 max-w-md font-medium">
                    Manage resource categories and items. All changes apply immediately to the live website.
                 </p>
              </div>
            )}

            {activeView === 'applications' && (
              <ApplicationsSection onPendingCount={setPendingCount} />
            )}

            {activeView === 'members' && (
              <MembersSection />
            )}

            {activeView === 'security' && (
              <SecuritySection />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
