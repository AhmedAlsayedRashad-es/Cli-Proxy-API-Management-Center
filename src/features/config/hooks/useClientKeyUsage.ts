import { useCallback, useEffect, useRef, useState } from 'react';
import { clientKeyUsageApi, type ClientKeyUsageReport } from '@/services/api';

const CLIENT_KEY_USAGE_REFRESH_MS = 30 * 1000;

export type ClientKeyUsageStatus = 'loading' | 'ready' | 'unavailable';

export interface ClientKeyUsageState {
  status: ClientKeyUsageStatus;
  report: ClientKeyUsageReport | null;
  refresh: () => Promise<void>;
  reset: (apiKey?: string) => Promise<void>;
}

/**
 * Loads per-client-key usage and refreshes it while mounted. The caller must
 * remount the hook (for example with a `key`) when the connection changes;
 * the request sequence guard drops responses that arrive after unmount or
 * after a newer request.
 */
export function useClientKeyUsage(): ClientKeyUsageState {
  const [status, setStatus] = useState<ClientKeyUsageStatus>('loading');
  const [report, setReport] = useState<ClientKeyUsageReport | null>(null);
  const requestSeq = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await clientKeyUsageApi.getReport();
      if (!mounted.current || seq !== requestSeq.current) return;
      setReport(next);
      setStatus('ready');
    } catch {
      if (!mounted.current || seq !== requestSeq.current) return;
      // Older backends have no client-key usage endpoint; keep the last report if any.
      setStatus((prev) => (prev === 'ready' ? prev : 'unavailable'));
    }
  }, []);

  const reset = useCallback(
    async (apiKey?: string) => {
      await clientKeyUsageApi.reset(apiKey);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, CLIENT_KEY_USAGE_REFRESH_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { status, report, refresh, reset };
}
