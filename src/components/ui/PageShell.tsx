'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';

type Width = 'narrow' | 'default' | 'wide';

const WIDTHS: Record<Width, string> = {
  narrow: 'max-w-2xl',
  default: 'max-w-3xl',
  wide: '',
};

interface PageShellProps {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  /**
   * An "up" link for pages that sit inside another (a post in the feed).
   * Plain going back is the toolbar's Back button, so most pages pass none.
   */
  backHref?: string;
  backLabel?: string;
  /** Rendered on the header row, opposite the title. */
  actions?: React.ReactNode;
  width?: Width;
  children: React.ReactNode;
}

/**
 * The standard page frame: badge + title + subtitle, an optional back
 * link, and a consistent width.
 *
 * Six pages had hand-rolled copies of this block that had drifted apart
 * in spacing and width. One component keeps them honest.
 */
const PageShell = ({
  icon: Icon,
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  actions,
  width = 'default',
  children,
}: PageShellProps) => (
  <div className="pt-32 pb-20 min-h-screen">
    <div className={`container mx-auto px-6 space-y-8 ${WIDTHS[width]}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 bg-accent/20 border border-accent/20 rounded-2xl flex items-center justify-center text-accent shrink-0">
            <Icon size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-white tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {actions}
          {backHref && (
            <Link
              href={backHref}
              className="hidden md:flex items-center gap-2 text-muted hover:text-white transition-colors text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span>{backLabel}</span>
            </Link>
          )}
        </div>
      </div>

      {children}
    </div>
  </div>
);

export default PageShell;
