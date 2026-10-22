'use client';

import React, { useState } from 'react';
import WatchingDock from './WatchingDock';
import MessagesDock from './MessagesDock';

type OpenDock = 'messages' | 'watching' | null;

/**
 * The bottom-right corner: messages beside watching-now.
 *
 * One owner for both panels because only one may be open at a time —
 * two panels side by side overflow a phone, and stacking them would
 * push the pills off-screen.
 */
const DockBar = () => {
  const [openDock, setOpenDock] = useState<OpenDock>(null);

  const toggle = (dock: Exclude<OpenDock, null>) =>
    setOpenDock((current) => (current === dock ? null : dock));

  return (
    // No `relative` here: `fixed` already makes this the containing block
    // for the absolutely-positioned panels, and Tailwind emits `relative`
    // after `fixed`, so adding it would win the cascade and un-fix the bar.
    <div className="fixed bottom-6 right-6 z-[60] flex items-end gap-3">
      <MessagesDock
        open={openDock === 'messages'}
        onToggle={() => toggle('messages')}
        onClose={() => setOpenDock(null)}
      />
      <WatchingDock
        open={openDock === 'watching'}
        onToggle={() => toggle('watching')}
        onClose={() => setOpenDock(null)}
      />
    </div>
  );
};

export default DockBar;
