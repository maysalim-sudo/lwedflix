'use client';

import React from 'react';
import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';

export interface TabItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Link tabs (URL-backed) set href; button tabs set onSelect. */
  href?: string;
  badge?: number;
}

interface TabStripProps {
  tabs: TabItem[];
  active: string;
  onSelect?: (key: string) => void;
}

/** The pill tab row used by friends, watchlist and title discussion. */
const TabStrip = ({ tabs, active, onSelect }: TabStripProps) => {
  const cls = (isActive: boolean) =>
    `flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
      isActive ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white'
    }`;

  return (
    <div className="flex items-center gap-2 p-1 bg-black/20 rounded-2xl w-fit max-w-full overflow-x-auto no-scrollbar">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const inner = (
          <>
            {t.icon && <t.icon size={14} />}
            <span>{t.label}</span>
            {!!t.badge && t.badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-white text-[10px] flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </>
        );

        return t.href ? (
          <Link key={t.key} href={t.href} scroll={false} className={cls(isActive)}>
            {inner}
          </Link>
        ) : (
          <button key={t.key} onClick={() => onSelect?.(t.key)} className={cls(isActive)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
};

export default TabStrip;
