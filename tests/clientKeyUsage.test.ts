import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { normalizeClientKeyUsageReport } from '@/services/api/clientKeyUsage';
import {
  ApiKeyUsageDetails,
  ApiKeyUsageSummary,
} from '@/features/config/components/blocks/ApiKeyUsage';
import { estimateModelCost, estimateUsageCost, formatUsageCost } from '@/features/config/usageCost';
import { LANGUAGE_ORDER } from '@/utils/constants';

const ZERO_TIME = '0001-01-01T00:00:00Z';

// renderToStaticMarkup escapes text, and some locales put quotes in these strings.
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usageText = (name: string) =>
  escapeHtml(i18n.t(`config_management.visual.api_keys.usage.${name}`));

const backendPayload = {
  enabled: true,
  since: '2026-11-01T08:00:00Z',
  keys: {
    'sk-client-a': {
      requests: 3,
      success: 2,
      failed: 1,
      input_tokens: 1200,
      output_tokens: 300,
      reasoning_tokens: 40,
      cached_tokens: 500,
      total_tokens: 1500,
      first_used_at: '2026-11-01T09:00:00Z',
      last_used_at: '2026-11-01T10:00:00Z',
      models: {
        'gemini-3-pro': { requests: 1, total_tokens: 100, first_used_at: ZERO_TIME },
        'gpt-5': { requests: 2, input_tokens: 1000, output_tokens: 400, total_tokens: 1400 },
      },
    },
    '  ': { requests: 1 },
    'sk-bad': 'not an object',
  },
};

describe('normalizeClientKeyUsageReport', () => {
  test('maps backend snake_case fields and sorts models by tokens', () => {
    const report = normalizeClientKeyUsageReport(backendPayload);

    expect(report.enabled).toBe(true);
    expect(report.since).toBe('2026-11-01T08:00:00Z');
    expect(Object.keys(report.keys)).toEqual(['sk-client-a']);

    const usage = report.keys['sk-client-a'];
    expect(usage.totalTokens).toBe(1500);
    expect(usage.inputTokens).toBe(1200);
    expect(usage.cachedTokens).toBe(500);
    expect(usage.failed).toBe(1);
    expect(usage.lastUsedAt).toBe('2026-11-01T10:00:00Z');
    expect(usage.models.map((model) => model.model)).toEqual(['gpt-5', 'gemini-3-pro']);
    expect(usage.models[1].firstUsedAt).toBeNull();
    expect(usage.models[1].inputTokens).toBe(0);
  });

  test('returns an empty disabled report for unexpected payloads', () => {
    for (const payload of [null, undefined, [], 'text', 42]) {
      expect(normalizeClientKeyUsageReport(payload)).toEqual({
        enabled: false,
        since: null,
        keys: {},
      });
    }
  });

  test('ignores negative and non-numeric counts', () => {
    const report = normalizeClientKeyUsageReport({
      enabled: 'yes',
      keys: { k: { requests: -4, total_tokens: 'abc', input_tokens: '12' } },
    });
    expect(report.enabled).toBe(false);
    expect(report.keys.k.requests).toBe(0);
    expect(report.keys.k.totalTokens).toBe(0);
    expect(report.keys.k.inputTokens).toBe(12);
    expect(report.keys.k.models).toEqual([]);
  });
});

