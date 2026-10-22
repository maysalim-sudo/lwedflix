'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import ProfileView from '@/components/ProfileView';

/**
 * Anyone's profile. ProfileView decides what to show from ownership, so
 * visiting your own /u/<name> gives you the editor and settings too.
 */
export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  return <ProfileView username={params?.username ?? ''} />;
}
