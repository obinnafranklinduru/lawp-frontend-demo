import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-12 text-center">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          Welcome to <span className="text-gradient">LAWP</span>
        </h1>
        <p className="text-lg md:text-xl text-[var(--color-brand-text-muted)] leading-relaxed">
          The Libertas Alpha Water Project. A decentralized, zero-custody protocol for fractional campaign funding, transparent revenue routing, and automated yield distribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        <Link href="/app" className="glass-panel p-8 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform">
          <div className="w-16 h-16 rounded-full bg-[var(--color-brand-primary)]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--color-brand-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Investor Portal</h2>
          <p className="text-[var(--color-brand-text-muted)] text-sm">Discover pools, track your Impact Tokens, and claim your continuous yield.</p>
        </Link>

        <Link href="/board" className="glass-panel p-8 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform">
          <div className="w-16 h-16 rounded-full bg-[var(--color-brand-secondary)]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--color-brand-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">MultiSig Board</h2>
          <p className="text-[var(--color-brand-text-muted)] text-sm">Review, sign, and relay EIP-712 payloads to route real-world revenue.</p>
        </Link>

        <Link href="/admin" className="glass-panel p-8 flex flex-col items-center gap-4 hover:-translate-y-2 transition-transform">
          <div className="w-16 h-16 rounded-full bg-[var(--color-brand-warning)]/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--color-brand-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Admin Panel</h2>
          <p className="text-[var(--color-brand-text-muted)] text-sm">Deploy contribution pools, settle capital, and manage emergency states.</p>
        </Link>
      </div>
    </div>
  );
}