describe('ApiKeyUsage components', () => {
  const usage = normalizeClientKeyUsageReport(backendPayload).keys['sk-client-a'];

  test('summary shows compact tokens and API cost', () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageSummary, { status: 'ready', usage })
    );
    expect(markup).toContain('1.5K');
    expect(markup).toContain(usageText('cost_unavailable'));
    expect(markup).not.toContain('requests');
    expect(markup).toContain('data-usage-status="ready"');
  });

  test('summary shows the empty text for a key without requests', () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageSummary, { status: 'ready', usage: undefined })
    );
    expect(markup).toContain(usageText('none'));
  });

  test('summary renders nothing when the backend has no usage endpoint', () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageSummary, { status: 'unavailable', usage })
    );
    expect(markup).toBe('');
  });

  test('details list totals and a per-model table', () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageDetails, { usage, since: '2026-11-01T08:00:00Z', enabled: true })
    );
    expect(markup).toContain(usageText('total_tokens'));
    expect(markup).toContain('<table');
    expect(markup).toContain(usageText('api_cost'));
    expect(markup).not.toContain(usageText('requests'));
    expect(markup).not.toContain(usageText('success'));
    expect(markup).not.toContain(usageText('failed'));
    expect(markup).toContain('gpt-5');
    expect(markup).not.toContain(usageText('disabled_hint'));
  });

  test('priced usage renders the API total and every token bucket cost', () => {
    const model = {
      ...usage.models[0],
      model: 'claude-opus-5-5',
      inputTokens: 1000000,
      outputTokens: 1000000,
      reasoningTokens: 250000,
      cachedTokens: 10000000,
      totalTokens: 14000000,
    };
    const pricedUsage = { ...usage, ...model, models: [model] };
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageDetails, { usage: pricedUsage, since: null, enabled: true })
    );
    expect(markup).not.toContain(usageText('cost_unavailable'));
    expect(markup).toContain(escapeHtml(formatUsageCost(36, i18n.language)));
    expect(markup).toContain(usageText('cache_write_tokens'));
    expect(markup.match(/<dt>/g)).toHaveLength(6);
    const summary = renderToStaticMarkup(
      createElement(ApiKeyUsageSummary, { status: 'ready', usage: pricedUsage })
    );
    expect(summary).toContain('$36.00');
  });

  test('details warn when usage statistics are disabled', () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageDetails, { usage: undefined, since: null, enabled: false })
    );
    expect(markup).toContain(usageText('disabled_hint'));
    expect(markup).toContain(usageText('none'));
  });
});

describe('client key usage translations', () => {
  test('every locale defines the same usage keys', async () => {
    const english = i18n.getResourceBundle('en', 'translation');
    const expected = Object.keys(english.config_management.visual.api_keys.usage).sort();
    for (const language of LANGUAGE_ORDER) {
      const bundle = i18n.getResourceBundle(language, 'translation');
      const usageKeys = bundle?.config_management?.visual?.api_keys?.usage;
      expect(usageKeys).toBeDefined();
      expect(Object.keys(usageKeys).sort()).toEqual(expected);
    }
  });
});

describe('API equivalent cost', () => {
  const base = normalizeClientKeyUsageReport(backendPayload).keys['sk-client-a'].models[0];
  test('Claude prices cache reads separately and infers five-minute cache writes', () => {
    const cost = estimateModelCost({
      ...base,
      model: 'claude-opus-5-5',
      inputTokens: 1000000,
      cachedTokens: 10000000,
      outputTokens: 1000000,
      reasoningTokens: 250000,
      totalTokens: 14000000,
    });
    expect(cost).toEqual({
      input: 4,
      cached: 2,
      output: 20,
      reasoning: 5,
      cacheWriteTokens: 2000000,
      cacheWrite: 10,
      total: 36,
    });
  });
  test('Codex cache reads and reasoning are not charged twice', () => {
    const cost = estimateModelCost({
      ...base,
      model: 'gpt-5.3-codex',
      inputTokens: 1000000,
      cachedTokens: 800000,
      outputTokens: 100000,
      reasoningTokens: 50000,
      totalTokens: 1100000,
    });
    expect(cost?.input).toBeCloseTo(0.35);
    expect(cost?.cached).toBeCloseTo(0.14);
    expect(cost?.reasoning).toBeCloseTo(0.7);
    expect(cost?.total).toBeCloseTo(1.89);
  });
  test('unknown models do not produce a partial or zero-dollar total', () => {
    expect(estimateModelCost({ ...base, model: 'custom-alias' })).toBeNull();
    expect(
      estimateUsageCost(normalizeClientKeyUsageReport(backendPayload).keys['sk-client-a'])
    ).toBeNull();
  });
  test('dated Claude models use their exact family rate', () => {
    expect(estimateModelCost({ ...base, model: 'claude-opus-5-5-20261001[1m]' })?.total).toEqual(
      estimateModelCost({ ...base, model: 'claude-opus-5-5' })?.total
    );
    expect(estimateModelCost({ ...base, model: 'claude-opus-5-5-custom' })).toBeNull();
  });
  test('mixed supported models sum costs and small costs remain visible', () => {
    const models = ['claude-opus-5-5', 'gpt-5.3-codex'].map((model) => ({ ...base, model }));
    const cost = estimateUsageCost({
      ...normalizeClientKeyUsageReport(backendPayload).keys['sk-client-a'],
      models,
    });
    expect(cost?.total).toBeCloseTo(
      models.reduce((sum, model) => sum + estimateModelCost(model)!.total, 0)
    );
    expect(formatUsageCost(0.001)).toBe('$0.001');
  });
});
