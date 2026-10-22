'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import FriendAvatar from './FriendAvatar';
import { useAuth } from './AuthProvider';
import RichText from '@/lib/richText';
import {
  getComments,
  addComment,
  deleteComment,
  updateComment,
  setCommentReaction,
  applyReactionDelta,
  timeAgo,
  REACTIONS,
  REACTION_EMOJI,
  REACTION_LABEL,
  type PostComment,
  type Reaction,
} from '@/lib/posts';
import { Loader2, Send, Trash2, AlertCircle, SmilePlus, CornerDownRight, Pencil, Check, X } from 'lucide-react';

interface PostCommentsProps {
  postId: string;
  /** The post's author — they can delete any comment on their own post. */
  postOwnerId: string;
  onCountChange: (delta: number) => void;
}

const MAX_COMMENT = 1000;

const PostComments = ({ postId, postOwnerId, onCountChange }: PostCommentsProps) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments(await getComments(postId));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await addComment(postId, text, replyTo?.id ?? null);
      setBody('');
      setReplyTo(null);
      await load();
      onCountChange(1);
    } catch (err: any) {
      setError(err?.message ?? 'Could not post that comment.');
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: PostComment) => {
    try {
      await deleteComment(comment.id);
      // Deleting a parent cascades to its replies in the DB, so reflect
      // that in the count rather than assuming one row went away.
      onCountChange(-(1 + comment.replies.length));
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete that comment.');
    }
  };

  const saveEdit = async (comment: PostComment) => {
    const next = editDraft.trim();
    if (!next || next === comment.body) {
      setEditingId(null);
      return;
    }
    setSavingEdit(true);
    try {
      await updateComment(comment.id, next);
      const stamp = new Date().toISOString();
      const patch = (list: PostComment[]): PostComment[] =>
        list.map((c) =>
          c.id === comment.id
            ? { ...c, body: next, edited_at: stamp }
            : { ...c, replies: patch(c.replies) }
        );
      setComments(patch);
      setEditingId(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save that edit.');
    } finally {
      setSavingEdit(false);
    }
  };

  /** Optimistic reaction update, walking one level of nesting. */
  const react = async (comment: PostComment, reaction: Reaction) => {
    const target = comment.my_reaction === reaction ? null : reaction;
    const nextCounts = applyReactionDelta(comment.reaction_counts, comment.my_reaction, target);

    const patch = (list: PostComment[]): PostComment[] =>
      list.map((c) =>
        c.id === comment.id
          ? { ...c, my_reaction: target, reaction_counts: nextCounts }
          : { ...c, replies: patch(c.replies) }
      );

    setComments(patch);
    try {
      await setCommentReaction(comment.id, target);
    } catch {
      load();
    }
  };

  const renderComment = (c: PostComment, isReply = false) => {
    const canDelete = user?.id === c.user_id || user?.id === postOwnerId;
    const total = Object.values(c.reaction_counts).reduce((s, n) => s + (n ?? 0), 0);

    return (
      <div key={c.id} className={isReply ? 'ml-10' : ''}>
        <div className="flex items-start gap-3 group/comment">
          {c.author ? (
            <Link href={`/u/${c.author.username}`} className="shrink-0">
              <FriendAvatar profile={c.author} size={isReply ? 26 : 32} />
            </Link>
          ) : (
            <div className={`${isReply ? 'w-6.5 h-6.5' : 'w-8 h-8'} rounded-full bg-white/5 shrink-0`} />
          )}

          <div className="flex-1 min-w-0">
            <div className="inline-block max-w-full px-3 py-2 rounded-2xl bg-white/5">
              <div className="flex items-baseline gap-2">
                {c.author ? (
                  <Link
                    href={`/u/${c.author.username}`}
                    className="text-xs font-bold text-white hover:text-accent transition-colors"
                  >
                    {c.author.display_name || c.author.username}
                  </Link>
                ) : (
                  <span className="text-xs font-bold text-white/50">Unknown</span>
                )}
                <span className="text-[10px] text-muted">{timeAgo(c.created_at)}</span>
                {c.edited_at && <span className="text-[10px] text-muted">(edited)</span>}
              </div>
              {editingId === c.id ? (
                <div className="space-y-2 mt-1">
                  <textarea
                    value={editDraft}
                    autoFocus
                    onChange={(e) => setEditDraft(e.target.value.slice(0, MAX_COMMENT))}
                    rows={2}
                    className="w-full min-w-[16rem] bg-black/30 border border-white/10 rounded-xl py-2 px-3 text-white text-sm outline-none focus:border-accent resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(c)}
                      disabled={savingEdit || !editDraft.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                    >
                      {savingEdit ? <Loader2 className="animate-spin" size={11} /> : <Check size={11} />}
                      <span>Save</span>
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white/40 hover:text-white text-[10px] font-bold uppercase tracking-widest"
                    >
                      <X size={11} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line break-words">
                  <RichText text={c.body} />
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1 ml-1">
              <CommentReactionPicker comment={c} onPick={(r) => react(c, r)} />

              {/* Replies are one level deep, so replying to a reply targets
                  its parent — matching how the DB nests them. */}
              {user && (
                <button
                  onClick={() => setReplyTo(c)}
                  className="text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-accent transition-colors"
                >
                  Reply
                </button>
              )}

              {/* Authors only — moderators can delete, but rewriting
                  someone's words under their name is a different thing. */}
              {user?.id === c.user_id && editingId !== c.id && (
                <button
                  onClick={() => {
                    setEditDraft(c.body);
                    setEditingId(c.id);
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-accent transition-colors"
                >
                  <Pencil size={10} />
                  <span>Edit</span>
                </button>
              )}

              {total > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-muted">
                  {(Object.keys(c.reaction_counts) as Reaction[]).map((r) => (
                    <span key={r} className="text-xs leading-none">
                      {REACTION_EMOJI[r]}
                    </span>
                  ))}
                  <span>{total}</span>
                </span>
              )}
            </div>
          </div>

          {canDelete && (
            <button
              onClick={() => remove(c)}
              className="p-1.5 rounded-lg text-white/20 hover:text-red-400 opacity-0 group-hover/comment:opacity-100 transition-all shrink-0"
              title="Delete comment"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {c.replies.length > 0 && (
          <div className="mt-3 space-y-3">{c.replies.map((r) => renderComment(r, true))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-white/30" size={18} />
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => renderComment(c))}
          {comments.length === 0 && (
            <p className="text-xs text-muted py-1">No comments yet. Say something.</p>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 text-[11px] text-red-400">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      {user && (
        <div className="space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
              <span className="flex items-center gap-2 text-[11px] text-accent min-w-0">
                <CornerDownRight size={12} className="shrink-0" />
                <span className="truncate">
                  Replying to {replyTo.author?.display_name || `@${replyTo.author?.username ?? 'comment'}`}
                </span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white shrink-0"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_COMMENT))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder:text-white/30 focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
            />
            <button
              onClick={submit}
              disabled={!body.trim() || sending}
              className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-40 transition-all"
              title="Send"
            >
              {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Hover-revealed emoji picker for a single comment. */
function CommentReactionPicker({
  comment,
  onPick,
}: {
  comment: PostComment;
  onPick: (r: Reaction) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => (comment.my_reaction ? onPick(comment.my_reaction) : setOpen((v) => !v))}
        className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
          comment.my_reaction ? 'text-accent' : 'text-white/30 hover:text-accent'
        }`}
      >
        {comment.my_reaction ? (
          <>
            <span className="text-xs leading-none">{REACTION_EMOJI[comment.my_reaction]}</span>
            <span>{REACTION_LABEL[comment.my_reaction]}</span>
          </>
        ) : (
          <>
            <SmilePlus size={12} />
            <span>React</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full left-0 mb-1.5 z-20 flex items-center gap-0.5 p-1 rounded-xl bg-card border border-white/10 shadow-2xl"
          >
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setOpen(false);
                  onPick(r);
                }}
                title={REACTION_LABEL[r]}
                className={`w-7 h-7 rounded-lg text-sm leading-none flex items-center justify-center hover:bg-white/10 hover:scale-110 transition-all ${
                  comment.my_reaction === r ? 'bg-accent/20' : ''
                }`}
              >
                {REACTION_EMOJI[r]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PostComments;
