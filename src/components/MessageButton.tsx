'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { openThread } from '@/lib/dm';
import { MessageCircle, Loader2 } from 'lucide-react';

interface MessageButtonProps {
  userId: string;
  className?: string;
}

/** Opens (or creates) your conversation with someone and navigates to it. */
const MessageButton = ({ userId, className = '' }: MessageButtonProps) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const threadId = await openThread(userId);
      router.push(`/messages?thread=${threadId}`);
    } catch (err: any) {
      // Most likely "You can only message friends" straight from the RPC.
      setError(err?.message ?? 'Could not open that conversation.');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={go}
        disabled={busy}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-40 transition-all ${className}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
        <span>Message</span>
      </button>
      {error && <p className="text-[10px] text-red-400 max-w-[200px] text-right">{error}</p>}
    </div>
  );
};

export default MessageButton;
