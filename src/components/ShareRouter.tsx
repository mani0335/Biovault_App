/**
 * ShareRouter.tsx
 * ───────────────
 * Routes /share/:token to the correct viewer based on the token prefix.
 *
 *   portfolio_{timestamp}_{rand6}  → SharedPortfolioPage (Supabase-backed)
 *   share_{timestamp}_{rand6}      → SharedImageViewer   (Vault document)
 *
 * Both child components read `useParams().token` from the parent Route,
 * so no prop drilling is needed — they work unchanged.
 */

import { useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const SharedImageViewer  = lazy(() =>
  import('@/components/SharedImageViewer').then(m => ({ default: m.SharedImageViewer })),
);
const SharedPortfolioPage = lazy(() =>
  import('@/pages/portfolio/SharedPortfolioPage'),
);

const PageLoader = () => (
  <div style={{
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '16px',
  }}>
    <div style={{
      width: '44px',
      height: '44px',
      border: '3px solid rgba(139,92,246,0.2)',
      borderTop: '3px solid #8b5cf6',
      borderRadius: '50%',
      animation: 'spin 0.9s linear infinite',
    }} />
    <p style={{ color: '#9ca3af', fontSize: '14px', fontFamily: 'monospace' }}>
      Loading shared content…
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
      <SharedImageViewer />
    </Suspense>
  );
}
