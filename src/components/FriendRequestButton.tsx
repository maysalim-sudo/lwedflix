'use client';

import React, { useState } from 'react';
import { Loader2, UserPlus, Check, X, Clock, UserMinus } from 'lucide-react';
import {
  sendFriendRequest,
  respondToRequest,
  cancelRequest,
  unfriend,
} from '@/lib/friends';

/** Where the viewer stands with the profile being rendered. */
export type RelationshipStatus = 'none' | 'outgoing' | 'incoming' | 'friends';

interface FriendRequestButtonProps {
  profileId: string;
  status: RelationshipStatus;
  /** Required for every status except 'none'. */
  requestId?: string;
  /** Called after any successful mutation so the parent can refetch. */
  onChanged: () => void;
}

const FriendRequestButton = ({
  profileId,
  status,
  requestId,
  onChanged,
}: FriendRequestButtonProps) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const spinner = <Loader2 className="animate-spin" size={14} />;

  const control = (() => {
    if (status === 'none') {
      return (
        <button
          onClick={() => run(() => sendFriendRequest(profileId))}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 disabled:opacity-50 transition-all"
        >
          {busy ? spinner : <UserPlus size={14} />}
          <span>Add Friend</span>
        </button>
      );
    }

    if (status === 'outgoing') {
      return (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold">
            <Clock size={14} />
            <span>Requested</span>
          </span>
          <button
            onClick={() => requestId && run(() => cancelRequest(requestId))}
            disabled={busy || !requestId}
            className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            title="Cancel request"
          >
            {busy ? spinner : <X size={14} />}
          </button>
        </div>
      );
    }

    if (status === 'incoming') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => requestId && run(() => respondToRequest(requestId, true))}
            disabled={busy || !requestId}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 disabled:opacity-50 transition-all"
          >
            {busy ? spinner : <Check size={14} />}
            <span>Accept</span>
          </button>
          <button
            onClick={() => requestId && run(() => respondToRequest(requestId, false))}
            disabled={busy || !requestId}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold hover:text-white hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            Decline
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs font-bold">
          <Check size={14} />
          <span>Friends</span>
        </span>
        <button
          onClick={() => requestId && run(() => unfriend(requestId))}
          disabled={busy || !requestId}
          className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          title="Remove friend"
        >
          {busy ? spinner : <UserMinus size={14} />}
        </button>
      </div>
    );
  })();

  return (
    <div className="flex flex-col items-end gap-1">
      {control}
      {error && <span className="text-[10px] text-red-400 max-w-[200px] text-right">{error}</span>}
    </div>
  );
};

export default FriendRequestButton;
