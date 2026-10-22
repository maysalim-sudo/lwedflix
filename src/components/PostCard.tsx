'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import FriendAvatar from './FriendAvatar';
import PostReactions from './PostReactions';
import PostComments from './PostComments';
import RichText from '@/lib/richText';
import { useAuth } from './AuthProvider';
import { getImageUrl } from '@/lib/imageUrl';
import { shareUrl } from '@/lib/shareLink';
import {
  deletePost,
  updatePost,
  createPost,
  repost as doRepost,
  undoRepost,
  timeAgo,
  type Post,
  type RepostSource,
} from '@/lib/posts';
import {
  MessageCircle,
  Trash2,
  Users,
  Globe,
  ChevronDown,
  ChevronUp,
  Film,
  Tv as TvIcon,
  Hash,
  Pencil,
  Check,
  X,
  Loader2,
  Repeat2,
  Link2,
  Quote,
} from 'lucide-react';

interface PostCardProps {
  post: Post;
  onChanged: (post: Post) => void;
  onDeleted: (id: string) => void;
}

/** Same threshold ReviewSection uses for its Read More cutoff. */
const TRUNCATE_AT = 300;

/** The quoted original inside a repost. Compact — it's context, not the post. */
const RepostSourceCard = ({ source }: { source: RepostSource }) => (
    <Link
      href={`/p/${source.id}`}
      className="block p-4 rounded-2xl bg-black/20 border border-white/10 hover:border-white/20 transition-colors space-y-2.5"
    >
      <div className="flex items-center gap-2 min-w-0">
        <FriendAvatar profile={source} size={24} />
        <p className="text-xs font-bold text-white truncate">
          {source.display_name || source.username}
        </p>
        <span className="text-[10px] text-muted shrink-0">· {timeAgo(source.created_at)}</span>
      </div>

      {source.body && (
        <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line break-words line-clamp-4">
          <RichText text={source.body} />
        </p>
      )}

      {source.media_id && (
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-12 rounded-md overflow-hidden bg-card shrink-0">
            <Image
              src={getImageUrl(source.poster_path, 'w185')}
              alt={source.media_title ?? ''}
              fill
              sizes="36px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[9px] font-bold text-accent uppercase tracking-widest">
              {source.media_type === 'tv' ? <TvIcon size={10} /> : <Film size={10} />}
              <span>{source.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
            </p>
            <p className="text-xs font-bold text-white truncate">{source.media_title}</p>
          </div>
        </div>
      )}

      {source.image_url && (
        <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
          <Image
            src={source.image_url}
            alt=""
            width={800}
            height={500}
            sizes="(max-width: 768px) 100vw, 480px"
            className="w-full h-auto max-h-56 object-contain"
          />
        </div>
      )}

    </Link>
);

const PostCard = ({ post, onChanged, onDeleted }: PostCardProps) => {
  const { user, isAdmin } = useAuth();
  const [expandedBody, setExpandedBody] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [reposting, setReposting] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMine = user?.id === post.user_id;
  // Moderators can remove anyone's post. RLS enforces this too — the
  // button only decides whether to offer the action.
  const canDelete = isMine || isAdmin;
  const isLong = post.body.length > TRUNCATE_AT;
  const shownBody = isLong && !expandedBody ? `${post.body.slice(0, TRUNCATE_AT)}…` : post.body;

  const author = {
    username: post.username,
    display_name: post.display_name,
    avatar_url: post.avatar_url,
  };

  const mediaHref =
    post.media_type === 'tv'
      ? `/tv/${post.media_id}${post.season ? `?season=${post.season}&episode=${post.episode ?? 1}` : ''}`
      : `/movie/${post.media_id}`;

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === post.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updatePost(post.id, next);
      // edited_at is stamped by a DB trigger; reflect it locally so the
      // "edited" marker appears without a refetch.
      onChanged({ ...post, body: next, edited_at: new Date().toISOString() });
      setEditing(false);
    } catch {
      // Leave the editor open with the draft intact.
    } finally {
      setSaving(false);
    }
  };

  // Reposting a repost targets the original, so the count and the toggle
  // always belong to the thing people actually shared.
  const shareTargetId = post.repost_of ?? post.id;

  const toggleRepost = async () => {
    setReposting(true);
    setShareOpen(false);
    try {
      if (post.i_reposted) {
        await undoRepost(post);
        onChanged({ ...post, i_reposted: false, repost_count: Math.max(0, post.repost_count - 1) });
      } else {
        await doRepost(post);
        onChanged({ ...post, i_reposted: true, repost_count: post.repost_count + 1 });
      }
    } catch {
      // Leave the card as-is; the next feed refresh corrects the count.
    } finally {
      setReposting(false);
    }
  };

  const submitQuote = async () => {
    const body = quoteDraft.trim();
    if (!body) return;
    setReposting(true);
    try {
      await createPost({ body, visibility: post.visibility, repostOf: shareTargetId });
      setQuoteDraft('');
      setQuoting(false);
      // The new post arrives through the feed's realtime subscription.
    } catch {
      // Keep the draft so it isn't lost.
    } finally {
      setReposting(false);
    }
  };

  const copyLink = async () => {
    setShareOpen(false);
    try {
      await navigator.clipboard.writeText(shareUrl(`/p/${shareTargetId}`));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; nothing useful to say if it fails.
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deletePost(post.id);
      onDeleted(post.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4 hover:border-white/10 transition-colors">
      {post.repost_of && (
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-widest">
          <Repeat2 size={12} />
          <span>{isMine ? 'You reposted' : `${post.display_name || post.username} reposted`}</span>
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/u/${post.username}`}>
            <FriendAvatar profile={author} size={40} />
          </Link>
          <div className="min-w-0">
            <Link
              href={`/u/${post.username}`}
              className="text-sm font-bold text-white hover:text-accent transition-colors"
            >
              {post.display_name || post.username}
            </Link>
            <p className="flex items-center gap-1.5 text-[10px] text-muted uppercase tracking-widest">
              <span>{timeAgo(post.created_at)}</span>
              {post.edited_at && <span className="normal-case tracking-normal">(edited)</span>}
              <span>·</span>
              {post.visibility === 'public' ? <Globe size={10} /> : <Users size={10} />}
              {post.channel_slug && (
                <>
                  <span>·</span>
                  <Link
                    href={`/c/${post.channel_slug}`}
                    className="flex items-center gap-0.5 text-accent hover:underline"
                  >
                    <Hash size={9} />
                    <span className="normal-case tracking-normal">{post.channel_slug}</span>
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isMine && !editing && (
            <button
              onClick={() => {
                setDraft(post.body);
                setEditing(true);
              }}
              className="p-2 rounded-xl text-white/20 hover:text-accent hover:bg-accent/10 transition-colors"
              title="Edit post"
            >
              <Pencil size={15} />
            </button>
          )}

          {canDelete && (
            <button
              onClick={remove}
              disabled={deleting}
              className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
              title={isMine ? 'Delete post' : 'Delete post (moderator)'}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={saveEdit}
              disabled={saving || !draft.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 disabled:opacity-40 transition-all"
            >
              {saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
              <span>Save</span>
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:text-white transition-all"
            >
              <X size={13} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      ) : post.body ? (
        <div className="space-y-2">
          <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line break-words">
            <RichText text={shownBody} />
          </p>
          {isLong && (
            <button
              onClick={() => setExpandedBody((v) => !v)}
              className="flex items-center space-x-1 text-accent text-xs font-bold uppercase tracking-widest hover:underline"
            >
              {expandedBody ? (
                <>
                  <ChevronUp size={14} />
                  <span>Show Less</span>
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  <span>Read More</span>
                </>
              )}
            </button>
          )}
        </div>
      ) : null}

      {post.repost_of &&
        (post.repost_source ? (
          <RepostSourceCard source={post.repost_source} />
        ) : (
          <div className="p-4 rounded-2xl bg-black/20 border border-white/10 text-center">
            <p className="text-xs text-muted">
              The original post isn't available to you.
            </p>
          </div>
        ))}

      {post.media_id && (
        <Link
          href={mediaHref}
          className="flex items-center gap-3 p-3 rounded-2xl bg-black/30 border border-white/10 hover:border-accent/40 transition-colors group/media"
        >
          <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-card shrink-0">
            <Image
              src={getImageUrl(post.poster_path, 'w185')}
              alt={post.media_title ?? ''}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-accent uppercase tracking-widest">
              {post.media_type === 'tv' ? <TvIcon size={11} /> : <Film size={11} />}
              <span>{post.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
            </p>
            <p className="text-sm font-bold text-white truncate group-hover/media:text-accent transition-colors">
              {post.media_title}
            </p>
            {post.season != null && post.episode != null && (
              <p className="text-xs text-muted">
                S{post.season} · E{post.episode}
              </p>
            )}
          </div>
        </Link>
      )}

      {post.image_url && (
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
          <Image
            src={post.image_url}
            alt=""
            width={1200}
            height={800}
            sizes="(max-width: 768px) 100vw, 640px"
            className="w-full h-auto max-h-[32rem] object-contain"
          />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <PostReactions
          postId={post.id}
          counts={post.reaction_counts}
          myReaction={post.my_reaction}
          onChanged={({ myReaction, counts }) =>
            onChanged({ ...post, my_reaction: myReaction, reaction_counts: counts })
          }
        />

        <button
          onClick={() => setShowComments((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
            showComments
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
          }`}
        >
          <MessageCircle size={14} />
          <span>
            {post.comment_count > 0 ? post.comment_count : ''} {post.comment_count === 1 ? 'Comment' : 'Comments'}
          </span>
        </button>

        {user && (
          <div className="relative">
            <button
              onClick={() => setShareOpen((v) => !v)}
              disabled={reposting}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-40 ${
                post.i_reposted
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {reposting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Repeat2 size={14} />
              )}
              <span>
                {copied ? 'Link copied' : post.repost_count > 0 ? post.repost_count : 'Share'}
              </span>
            </button>

            {shareOpen && (
              <>
                {/* Click-away. A plain overlay is enough here — the menu
                    is small and nothing behind it needs to stay live. */}
                <div className="fixed inset-0 z-10" onClick={() => setShareOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-20 w-44 rounded-2xl bg-card border border-white/10 shadow-2xl overflow-hidden p-1">
                  <button
                    onClick={toggleRepost}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/80 hover:bg-white/5 hover:text-white transition-colors text-left"
                  >
                    <Repeat2 size={14} />
                    <span>{post.i_reposted ? 'Undo repost' : 'Repost'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShareOpen(false);
                      setQuoting(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/80 hover:bg-white/5 hover:text-white transition-colors text-left"
                  >
                    <Quote size={14} />
                    <span>Quote</span>
                  </button>
                  <button
                    onClick={copyLink}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/80 hover:bg-white/5 hover:text-white transition-colors text-left"
                  >
                    <Link2 size={14} />
                    <span>Copy link</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {quoting && (
        <div className="space-y-3">
          <textarea
            value={quoteDraft}
            autoFocus
            onChange={(e) => setQuoteDraft(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Add your thoughts…"
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-sm placeholder:text-white/30 focus:border-accent focus:bg-white/[0.08] transition-all outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submitQuote}
              disabled={reposting || !quoteDraft.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 disabled:opacity-40 transition-all"
            >
              {reposting ? <Loader2 className="animate-spin" size={13} /> : <Repeat2 size={13} />}
              <span>Repost</span>
            </button>
            <button
              onClick={() => {
                setQuoting(false);
                setQuoteDraft('');
              }}
              disabled={reposting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:text-white transition-all"
            >
              <X size={13} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {showComments && (
        <PostComments
          postId={post.id}
          postOwnerId={post.user_id}
          onCountChange={(delta) =>
            onChanged({ ...post, comment_count: Math.max(0, post.comment_count + delta) })
          }
        />
      )}
    </div>
  );
};

export default PostCard;
