'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PostCard from '@/components/PostCard';
import PageShell from '@/components/ui/PageShell';
import EmptyState from '@/components/ui/EmptyState';
import { PageSpinner, SignInPrompt } from '@/components/ui/AuthGate';
import { getPostById, type Post } from '@/lib/posts';
import { MessageSquare } from 'lucide-react';

/** Permalink for one post, so notifications can link to the thing itself. */
export default function PostPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, loading: authLoading } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setPost(await getPostById(id));
    } catch {
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    // Clear loading even when signed out, or the spinner hides the
    // sign-in screen forever.
    if (!user || !id) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, id, load]);

  if (authLoading || loading) return <PageSpinner />;

  if (!user) {
    return (
      <SignInPrompt
        icon={MessageSquare}
        title="Sign in to view this post"
        body="Posts are visible to friends, so you'll need an account."
        redirectTo={`/p/${id}`}
      />
    );
  }

  if (!post) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Post not found"
        body="It may have been deleted, or you may not have access to it."
        action={
          <Link href="/friends?tab=feed" className="text-accent font-bold hover:underline">
            Back to feed
          </Link>
        }
      />
    );
  }

  return (
    <PageShell
      icon={MessageSquare}
      title="Post"
      subtitle={`by @${post.username}`}
      backHref="/friends?tab=feed"
      backLabel="Back to feed"
      width="narrow"
    >
      <PostCard
        post={post}
        onChanged={setPost}
        onDeleted={() => setPost(null)}
      />
    </PageShell>
  );
}
