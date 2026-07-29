import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Shield, LayoutGrid, Clock, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { getUnseenScanCount } from '@/lib/dna/scanEventService';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);
  const [unseenScans, setUnseenScans] = useState(0);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Poll for unseen scan events every 30s
  useEffect(() => {
    const userId = localStorage.getItem('biovault_userId');
    if (!userId) return;
    const fetch = () => getUnseenScanCount(userId).then(setUnseenScans).catch(() => {});
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  const tabs = [
    { id: 'home',      label: 'Home',      icon: Home,       path: '/dashboard',  state: { tab: 'home' } },
    { id: 'vault',     label: 'Vault',     icon: Shield,     path: '/dashboard',  state: { tab: 'vault' } },
    { id: 'portfolio', label: 'Portfolio', icon: LayoutGrid, path: '/portfolio',  state: null },
    { id: 'activity',  label: 'Activity',  icon: Clock,      path: '/activity',   state: null },
    { id: 'profile',   label: 'Profile',   icon: User,       path: '/dashboard',  state: { tab: 'profile' } },
  ] as const;

  const path = location.pathname;
  const dashboardTab = (location.state as { tab?: string })?.tab as string | undefined;

  const getActive = (id: string) => {
    if (id === 'activity')  return path === '/activity';
    if (id === 'portfolio') return path.startsWith('/portfolio');
    if (path !== '/dashboard' && !path.startsWith('/dashboard/')) return false;
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
        background: isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
        padding: '6px 0 8px',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}
    >
      {tabs.map((tab) => {
        const isActive = getActive(tab.id);
        const Icon = tab.icon;
        return (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(tab.path, tab.state ? { state: tab.state } : {})}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '4px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {isActive && (
              <motion.div
                layoutId="navIndicator"
                style={{
                  position: 'absolute',
                  top: -6,
                  width: 24,
                  height: 3,
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, #7c3aed, #6366f1)',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon
                size={20}
                style={{
                  color: isActive ? '#7c3aed' : (isDark ? '#64748b' : '#94a3b8'),
                  transition: 'color 0.2s',
                }}
              />
              {tab.id === 'activity' && unseenScans > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -4,
                  right: -6,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  lineHeight: 1,
                }}>
                  {unseenScans > 9 ? '9+' : unseenScans}
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#7c3aed' : (isDark ? '#64748b' : '#94a3b8'),
                transition: 'color 0.2s',
              }}
            >
              {tab.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
