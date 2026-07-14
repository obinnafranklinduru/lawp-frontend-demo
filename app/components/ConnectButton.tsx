'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="px-4 py-2 bg-white/5 rounded-full text-sm font-mono border border-white/10 opacity-50 cursor-not-allowed">
        Loading...
      </div>
    );
  }

  if (isConnected) {
    return (
      <div 
        className="px-4 py-2 bg-[var(--color-brand-success)]/10 text-[var(--color-brand-success)] rounded-full text-sm font-mono border border-[var(--color-brand-success)]/30 cursor-pointer hover:bg-[var(--color-brand-success)]/20 transition flex items-center gap-2"
        onClick={() => disconnect()}
      >
        <div className="w-2 h-2 rounded-full bg-[var(--color-brand-success)] animate-pulse"></div>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </div>
    );
  }

  return (
    <div 
      className="px-4 py-2 bg-white/5 rounded-full text-sm font-mono border border-white/10 cursor-pointer hover:bg-white/10 transition"
      onClick={() => connect({ connector: connectors[0] })}
    >
      Connect Wallet
    </div>
  );
}
