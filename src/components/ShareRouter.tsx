/**
 * ShareRouter.tsx
 * ───────────────
 * Routes /share/:token to the correct viewer.
 *
 *   portfolio_{...}  → SharedPortfolioPage (Supabase-backed portfolio)
 *   share_{...}      → SecureShareGate     (PINIT DNA — identity + location gate)
 *   (any other)      → SecureShareGate     (fallback)
 */

import { useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const SecureShareGate = lazy(() =>
  import('@/components/SecureShareGate').then((m) => ({ default: m.SecureShareGate })),
);
const SharedPortfolioPage = lazy(() =>
  import('@/pages/portfolio/SharedPortfolioPage'),
);

const PageLoader = () => (
  <div style={{
    width: '100vw', height: '100vh',
    background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, #050a14 60%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column', gap: '16px',
  }}>
    <div style={{
      width: '44px', height: '44px',
      border: '3px solid rgba(139,92,246,0.15)',
      borderTop: '3px solid #a855f7',
      borderRadius: '50%',
      animation: 'spin 0.9s linear infinite',
    }} />
    <p style={{ color: '#6b21a8', fontSize: '12px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
      PINIT DNA
    </p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export default function ShareRouter() {
  const { token } = useParams<{ token: string }>();

  if (token?.startsWith('portfolio_')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SharedPortfolioPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <SecureShareGate />
    </Suspense>
  );
}
