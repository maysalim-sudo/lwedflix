'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { getImageUrl } from '@/lib/imageUrl';
import { uploadImage, deleteByPublicUrl } from '@/lib/storage';
import { createPost, type CreatePostInput, type Visibility } from '@/lib/posts';
import {
  Loader2,
  ImagePlus,
  X,
  Users,
  Globe,
  AlertCircle,
  Send,
} from 'lucide-react';

interface PostComposerProps {
  /** Prefilled, non-removable title attachment (used by "share what I'm watching"). */
  attachment?: CreatePostInput['media'] | null;
  /** Posting into a channel; forces public visibility and hides the toggle. */
  channelId?: string | null;
  onPosted?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

const MAX_BODY = 2000;

const PostComposer = ({
  attachment = null,
  channelId = null,
  onPosted,
  autoFocus = false,
  placeholder = "What are you watching?",
}: PostComposerProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the DB's post_not_empty constraint, so the button disables
  // rather than the insert failing.
  const hasContent = body.trim().length > 0 || imageUrl !== null || attachment != null;

  const attachFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const previous = imageUrl;
      const url = await uploadImage('post-images', file, 'post');
      setImageUrl(url);
      if (previous) await deleteByPublicUrl(previous);
    } catch (err: any) {
      setError(err?.message ?? 'Could not attach that image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = async () => {
    const previous = imageUrl;
    setImageUrl(null);
    if (previous) await deleteByPublicUrl(previous);
  };

  const submit = async () => {
    if (!hasContent || posting) return;
    setPosting(true);
    setError(null);
    try {
      await createPost({ body, imageUrl, visibility, channelId, media: attachment });
      setBody('');
      setImageUrl(null);
      onPosted?.();
    } catch (err: any) {
      setError(err?.message ?? 'Could not publish that post.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4">
      <textarea
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder={placeholder}
        rows={3}
        className="w-full bg-transparent text-white text-sm placeholder:text-white/30 outline-none resize-none leading-relaxed"
      />

      {/* Locked attachment — set by the caller, not removable here. */}
      {attachment && (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/30 border border-white/10">
          <div className="relative w-10 h-14 rounded-lg overflow-hidden bg-card shrink-0">
            <Image
              src={getImageUrl(attachment.posterPath ?? null, 'w185')}
              alt={attachment.title}
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest">
              {attachment.type === 'tv' ? 'Watching' : 'Movie'}
            </p>
            <p className="text-sm font-bold text-white truncate">{attachment.title}</p>
            {attachment.season != null && attachment.episode != null && (
              <p className="text-xs text-muted">
                S{attachment.season} · E{attachment.episode}
              </p>
            )}
          </div>
        </div>
      )}

      {imageUrl && (
        <div className="relative rounded-2xl overflow-hidden border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="w-full max-h-80 object-contain bg-black" />
          <button
            onClick={removeImage}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white/80 hover:text-white transition-colors"
            title="Remove image"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 text-[11px] text-red-400">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:text-white hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            {uploading ? <Loader2 className="animate-spin" size={14} /> : <ImagePlus size={14} />}
            <span>Photo</span>
          </button>

          {/* Per-post visibility, chosen at compose time. Channel posts
              are public by definition (enforced by a DB constraint), so
              showing a toggle there would offer a choice that doesn't exist. */}
          {channelId ? (
            <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-bold">
              <Globe size={14} />
              <span>Public</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setVisibility((v) => (v === 'friends' ? 'public' : 'friends'))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:text-white hover:bg-white/10 transition-all"
              title={
                visibility === 'friends'
                  ? 'Only your friends can see this'
                  : 'Any signed-in user can see this'
              }
            >
              {visibility === 'friends' ? <Users size={14} /> : <Globe size={14} />}
              <span>{visibility === 'friends' ? 'Friends' : 'Public'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {body.length > MAX_BODY - 200 && (
            <span className="text-[11px] text-white/30">{MAX_BODY - body.length}</span>
          )}
          <button
            onClick={submit}
            disabled={!hasContent || posting || uploading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-accent/20 hover:bg-accent/90 disabled:opacity-40 transition-all"
          >
            {posting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
            <span>Post</span>
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        // Same reasoning as the profile uploads: everything is re-encoded
        // to WebP before upload, so the picker shouldn't hide HEIC photos.
        accept="image/*"
        onChange={(e) => attachFile(e.target.files?.[0])}
        className="hidden"
      />
    </div>
  );
};

export default PostComposer;
