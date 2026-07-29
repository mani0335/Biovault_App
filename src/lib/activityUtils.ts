/**
 * Activity Logging & Tracking
 * Track all encryption, sharing, and vault operations
 */

export interface ActivityLog {
  id: string;
  timestamp: string;
  userId: string;
  action: 'upload' | 'encrypt' | 'share' | 'download' | 'delete' | 'view' | 'certificate';
  fileName: string;
  assetId: string;
  details: string;
  status: 'success' | 'pending' | 'failed';
  metadata?: Record<string, any>;
}

// ─── Save activity log ──
export const logActivity = (
  userId: string,
  action: ActivityLog['action'],
  fileName: string,
  assetId: string,
  details: string,
  status: 'success' | 'pending' | 'failed' = 'success',
  metadata?: Record<string, any>
): ActivityLog => {
  const log: ActivityLog = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    userId,
    action,
    fileName,
    assetId,
    details,
    status,
    metadata,
  };

  const logs = getActivityLogs();
  logs.unshift(log); // Add to beginning

  // Keep last 1000 logs
  if (logs.length > 1000) logs.splice(1000);

  localStorage.setItem('activityLogs', JSON.stringify(logs));

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'activityLogs',
      newValue: JSON.stringify(logs),
      url: window.location.href,
      storageArea: localStorage,
    })
  );

  return log;
};

// ─── Get all activity logs ──
export const getActivityLogs = (userId?: string, limit?: number): ActivityLog[] => {
  try {
    const logs: ActivityLog[] = JSON.parse(localStorage.getItem('activityLogs') || '[]');
    let filtered = logs;

    if (userId) {
      filtered = logs.filter((l) => l.userId === userId);
    }

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  } catch {
    return [];
  }
};

// ─── Get activity stats ──
export const getActivityStats = (userId?: string): Record<string, number> => {
  const logs = getActivityLogs(userId);
  const stats: Record<string, number> = {
    total: logs.length,
    uploads: 0,
    encryptions: 0,
    shares: 0,
    downloads: 0,
    certificates: 0,
    deletions: 0,
    views: 0,
    successful: 0,
    failed: 0,
  };

  for (const log of logs) {
    switch (log.action) {
      case 'upload':
        stats.uploads++;
        break;
      case 'encrypt':
        stats.encryptions++;
        break;
      case 'share':
        stats.shares++;
        break;
      case 'download':
        stats.downloads++;
        break;
      case 'certificate':
        stats.certificates++;
        break;
      case 'delete':
        stats.deletions++;
        break;
      case 'view':
        stats.views++;
        break;
    }

    if (log.status === 'success') stats.successful++;
    else if (log.status === 'failed') stats.failed++;
  }

  return stats;
};

// ─── Clear activity logs ──
export const clearActivityLogs = (userId?: string): boolean => {
  try {
    if (!userId) {
      localStorage.removeItem('activityLogs');
    } else {
      const logs = getActivityLogs();
      const filtered = logs.filter((l) => l.userId !== userId);
      localStorage.setItem('activityLogs', JSON.stringify(filtered));
    }

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'activityLogs',
        newValue: '',
        url: window.location.href,
        storageArea: localStorage,
      })
    );

    return true;
  } catch {
    return false;
  }
};

// ─── Get recent activities ──
export const getRecentActivities = (userId: string, days: number = 7): ActivityLog[] => {
  const logs = getActivityLogs(userId);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return logs.filter((log) => new Date(log.timestamp).getTime() > cutoff);
};

// ─── Get activity timeline ──
export const getActivityTimeline = (userId: string): { date: string; count: number; actions: ActivityLog[] }[] => {
  const logs = getActivityLogs(userId);
  const timeline: Map<string, ActivityLog[]> = new Map();

  for (const log of logs) {
    const date = new Date(log.timestamp).toLocaleDateString();
    if (!timeline.has(date)) timeline.set(date, []);
    timeline.get(date)!.push(log);
  }

  return Array.from(timeline.entries())
    .map(([date, actions]) => ({ date, count: actions.length, actions }))
    .slice(0, 30); // Last 30 days
};
