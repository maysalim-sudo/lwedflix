'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2, type LucideIcon } from 'lucide-react';

export const PageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="animate-spin text-accent" size={40} />
  </div>
);

interface SignInPromptProps {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Where to return after signing in. */
  redirectTo: string;
}

/** The signed-out wall, previously copy-pasted across six pages. */
export const SignInPrompt = ({ icon: Icon, title, body, redirectTo }: SignInPromptProps) => (
  <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6 text-center">
    <Icon size={64} className="text-white/10" />
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted max-w-sm">{body}</p>
    </div>
    <Link
      href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
      className="bg-accent text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-accent/20 hover:scale-105 transition-all"
    >
      Sign In Now
    </Link>
  </div>
);
