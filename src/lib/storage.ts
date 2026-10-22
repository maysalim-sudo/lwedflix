import { supabase } from './supabase';
import { requireUserId } from './session';
import { resizeImage, validateImageFile, type ResizeMode } from './imageResize';

export type ImageBucket = 'avatars' | 'covers' | 'post-images';

const PUBLIC_MARKER = '/storage/v1/object/public/';

/**
 * Resizes, uploads, and returns a public URL.
 *
 * The object key MUST start with the uploader's user id: the storage RLS
 * policies check `(storage.foldername(name))[1] = auth.uid()::text`, which
 * is what stops one user writing into another's folder.
 */
export async function uploadImage(
  bucket: ImageBucket,
  file: File,
  mode: ResizeMode
): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const userId = await requireUserId();

  const { blob, extension } = await resizeImage(file, mode);
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type,
    // Keys are random per upload, so a collision means something is very
    // wrong — fail loudly rather than silently replacing an object.
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Best-effort cleanup of a previously uploaded image.
 *
 * Deliberately swallows failures: this is only ever called to tidy up a
 * replaced avatar or cover, and an orphaned object is far less bad than
 * blocking the user's profile save on a storage hiccup.
 */
export async function deleteByPublicUrl(url: string | null | undefined): Promise<void> {
  if (!url || !url.includes(PUBLIC_MARKER)) return;

  try {
    const [, rest] = url.split(PUBLIC_MARKER);
    const slash = rest.indexOf('/');
    if (slash < 1) return;

    const bucket = rest.slice(0, slash);
    const path = decodeURIComponent(rest.slice(slash + 1));
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // Orphaned object; not worth surfacing.
  }
}
