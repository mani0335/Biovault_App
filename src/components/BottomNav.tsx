import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Shield, LayoutGrid, Clock, User } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  // Each tab config: where to navigate and what state to pass.
  // Vault, Profile, and Home all live inside /dashboard (PINITVaultDashboard).
  // We pass { tab } in location.state so Dashboard opens the right internal tab.
  const tabs = [
    { id: 'home',      label: 'Home',      icon: Home,       path: '/dashboard',  state: { tab: 'home' } },
    { id: 'vault',     label: 'Vault',     icon: Shield,     path: '/dashboard',  state: { tab: 'vault' } },
    { id: 'portfolio', label: 'Portfolio', icon: LayoutGrid, path: '/portfolio',  state: null },
    { id: 'activity',  label: 'Activity',  icon: Clock,      path: '/activity',   state: null },
    { id: 'profile',   label: 'Profile',   icon: User,       path: '/dashboard',  state: { tab: 'profile' } },
  ] as const;

  const path = location.pathname;
  // What tab is currently active inside the dashboard (if we're there)
  const dashboardTab = (location.state as any)?.tab as string | undefined;

  const getActive = (id: string) => {
    if (id === 'activity')  return path === '/activity';
    if (id === 'portfolio') return path.startsWith('/portfolio');
    if (path !== '/dashboard' && !path.startsWith('/dashboard/')) return false;
    // On dashboard — highlight whichever tab matches the state, defaulting 'home'
    const activeTab = dashboardTab || 'home';
    return id === activeTab;
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(15,23,42,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(139,92,246,0.3)',
        padding: '8px 0 4px',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}
    >
      {tabs.map((tab) => {
        const finalActive = getActive(tab.id);
        return (
          <motion.button
            key={tab.id}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(tab.path, tab.state ? { state: tab.state } : {})}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 12px',
              borderRadius: 12,
              background: 'none',
              border: 'none',
              borderBottom: finalActive ? '2px solid rgb(168,85,247)' : '2px solid transparent',
              color: finalActive ? '#c084fc' : '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: 56,
            }}
          >
            <tab.icon size={22} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{tab.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
