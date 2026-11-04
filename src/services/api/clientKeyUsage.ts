import { apiClient } from './client';

const CLIENT_KEY_USAGE_PATH = '/observability/usage/client-keys';
const CLIENT_KEY_USAGE_TIMEOUT_MS = 15 * 1000;

export interface ClientKeyUsageTotals {
  requests: number;
  success: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
}

export interface ClientKeyModelUsage extends ClientKeyUsageTotals {
  model: string;
}

export interface ClientKeyUsage extends ClientKeyUsageTotals {
  /** Sorted by total tokens, highest first. */
  models: ClientKeyModelUsage[];
}

export interface ClientKeyUsageReport {
  /** Mirrors observability.usage.usage-statistics-enabled; new requests count only when true. */
  enabled: boolean;
  since: string | null;
  keys: Record<string, ClientKeyUsage>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toCount = (value: unknown): number => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
};

// Go encodes an unset time.Time as year 1; treat it and anything unparsable as missing.
const toTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).getUTCFullYear() <= 1) return null;
  return value;
};

const normalizeTotals = (raw: Record<string, unknown>): ClientKeyUsageTotals => ({
  requests: toCount(raw.requests),
  success: toCount(raw.success),
  failed: toCount(raw.failed),
  inputTokens: toCount(raw.input_tokens),
  outputTokens: toCount(raw.output_tokens),
  reasoningTokens: toCount(raw.reasoning_tokens),
  cachedTokens: toCount(raw.cached_tokens),
  totalTokens: toCount(raw.total_tokens),
  firstUsedAt: toTimestamp(raw.first_used_at),
  lastUsedAt: toTimestamp(raw.last_used_at),
});

export function normalizeClientKeyUsageReport(payload: unknown): ClientKeyUsageReport {
  if (!isRecord(payload)) {
    return { enabled: false, since: null, keys: {} };
  }
  const keys: Record<string, ClientKeyUsage> = {};
  if (isRecord(payload.keys)) {
    Object.entries(payload.keys).forEach(([key, entry]) => {
      const trimmedKey = key.trim();
      if (!trimmedKey || !isRecord(entry)) return;
      const models = isRecord(entry.models)
        ? Object.entries(entry.models)
            .filter((pair): pair is [string, Record<string, unknown>] => isRecord(pair[1]))
            .map(([model, totals]) => ({ model, ...normalizeTotals(totals) }))
            .sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model))
        : [];
      keys[trimmedKey] = { ...normalizeTotals(entry), models };
    });
  }
  return {
    enabled: payload.enabled === true,
    since: toTimestamp(payload.since),
    keys,
  };
}

export const clientKeyUsageApi = {
  async getReport(): Promise<ClientKeyUsageReport> {
    const payload = await apiClient.get<unknown>(CLIENT_KEY_USAGE_PATH, {
      timeout: CLIENT_KEY_USAGE_TIMEOUT_MS,
    });
    return normalizeClientKeyUsageReport(payload);
  },

  /** Resets one key, or every key when no key is given. The key goes in the body, not the URL. */
  reset: (apiKey?: string) =>
    apiClient.delete(CLIENT_KEY_USAGE_PATH, apiKey ? { data: { key: apiKey } } : undefined),
};
