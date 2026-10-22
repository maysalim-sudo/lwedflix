'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface UserLinkProps {
  username?: string | null;
  children: React.ReactNode;
  className?: string;
  /**
   * Set when this sits inside another <Link> or <button>.
   *
   * An <a> inside an <a> is invalid HTML — React will hydrate it into a
   * shape you didn't write, and the browser's own parser may close the
   * outer anchor early. In those spots we render a role="link" span and
   * navigate imperatively instead, which nests legally and still gets
   * keyboard activation.
   */
  nested?: boolean;
}

/**
 * Wraps anything that identifies a person and sends a click to their
 * profile.
 *
 * Renders children unwrapped when there's no username — some rows carry a
 * deleted or not-yet-loaded actor, and those should stay inert rather than
 * navigate to /u/undefined.
 */
const UserLink = ({ username, children, className = '', nested = false }: UserLinkProps) => {
  const router = useRouter();

  if (!username) return <>{children}</>;

  const href = `/u/${username}`;

  if (nested) {
    const go = (e: React.SyntheticEvent) => {
      // Stop the enclosing link/button from also firing: without this a
      // click on the avatar would navigate to the profile *and* trigger the
      // row's own action.
      e.preventDefault();
      e.stopPropagation();
      router.push(href);
    };

    return (
      <span
        role="link"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') go(e);
        }}
        className={`cursor-pointer hover:opacity-80 transition-opacity ${className}`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`hover:opacity-80 transition-opacity ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
};

export default UserLink;
