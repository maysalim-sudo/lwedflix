'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Popcorn, ArrowRight } from 'lucide-react';
import PageShell from '@/components/ui/PageShell';

/** Accepts a bare code or a pasted room link (lwedflix:// or https://). */
function parseRoomCode(input: string): string | null {
  const last = input.trim().split('/').filter(Boolean).pop() ?? '';
  const code = last.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 12 ? code : null;
}

export default function JoinWatchPartyPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const code = parseRoomCode(input);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (code) router.push(`/watch/${code}`);
  };

  return (
    <PageShell icon={Popcorn} title="Watch Party" subtitle="Join friends with a room code" width="narrow">
      <form onSubmit={join} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4">
        <label htmlFor="room-code" className="block text-sm font-bold text-white">
          Room code or link
        </label>
        <div className="flex gap-3">
          <input
            id="room-code"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 200))}
            placeholder="K7M2QX"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-black/30 border border-white/10 rounded-2xl px-5 py-3.5 text-lg text-white font-mono tracking-[0.3em] uppercase placeholder:text-white/20 placeholder:tracking-[0.3em] outline-none focus:border-accent/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!code}
            className="flex items-center gap-2 px-6 rounded-2xl bg-accent text-white font-bold hover:bg-accent/90 disabled:opacity-40 transition-all"
          >
            <span>Join</span>
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          To start your own, open any movie or show and press <strong className="text-white/80">Watch party</strong>.
        </p>
      </form>
    </PageShell>
  );
}
