'use client';

import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  /** Tighter spacing for empty states nested inside a card. */
  compact?: boolean;
}

/** One empty state, instead of the py-12/py-20/py-24 variants that had accumulated. */
const EmptyState = ({ icon: Icon, title, body, action, compact = false }: EmptyStateProps) => (
  <div className={`${compact ? 'py-12' : 'py-20'} text-center space-y-5`}>
    <div
      className={`inline-flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/20 ${
        compact ? 'w-16 h-16' : 'w-20 h-20'
      }`}
    >
      <Icon size={compact ? 26 : 32} />
    </div>
    <div className="space-y-2">
      <h3 className={`font-bold ${compact ? 'text-base' : 'text-xl'}`}>{title}</h3>
      {body && <p className="text-muted max-w-xs mx-auto text-sm">{body}</p>}
    </div>
    {action}
  </div>
);

export default EmptyState;
