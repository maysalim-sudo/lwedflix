'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { getIncognito, setIncognito } from '@/lib/presence';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * Tells the viewer their activity is visible to friends, and lets them
 * turn that off. Deliberately shown next to the friends' activity list —
 * the moment you learn you can see them is the moment to learn they can
 * see you.
 */
const IncognitoToggle = ({ compact = false }: { compact?: boolean }) => {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getIncognito()
      .then((v) => !cancelled && setOn(v))
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || !ready) return null;

  const toggle = async () => {
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      await setIncognito(next);
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        on ? 'bg-white/[0.02] border-white/10' : 'bg-accent/[0.06] border-accent/20'
      } ${compact ? 'p-2.5' : 'p-3'}`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 shrink-0 ${on ? 'text-white/40' : 'text-accent'}`}>
          {on ? <EyeOff size={14} /> : <Eye size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/70 leading-snug">
            {on
              ? 'Incognito is on — friends just see “Something secret”.'
              : 'Friends can see what you’re watching right now.'}
          </p>
          <button
            onClick={toggle}
            disabled={busy}
            className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
          >
            {busy && <Loader2 className="animate-spin" size={10} />}
            <span>{on ? 'Turn off incognito' : 'Go incognito'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncognitoToggle;
