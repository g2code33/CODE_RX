import { useState, useEffect, useRef } from 'react';
import {
  Users, 
  Trophy, 
  LayoutDashboard,
  Edit3,
  Eye,
  EyeOff,
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
import { db, auth, AuthUser } from '../lib/cloudflare';
import { PhantomControlCenter } from './PhantomControlCenter';
import { VisualEditor } from './VisualEditor';
import { Vault } from './Vault';
import { RecentItems } from './RecentItems';

const STORAGE_KEY = 'codeRx_siteContent';
const PENDING_PUBLISH_KEY = 'codeRx_pendingSiteContent';

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
      // Approval is review only. PHANTOM must deliberately use Create Member
      // in the Control Center to issue a member ID and secure activation link.
      alert('Application reviewed. Open PHANTOM Control Center → Applications → Create Member to issue the secure activation process.');
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

  const handleDelete = async (application: any) => {
    if (!window.confirm(`Delete the application from ${application.name}?`)) return;
    try {
      await db.applications.remove(application.id);
      setApplications((current) => current.filter((item) => item.id !== application.id));
    } catch (error: any) {
      alert(error?.message || 'Could not delete this application.');
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
          <p className="mx-auto w-fit rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Loading applications…</p>
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
                {!app.member_profile_id && <button
                  onClick={() => void handleDelete(app)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-red-100 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-all text-xs uppercase tracking-wide"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>}
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
  const [showAll, setShowAll] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadSubscribers = async () => {
    try { setSubscribers(await db.subscribers.getAll()); }
    catch (error) { console.error('Failed to load subscribers:', error); setSubscribers([]); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { void loadSubscribers(); }, []);

  const remove = async (subscriber: any) => {
    if (!window.confirm(`Remove ${subscriber.email} from the newsletter list?`)) return;
    setRemovingId(subscriber.id);
    try { await db.subscribers.remove(subscriber.id); setSubscribers((current) => current.filter((item) => item.id !== subscriber.id)); }
    catch (error) { console.error('Failed to remove subscriber:', error); }
    finally { setRemovingId(null); }
  };

  if (isLoading) return <div className="py-10 text-center text-sm font-bold text-emerald-700">Loading subscribers…</div>;
  if (!subscribers.length) return <p className="text-sm text-slate-500">No subscribers yet</p>;
  const visible = showAll ? subscribers : subscribers.slice(0, 3);

  return <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white"><table className="w-full min-w-[620px]"><thead className="bg-slate-50"><tr><th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th><th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Email</th><th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</th><th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Date</th><th className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Action</th></tr></thead><tbody className="divide-y divide-slate-50">{visible.map((sub) => <tr key={sub.id}><td className="px-6 py-4 text-sm font-bold text-slate-900">{sub.name || '—'}</td><td className="px-6 py-4 text-sm text-slate-600">{sub.email}</td><td className="px-6 py-4 text-sm text-slate-600">{sub.phone || '—'}</td><td className="px-6 py-4 text-sm text-slate-400">{sub.date}</td><td className="px-6 py-4 text-right"><button disabled={removingId === sub.id} onClick={() => void remove(sub)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />{removingId === sub.id ? 'Removing…' : 'Delete'}</button></td></tr>)}</tbody></table>{subscribers.length > 3 && <div className="border-t border-slate-100 px-5 py-3"><button onClick={() => setShowAll((current) => !current)} className="text-xs font-black text-emerald-700 hover:underline">{showAll ? 'Show recent 3 only' : `Show ${subscribers.length - 3} more subscribers`}</button></div>}</div>;
};

// Contact Messages List Component
const ContactMessagesList = () => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadContacts = async () => {
    try { setContacts(await db.contacts.getAll()); }
    catch (error) { console.error('Failed to load contacts:', error); setContacts([]); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { void loadContacts(); }, []);

  const remove = async (contact: any) => {
    if (!window.confirm(`Delete the message from ${contact.name}? This cannot be restored.`)) return;
    setRemovingId(contact.id);
    try { await db.contacts.remove(contact.id); setContacts((current) => current.filter((item) => item.id !== contact.id)); }
    catch (error) { console.error('Failed to delete contact message:', error); }
    finally { setRemovingId(null); }
  };

  if (isLoading) return <div className="py-10 text-center text-sm font-bold text-emerald-700">Loading contact messages…</div>;
  if (!contacts.length) return <p className="text-sm text-slate-500">No contact messages yet</p>;

  return <div className="space-y-4"><RecentItems items={contacts} label="contact messages" render={(contact) => <article key={contact.id} className="rounded-2xl border border-slate-100 bg-white p-6"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-slate-900">{contact.name}</p><p className="text-sm text-slate-500">{contact.email}</p></div><div className="flex items-center gap-3"><span className="text-[10px] text-slate-400">{contact.date}</span><button disabled={removingId === contact.id} onClick={() => void remove(contact)} aria-label={`Delete message from ${contact.name}`} className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 disabled:opacity-60"><Trash2 className="h-4 w-4" /></button></div></div><p className="mt-4 font-bold text-slate-700">{contact.subject}</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{contact.message}</p></article>} /></div>;
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
    if (!window.confirm(`Archive ${member.name}? Their history will be preserved.`)) return;
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
          <p className="mx-auto w-fit rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Loading members…</p>
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
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Calcitonins (CAL)</th>
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
          <span className="text-sm font-black text-emerald-600">{member.points ?? 0} CAL</span>
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
              title="Edit level & Calcitonins"
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
            title="Archive member"
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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
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
                type={showCurrentPassword ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full pl-11 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
              <button type="button" onClick={() => setShowCurrentPassword((visible) => !visible)} aria-label={showCurrentPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">{showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showNewPassword ? "text" : "password"}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full pl-11 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
              <button type="button" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">{showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2 mb-2 block">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat the new password"
                className="w-full pl-11 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              />
              <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
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
  setSiteContent,
  workspace,
  onWorkspaceChange,
  activeTab,
  onNavigate,
  onJoin,
  user,
}: { 
  siteContent: SiteContent, 
  setSiteContent: React.Dispatch<React.SetStateAction<SiteContent>>;
  workspace: 'controller' | 'builder' | 'vault' | 'phantom';
  onWorkspaceChange: (workspace: 'controller' | 'builder' | 'vault' | 'phantom') => void;
  activeTab: string;
  onNavigate: (id: string) => void;
  onJoin?: () => void;
  user: AuthUser | null;
}) => {
  const [activeView, setActiveView] = useState<'overview' | 'phantom' | 'applications' | 'members' | 'security' | 'home' | 'about' | 'learn' | 'projects' | 'challenges' | 'community' | 'resources' | 'terms'>('overview');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [contentHistory, setContentHistory] = useState<SiteContent[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedToStorage, setSavedToStorage] = useState(false);
  const saveFeedbackTimer = useRef<number | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasPendingPublish, setHasPendingPublish] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Defensive: never trust external payloads to have the full schema.
  const projectsList = Array.isArray(siteContent.projects) ? siteContent.projects : [];

  // Load from Cloudflare D1 on mount (with localStorage fallback)
  useEffect(() => {
    const loadContent = async () => {
      // A per-item save that fails must survive a refresh. Pending content is
      // intentionally preferred until the admin explicitly retries Publish all.
      try {
        const pending = localStorage.getItem(PENDING_PUBLISH_KEY);
        if (pending) {
          const normalized = normalizeSiteContent(JSON.parse(pending));
          setSiteContent(normalized);
          setContentHistory([normalized]);
          setHistoryIndex(0);
          setHasPendingPublish(true);
          setHasUnsavedChanges(true);
          setSavedToStorage(true);
          return;
        }
      } catch {
        localStorage.removeItem(PENDING_PUBLISH_KEY);
      }
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
    if (!user?.isPhantom) return;
    db.getStats()
      .then((s) => setStats(s))
      .catch((e) => console.error('Failed to load stats:', e));
  }, [user?.isPhantom]);

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

  const showSaveFeedback = (state: 'saving' | 'saved' | 'error') => {
    if (saveFeedbackTimer.current) window.clearTimeout(saveFeedbackTimer.current);
    setSaveFeedback(state);
    if (state === 'saved') {
      saveFeedbackTimer.current = window.setTimeout(() => setSaveFeedback('idle'), 2600);
    }
  };

  useEffect(() => () => { if (saveFeedbackTimer.current) window.clearTimeout(saveFeedbackTimer.current); }, []);

  /** Persist a supplied snapshot. Visual-editor saves call this immediately;
   * controller saves call it with the current draft. A failure is never treated
   * as published and is kept locally for Publish all to retry. */
  const persistContent = async (contentToPublish: SiteContent, showFailureAlert = false): Promise<boolean> => {
    setIsPublishing(true);
    showSaveFeedback('saving');
    try {
      const normalized = normalizeSiteContent(contentToPublish);
      await db.siteContent.update(normalized);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      localStorage.removeItem(PENDING_PUBLISH_KEY);
      setSavedToStorage(true);
      setHasPendingPublish(false);
      setHasUnsavedChanges(false);
      showSaveFeedback('saved');
      window.dispatchEvent(new CustomEvent('siteContentUpdated', { detail: normalized }));
      return true;
    } catch (error) {
      console.error('Failed to save to Cloudflare:', error);
      // The latest full content snapshot is a durable retry queue. It also lets
      // the live canvas recover exactly after a page refresh or connection loss.
      localStorage.setItem(PENDING_PUBLISH_KEY, JSON.stringify(contentToPublish));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contentToPublish));
      showSaveFeedback('error');
      setHasPendingPublish(true);
      setHasUnsavedChanges(true);
      if (showFailureAlert) alert('Could not publish to the database. Your changes are protected locally; use Publish all to retry.');
      return false;
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSave = async () => {
    await persistContent(siteContent, true);
  };

  const handleImmediatePublish = async (nextContent: SiteContent) => {
    const normalized = normalizeSiteContent(nextContent);
    setSiteContent(normalized);
    setHasUnsavedChanges(true);
    return persistContent(normalized, false);
  };

  const handlePublishAll = async () => persistContent(siteContent, false);

  // Controller edits save quietly after a brief pause. Failed saves remain
  // protected locally and use the existing retry state instead of retrying forever.
  useEffect(() => {
    if (!hasUnsavedChanges || isPublishing || hasPendingPublish) return;
    const timer = window.setTimeout(() => { void persistContent(siteContent, false); }, 800);
    return () => window.clearTimeout(timer);
  }, [siteContent, hasUnsavedChanges, isPublishing, hasPendingPublish]);

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

  const updatePortfolioProject = (id: string, updates: Record<string, unknown>) => {
    setSiteContent((current) => ({
      ...current,
      projects: (current.projects || []).map((project) => project.id === id ? { ...project, ...updates } : project),
    }));
    setHasUnsavedChanges(true);
  };

  const addPortfolioProject = () => {
    const project = {
      id: `project-${Date.now()}`,
      category: 'Pharmacy Tech' as const,
      title: 'New Project',
      description: 'Add a short project summary.',
      problem: '',
      solution: '',
      technology: [],
      team: [],
      status: '🚧 Development' as const,
      progress: 0,
    };
    setSiteContent((current) => ({ ...current, projects: [...(current.projects || []), project] }));
    setHasUnsavedChanges(true);
  };

  const removePortfolioProject = (project: { id: string; title: string }) => {
    if (!window.confirm(`Remove “${project.title}” from the public project portfolio?`)) return;
    setSiteContent((current) => ({ ...current, projects: (current.projects || []).filter((item) => item.id !== project.id) }));
    setHasUnsavedChanges(true);
  };

  const addTermsSection = () => {
    const existing = siteContent.terms.sections;
    const highest = existing.reduce((current, section) => Math.max(current, Number.parseInt(section.id, 10) || 0), 0);
    setSiteContent((current) => ({
      ...current,
      terms: { ...current.terms, sections: [...current.terms.sections, { id: String(highest + 1).padStart(2, '0'), title: 'NEW SECTION', content: 'Add the section content here.' }] },
    }));
    setHasUnsavedChanges(true);
  };

  const removeTermsSection = (section: { id: string; title: string }) => {
    if (siteContent.terms.sections.length <= 1) {
      window.alert('Keep at least one Terms section in the public document.');
      return;
    }
    if (!window.confirm(`Remove “${section.title}” from the Terms document?`)) return;
    setSiteContent((current) => ({ ...current, terms: { ...current.terms, sections: current.terms.sections.filter((item) => item.id !== section.id) } }));
    setHasUnsavedChanges(true);
  };

  if (workspace === 'vault') {
    return <Vault workspaceMode="phantom" onBack={() => onWorkspaceChange('phantom')} />;
  }

  if (workspace === 'phantom') {
    return <PhantomControlCenter onOpenVault={() => onWorkspaceChange('vault')} onBack={() => onWorkspaceChange('controller')} />;
  }

  if (workspace === 'builder') {
    return (
      <VisualEditor
        siteContent={siteContent}
        activeTab={activeTab}
        onNavigate={onNavigate}
        onJoin={onJoin}
        onExit={() => onWorkspaceChange('controller')}
        onImmediatePublish={handleImmediatePublish}
        onPublishAll={handlePublishAll}
        isPublishing={isPublishing}
        hasPendingChanges={hasPendingPublish || hasUnsavedChanges}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-20">
      {/* A compact status prompt confirms background saving without replacing or blocking the workspace. */}
      {(saveFeedback !== 'idle' || (hasUnsavedChanges && !isPublishing && !hasPendingPublish)) && <div role="status" aria-live="polite" className={`fixed top-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-black shadow-lg ${saveFeedback === 'error' ? 'border-red-100 bg-red-50 text-red-700' : saveFeedback === 'saved' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : saveFeedback === 'saving' ? 'border-sky-100 bg-sky-50 text-sky-700' : 'border-amber-100 bg-amber-50 text-amber-800'}`}>
        {saveFeedback === 'saved' ? <CheckCircle className="h-4 w-4" /> : saveFeedback === 'error' ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
        <span>{saveFeedback === 'saved' ? 'Saved' : saveFeedback === 'error' ? 'Saved locally — retry is ready' : saveFeedback === 'saving' ? 'Saving…' : 'Unsaved changes'}</span>
      </div>}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Admin Sidebar */}
          <aside className="lg:w-72 space-y-1 shrink-0">
            <div className="mb-6 rounded-3xl border border-emerald-100 bg-gradient-to-br from-[#fbfffc] via-[#effaf3] to-[#e0f5e8] p-8 text-slate-800 shadow-lg shadow-emerald-950/5">
              <h3 className="text-2xl font-black tracking-tight uppercase leading-none">Admin Core</h3>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Global Controller</p>
              {savedToStorage && (
                <div className="mt-3 flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs text-emerald-700">
                  <CheckCircle className="w-3 h-3" />
                  <span>Saved</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onWorkspaceChange('builder')}
              className="mb-4 flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-100"
            >
              <span><span className="block text-xs font-black uppercase tracking-widest text-emerald-700">Second view</span><span className="mt-1 block text-sm font-black text-slate-900">Live Website Builder</span><span className="mt-1 block text-xs text-slate-500">Edit and publish directly on the site.</span></span>
              <Edit3 className="h-5 w-5 text-emerald-600" />
            </button>

            {/* Action Buttons */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-4 space-y-2">
              <button 
                onClick={handleSave}
                disabled={isPublishing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all text-sm disabled:opacity-60"
              >
                <Save className="w-4 h-4" /> {isPublishing ? 'Saving…' : 'Save Changes'}
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
                 ...(user?.isPhantom ? [{ id: 'phantom', label: 'PHANTOM Control', icon: ShieldAlert }] : []),
                 { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
                 ...(user?.isPhantom ? [{ id: 'applications', label: 'Applications', icon: Users, badge: pendingCount }, { id: 'members', label: 'Members', icon: UserCheck }] : []),
                 { id: 'security', label: 'Security', icon: ShieldAlert },
               ].map((item) => (
                 <button
                   key={item.id}
                   onClick={() => item.id === 'phantom' ? onWorkspaceChange('phantom') : setActiveView(item.id as any)}
                   className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                     activeView === item.id 
                     ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold shadow-sm shadow-emerald-100'
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
                     ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold shadow-sm shadow-emerald-100'
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
            {activeView === 'phantom' && user?.isPhantom && <PhantomControlCenter onOpenVault={() => onWorkspaceChange('vault')} />}
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
                          setSiteContent({...siteContent, learn: { ...siteContent.learn, steps: newSteps }});
                          setHasUnsavedChanges(true);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm flex-grow"
                      />
                      <button 
                        onClick={() => {
                          const newSteps = siteContent.learn.steps.filter((_, i) => i !== idx);
                          setSiteContent({...siteContent, learn: { ...siteContent.learn, steps: newSteps }});
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
                      setSiteContent({...siteContent, learn: { ...siteContent.learn, steps: newSteps }});
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-2xl font-black tracking-tight text-slate-900">Project Portfolio Manager</h3><p className="mt-1 text-sm text-slate-500">Add, edit, or remove public portfolio cards. Changes save in the background.</p></div>
                  <button onClick={addPortfolioProject} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-emerald-600"><Plus className="h-4 w-4" />Add Project</button>
                </div>
                <div className="space-y-4">
                  {projectsList.map((proj) => {
                    const editing = editingProjectId === proj.id;
                    return <div key={proj.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-6"><div className="mb-4 flex items-start justify-between gap-4"><div className="min-w-0 flex-1">{editing ? <><select value={proj.category} onChange={(event) => updatePortfolioProject(proj.id, { category: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700"><option value="Pharmacy Tech">Pharmacy Tech</option><option value="AI Lab">AI Lab</option><option value="Software Engineering">Software Engineering</option><option value="Competitions">Competitions</option></select><input value={proj.title} onChange={(event) => updatePortfolioProject(proj.id, { title: event.target.value })} className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-lg font-black text-slate-900" placeholder="Project title" /></> : <><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">{proj.category}</p><h4 className="mt-1 text-lg font-black text-slate-900">{proj.title}</h4></>}</div><div className="flex shrink-0 gap-2">{editing ? <><button onClick={() => setEditingProjectId(null)} className="p-2 text-emerald-600 transition hover:bg-emerald-50" title="Finish editing"><CheckCircle className="h-5 w-5" /></button><button onClick={() => setEditingProjectId(null)} className="p-2 text-slate-500 transition hover:bg-slate-100" title="Close editor"><X className="h-5 w-5" /></button></> : <button onClick={() => setEditingProjectId(proj.id)} className="p-2 text-emerald-600 transition hover:bg-emerald-50" title="Edit project"><Edit3 className="h-5 w-5" /></button>}<button onClick={() => removePortfolioProject(proj)} className="p-2 text-red-500 transition hover:bg-red-50" title="Remove project"><Trash2 className="h-5 w-5" /></button></div></div><div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</label>{editing ? <textarea rows={3} value={proj.description} onChange={(event) => updatePortfolioProject(proj.id, { description: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600" /> : <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{proj.description || 'No description yet.'}</p>}</div><div><label className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</label>{editing ? <select value={proj.status} onChange={(event) => updatePortfolioProject(proj.id, { status: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><option value="🟢 Active">🟢 Active</option><option value="🚧 Development">🚧 Development</option><option value="🧪 Research">🧪 Research</option><option value="✅ Completed">✅ Completed</option></select> : <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{proj.status}</p>}</div></div></div>;
                  })}
                  {!projectsList.length && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No public projects yet. Add the first project above.</div>}
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Terms & Conditions Master Control</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{siteContent.terms.sections.length} Sections</span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">v{siteContent.terms.version}</span>
                    <button onClick={addTermsSection} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-emerald-700"><Plus className="h-3.5 w-3.5" />Add Section</button>
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
                        <button onClick={() => removeTermsSection(section)} aria-label={`Remove ${section.title}`} title="Remove section" className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
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
