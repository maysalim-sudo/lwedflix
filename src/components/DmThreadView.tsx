'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import FriendAvatar from './FriendAvatar';
import { getImageUrl } from '@/lib/imageUrl';
import UserLink from './UserLink';
import RichText from '@/lib/richText';
import {
  getMessages,
  sendMessage,
  markRead,
  subscribeToMessages,
  DM_PAGE_SIZE,
  type DmMessage,
  type DmThread,
} from '@/lib/dm';
import { Loader2, Send, AlertCircle, ArrowLeft, Film, Tv as TvIcon } from 'lucide-react';

interface DmThreadViewProps {
  thread: DmThread;
  myId: string;
  /** Mobile shows one pane at a time, so the list needs a way back. */
  onBack?: () => void;
  onRead?: () => void;
  /**
   * 'dock' drops the card chrome and shrinks to fit the floating panel,
   * which draws its own border and is far shorter than a page.
   */
  variant?: 'page' | 'dock';
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const DmThreadView = ({ thread, myId, onBack, onRead, variant = 'page' }: DmThreadViewProps) => {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadId = thread.thread_id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The RPC returns newest-first; reverse so the newest sits at the
      // bottom the way a chat reads.
      const rows = await getMessages(threadId);
      setMessages(rows.slice().reverse());
      setHasMore(rows.length === DM_PAGE_SIZE);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load this conversation.');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  // Mark read on open and whenever new messages land while you're looking.
  useEffect(() => {
    if (loading) return;
    markRead(threadId)
      .then(() => onRead?.())
      .catch(() => {});
    // onRead is a parent callback; including it would re-mark on every
    // parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, loading, messages.length]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((incoming) => {
      if (!incoming?.id) return;
      setMessages((prev) =>
        prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
      );
    }, threadId);
    return unsubscribe;
  }, [threadId]);

  // Stick to the bottom for new messages, but not when paging older ones in.
  useEffect(() => {
    if (!loadingMore) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loadingMore]);

  const loadOlder = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const before = el?.scrollHeight ?? 0;
    try {
      const oldest = messages[0];
      const rows = await getMessages(threadId, {
        created_at: oldest.created_at,
        id: oldest.id,
      });
      setMessages((prev) => [...rows.slice().reverse(), ...prev]);
      setHasMore(rows.length === DM_PAGE_SIZE);
      // Hold the reading position instead of jumping to the top.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch (err: any) {
      setError(err?.message ?? 'Could not load older messages.');
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setDraft('');
    try {
      await sendMessage(threadId, body);
      // Realtime echoes our own insert back, so don't append here — that
      // would show the message twice until the next reload.
    } catch (err: any) {
      setError(err?.message ?? 'Could not send that message.');
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const name = thread.display_name || thread.username;
  const dock = variant === 'dock';

  return (
    <div
      className={
        dock
          ? 'flex flex-col h-[26rem]'
          : 'flex flex-col h-[70vh] rounded-3xl bg-white/[0.02] border border-white/5 overflow-hidden'
      }
    >
      <div className={`flex items-center gap-3 border-b border-white/5 shrink-0 ${dock ? 'p-3' : 'p-4'}`}>
        {onBack && (
          <button
            onClick={onBack}
            // In the dock this is the only way back to the thread list, so
            // it can't be mobile-only the way the page's is.
            className={`p-1.5 rounded-lg text-white/40 hover:text-white transition-colors ${
              dock ? '' : 'md:hidden'
            }`}
            aria-label="Back to conversations"
          >
            <ArrowLeft size={dock ? 16 : 18} />
          </button>
        )}
        <UserLink username={thread.username}>
          <FriendAvatar profile={thread} size={dock ? 30 : 36} />
        </UserLink>
        <div className="min-w-0">
          <UserLink username={thread.username}>
            <p className={`font-bold text-white truncate hover:text-accent transition-colors ${dock ? 'text-xs' : 'text-sm'}`}>
              {name}
            </p>
          </UserLink>
          {!dock && <p className="text-[11px] text-muted truncate">@{thread.username}</p>}
        </div>
      </div>

      <div ref={scrollRef} className={`flex-1 overflow-y-auto space-y-2 ${dock ? 'p-3' : 'p-4'}`}>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-accent" size={24} />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="text-[11px] font-bold text-white/40 hover:text-white uppercase tracking-widest disabled:opacity-40"
                >
                  {loadingMore ? 'Loading…' : 'Load older'}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <p className="text-xs text-muted text-center py-10">
                No messages yet. Say hi to {name}.
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === myId;
                return (
                  <div
                    key={m.id}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${
                        mine
                          ? 'bg-accent text-white rounded-br-md'
                          : 'bg-white/5 text-white/90 rounded-bl-md'
                      }`}
                    >
                      {m.media_id && (
                        <Link
                          href={
                            m.media_type === 'tv'
                              ? `/tv/${m.media_id}${m.season ? `?season=${m.season}&episode=${m.episode ?? 1}` : ''}`
                              : `/movie/${m.media_id}`
                          }
                          className={`flex items-center gap-2.5 mb-1.5 p-2 rounded-xl border transition-colors ${
                            mine
                              ? 'bg-black/20 border-white/20 hover:border-white/40'
                              : 'bg-black/30 border-white/10 hover:border-accent/40'
                          }`}
                        >
                          <div className="relative w-9 h-12 rounded-md overflow-hidden bg-card shrink-0">
                            <Image
                              src={getImageUrl(m.poster_path, 'w185')}
                              alt={m.media_title ?? ''}
                              fill
                              sizes="36px"
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest opacity-70">
                              {m.media_type === 'tv' ? <TvIcon size={9} /> : <Film size={9} />}
                              <span>{m.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
                            </p>
                            <p className="text-xs font-bold truncate">{m.media_title}</p>
                            {m.season != null && m.episode != null && (
                              <p className="text-[10px] opacity-70">
                                S{m.season} · E{m.episode}
                              </p>
                            )}
                          </div>
                        </Link>
                      )}

                      {m.body && (
                        <p className="text-sm break-words whitespace-pre-wrap">
                          <RichText text={m.body} onAccent={mine} />
                        </p>
                      )}
                      <p
                        className={`text-[10px] mt-1 ${
                          mine ? 'text-white/60' : 'text-muted'
                        }`}
                      >
                        {timeLabel(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 flex items-start gap-2 text-red-400 text-xs shrink-0">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className={`flex items-center gap-2 border-t border-white/5 shrink-0 ${dock ? 'p-2.5' : 'p-3'}`}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${name}…`}
          maxLength={4000}
          className={`flex-1 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-accent/40 transition-colors ${
            dock ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className={`rounded-xl bg-accent text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors shrink-0 ${
            dock ? 'p-2' : 'p-2.5'
          }`}
          aria-label="Send"
        >
          {sending ? (
            <Loader2 size={dock ? 15 : 18} className="animate-spin" />
          ) : (
            <Send size={dock ? 15 : 18} />
          )}
        </button>
      </form>
    </div>
  );
};

export default DmThreadView;
