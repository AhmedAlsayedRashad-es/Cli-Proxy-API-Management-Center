import type { ClientKeyModelUsage, ClientKeyUsage } from '@/services/api';

// Standard USD per million tokens, checked 2026-11-02:
// https://platform.claude.com/docs/en/about-claude/pricing
// https://developers.openai.com/api/docs/pricing
// https://developers.openai.com/api/docs/models/gpt-5.4
// Values are [uncached input, cache read, output].
const PRICES = {
  'claude-opus-5-5': [4, 0.2, 20],
  'claude-opus-5': [5, 0.5, 25],
  'claude-opus-4-8': [5, 0.5, 25],
  'claude-opus-4-7': [5, 0.5, 25],
  'claude-opus-4-6': [5, 0.5, 25],
  'claude-opus-4-5': [5, 0.5, 25],
  'claude-sonnet-5-5': [2, 0.1, 10],
  'claude-sonnet-5': [2, 0.2, 10],
  'claude-sonnet-4-6': [3, 0.3, 15],
  'claude-sonnet-4-5': [3, 0.3, 15],
  'claude-haiku-4-5': [1, 0.1, 5],
  'gpt-5': [1.25, 0.125, 10],
  'gpt-5.2-codex': [1.75, 0.175, 14],
  'gpt-5.5': [5, 0.5, 30],
  'gpt-5.3-codex': [1.75, 0.175, 14],
  'gpt-5.4': [2.5, 0.25, 15],
  'gpt-5.6-sol': [4, 0.4, 20],
  'gpt-6-astra': [10, 1, 50],
  'gpt-6.1-sol': [2, 0.1, 10],
  'gpt-6.1-terra': [1, 0.05, 5],
  'gpt-6-luna': [0.1, 0.01, 0.5],
} satisfies Record<string, readonly [number, number, number]>;

// Explicit estimates for unlisted Claude versions; never present these as exact rates.
const CLAUDE_FALLBACKS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-4-5',
} as const;

export interface UsageCost {
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  cacheWrite: number;
  cacheWriteTokens: number;
  total: number;
}

interface ModelUsageCost extends UsageCost {
  pricingModel: string;
  fallback: boolean;
}

interface UsageCostEstimate extends UsageCost {
  fallbackModels: Array<{ model: string; pricingModel: string }>;
  unpricedModels: string[];
}

export function estimateModelCost(usage: ClientKeyModelUsage): ModelUsageCost | null {
  const model = usage.model
    .trim()
    .toLowerCase()
    .replace(/\[1m\]$/, '')
    .replace(/-\d{8}$/, '');
  const family = /^claude-(opus|sonnet|haiku)-\d+(?:[.-]\d+)*(?:-latest)?$/.exec(model)?.[1];
  const pricingModel = Object.prototype.hasOwnProperty.call(PRICES, model)
    ? (model as keyof typeof PRICES)
    : family
      ? CLAUDE_FALLBACKS[family as keyof typeof CLAUDE_FALLBACKS]
      : null;
  if (!pricingModel) return null;
  const price = PRICES[pricingModel];
  const claude = model.startsWith('claude-');
  // The client-key endpoint retains raw counters: Claude cache reads are separate
  // from input; Codex cache reads are included. Both include reasoning in output.
  // Claude's remaining total is cache creation, whose TTL is not retained here.
  const cacheWriteTokens = claude
    ? Math.max(0, usage.totalTokens - usage.inputTokens - usage.outputTokens - usage.cachedTokens)
    : 0;
  const input =
    ((claude ? usage.inputTokens : Math.max(0, usage.inputTokens - usage.cachedTokens)) *
      price[0]) /
    1e6;
  const cached = (usage.cachedTokens * price[1]) / 1e6;
  const output = (usage.outputTokens * price[2]) / 1e6;
  const reasoning = (Math.min(usage.reasoningTokens, usage.outputTokens) * price[2]) / 1e6;
  const cacheWrite = (cacheWriteTokens * price[0] * 1.25) / 1e6;
  return {
    pricingModel,
    fallback: pricingModel !== model,
    input,
    cached,
    output,
    reasoning,
    cacheWrite,
    cacheWriteTokens,
    total: input + cached + output + cacheWrite,
  };
}

export function estimateUsageCost(usage: ClientKeyUsage): UsageCostEstimate | null {
  if (usage.models.length === 0) return null;
  const total: UsageCost = {
    input: 0,
    output: 0,
    reasoning: 0,
    cached: 0,
    cacheWrite: 0,
    cacheWriteTokens: 0,
    total: 0,
  };
  const fallbackModels: UsageCostEstimate['fallbackModels'] = [];
  const unpricedModels: string[] = [];
  for (const model of usage.models) {
    const cost = estimateModelCost(model);
    if (!cost) {
      unpricedModels.push(model.model);
      continue;
    }
    if (cost.fallback) fallbackModels.push({ model: model.model, pricingModel: cost.pricingModel });
    for (const key of Object.keys(total) as Array<keyof UsageCost>) total[key] += cost[key];
  }
  if (unpricedModels.length === usage.models.length) return null;
  return { ...total, fallbackModels, unpricedModels };
}

export const formatUsageCost = (value: number, locale = 'en') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value);
