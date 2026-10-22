'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { Loader2, Mail, Lock, Check, AlertCircle, ShieldCheck } from 'lucide-react';

/** Email and password changes. Both go through Supabase Auth, not our tables. */
const AccountSettings = () => {
  const { user } = useAuth();

  const [email, setEmail] = useState(user?.email ?? '');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changeEmail = async () => {
    const next = email.trim().toLowerCase();
    if (!next || next === user?.email) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      // Supabase sends a confirmation link; the address doesn't change
      // until it's clicked, so don't claim success outright.
      setEmailMsg({
        ok: true,
        text: 'Check your inbox — the change takes effect once you confirm it from the link we sent.',
      });
    } catch (err: any) {
      setEmailMsg({ ok: false, text: err?.message ?? 'Could not update your email.' });
    } finally {
      setEmailBusy(false);
    }
  };

  const changePassword = async () => {
    if (password.length < 6) {
      setPasswordMsg({ ok: false, text: 'Use at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      setPasswordMsg({ ok: false, text: 'Those passwords do not match.' });
      return;
    }
    setPasswordBusy(true);
    setPasswordMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirm('');
      setPasswordMsg({ ok: true, text: 'Password updated.' });
    } catch (err: any) {
      setPasswordMsg({ ok: false, text: err?.message ?? 'Could not update your password.' });
    } finally {
      setPasswordBusy(false);
    }
  };

  const message = (m: { ok: boolean; text: string } | null) =>
    m && (
      <p
        className={`flex items-start gap-2 text-[11px] ml-1 ${m.ok ? 'text-accent' : 'text-red-400'}`}
      >
        {m.ok ? (
          <Check size={13} className="shrink-0 mt-0.5" />
        ) : (
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
        )}
        <span>{m.text}</span>
      </p>
    );

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none';

  return (
    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center text-accent">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Account</h2>
          <p className="text-muted text-xs">Sign-in details, private to you.</p>
        </div>
      </div>

      {/* Email */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
          Email address
        </label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        {message(emailMsg)}
        <button
          onClick={changeEmail}
          disabled={emailBusy || !email.trim() || email.trim().toLowerCase() === user?.email}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-40 transition-all"
        >
          {emailBusy && <Loader2 className="animate-spin" size={14} />}
          <span>Update email</span>
        </button>
      </div>

      {/* Password */}
      <div className="space-y-3 pt-2 border-t border-white/5">
        <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block pt-5">
          New password
        </label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className={inputClass}
          />
        </div>
        {message(passwordMsg)}
        <button
          onClick={changePassword}
          disabled={passwordBusy || !password || !confirm}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-40 transition-all"
        >
          {passwordBusy && <Loader2 className="animate-spin" size={14} />}
          <span>Update password</span>
        </button>
      </div>
    </div>
  );
};

export default AccountSettings;
