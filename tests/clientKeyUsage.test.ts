import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { normalizeClientKeyUsageReport } from '@/services/api/clientKeyUsage';
import {
  ApiKeyUsageDetails,
  ApiKeyUsageSummary,
} from '@/features/config/components/blocks/ApiKeyUsage';
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

  test('summary shows compact token and request counts', () => {
    const markup = renderToStaticMarkup(
      createElement(ApiKeyUsageSummary, { status: 'ready', usage })
    );
    expect(markup).toContain('1.5K');
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
    expect(markup).toContain('gpt-5');
    expect(markup).not.toContain(usageText('disabled_hint'));
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
