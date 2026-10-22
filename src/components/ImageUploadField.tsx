'use client';

import React, { useRef, useState } from 'react';
import { Loader2, Upload, AlertCircle, X } from 'lucide-react';
import { uploadImage, deleteByPublicUrl, type ImageBucket } from '@/lib/storage';
import type { ResizeMode } from '@/lib/imageResize';

interface ImageUploadFieldProps {
  label: string;
  bucket: ImageBucket;
  mode: ResizeMode;
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
  /** Circle for avatars, banner for covers. */
  shape?: 'circle' | 'banner';
  /** Delete the previous object after a successful replace. */
  cleanupPrevious?: boolean;
}

const ImageUploadField = ({
  label,
  bucket,
  mode,
  currentUrl,
  onUploaded,
  shape = 'circle',
  cleanupPrevious = true,
}: ImageUploadFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);

    const previous = currentUrl;
    try {
      const url = await uploadImage(bucket, file, mode);
      onUploaded(url);
      if (cleanupPrevious && previous) await deleteByPublicUrl(previous);
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed.');
    } finally {
      setBusy(false);
      // Reset so picking the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = async () => {
    const previous = currentUrl;
    onUploaded(null);
    if (cleanupPrevious && previous) await deleteByPublicUrl(previous);
  };

  const frame =
    shape === 'circle'
      ? 'w-24 h-24 rounded-full'
      : 'w-full aspect-[3/1] rounded-2xl';

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
        {label}
      </label>

      <div className="flex items-center gap-4">
        <div
          className={`${frame} relative overflow-hidden bg-card border border-white/10 flex items-center justify-center shrink-0`}
        >
          {currentUrl ? (
            // Plain <img>: this is a transient form preview whose URL changes
            // on every upload, so next/image's optimizer buys nothing here.
            // The real display in ProfileHeader uses next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt={label} className="w-full h-full object-cover" />
          ) : (
            <Upload size={shape === 'circle' ? 22 : 28} className="text-white/20" />
          )}

          {busy && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <Loader2 className="animate-spin text-accent" size={22} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            {currentUrl ? 'Replace' : 'Upload'}
          </button>
          {currentUrl && !busy && (
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-white/40 hover:text-red-400 text-xs font-bold transition-colors"
            >
              <X size={12} />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        // image/* rather than a short list: HEIC photos from an iPhone were
        // greyed out in the picker, which looks like the button doing nothing.
        accept="image/*"
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="hidden"
      />

      {error && (
        <p className="flex items-start gap-2 text-[11px] text-red-400 ml-1">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

export default ImageUploadField;
