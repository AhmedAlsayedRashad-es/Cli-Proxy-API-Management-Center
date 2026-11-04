import { useTranslation } from 'react-i18next';
import type { ClientKeyUsage } from '@/services/api';
import { formatCompactNumber, formatDateTimeValue } from '@/utils/format';
import type { ClientKeyUsageStatus } from '../../hooks/useClientKeyUsage';
import { estimateModelCost, estimateUsageCost, formatUsageCost } from '../../usageCost';
import styles from './Blocks.module.scss';

interface ApiKeyUsageSummaryProps {
  status: ClientKeyUsageStatus;
  usage: ClientKeyUsage | undefined;
}

/** One-line token count and estimated API cost shown in an API key row. */
export function ApiKeyUsageSummary({ status, usage }: ApiKeyUsageSummaryProps) {
  const { t, i18n } = useTranslation();
  if (status === 'unavailable') return null;

  const cost = usage ? estimateUsageCost(usage) : null;
  let text: string;
  if (status === 'loading') {
    text = t('config_management.visual.api_keys.usage.loading');
  } else if (!usage || usage.requests === 0) {
    text = t('config_management.visual.api_keys.usage.none');
  } else {
    const value = cost ? formatUsageCost(cost.total, i18n.language) : '';
    text = t('config_management.visual.api_keys.usage.summary', {
      tokens: formatCompactNumber(usage.totalTokens),
      cost: cost
        ? cost.unpricedModels.length > 0
          ? t('config_management.visual.api_keys.usage.partial_cost', { cost: value })
          : cost.fallbackModels.length > 0
            ? t('config_management.visual.api_keys.usage.fallback_cost', { cost: value })
            : value
        : t('config_management.visual.api_keys.usage.cost_unavailable'),
    });
  }
  return (
    <span className={styles.apiKeyUsage} data-usage-status={status}>
      {text}
    </span>
  );
}

interface ApiKeyUsageDetailsProps {
  usage: ClientKeyUsage | undefined;
  since: string | null;
  enabled: boolean;
}

/** Full breakdown of one key's usage, shown in the usage modal. */
export function ApiKeyUsageDetails({ usage, since, enabled }: ApiKeyUsageDetailsProps) {
  const { t, i18n } = useTranslation();
  const key = (name: string) => `config_management.visual.api_keys.usage.${name}`;
  const number = (value: number) => value.toLocaleString(i18n.language);

  const cost = usage ? estimateUsageCost(usage) : null;
  const money = (value: number | undefined) =>
    value === undefined ? t(key('cost_unavailable')) : formatUsageCost(value, i18n.language);
  const bucketMoney = (value: number | undefined) => {
    const formatted = money(value);
    if (cost?.unpricedModels.length) return t(key('partial_cost'), { cost: formatted });
    if (cost?.fallbackModels.length) return t(key('fallback_cost'), { cost: formatted });
    return formatted;
  };
  const unpricedModels = cost?.unpricedModels ?? usage?.models.map((model) => model.model) ?? [];
  const stats = usage
    ? [
        { label: t(key('total_tokens')), value: usage.totalTokens, cost: cost?.total },
        { label: t(key('input_tokens')), value: usage.inputTokens, cost: cost?.input },
        { label: t(key('cached_tokens')), value: usage.cachedTokens, cost: cost?.cached },
        { label: t(key('output_tokens')), value: usage.outputTokens, cost: cost?.output },
        { label: t(key('reasoning_tokens')), value: usage.reasoningTokens, cost: cost?.reasoning },
        {
          label: t(key('cache_write_tokens')),
          value: cost?.cacheWriteTokens,
          cost: cost?.cacheWrite,
        },
      ]
    : [];

  return (
    <div className={styles.apiKeyUsageDetails}>
      {!enabled && <div className="hint">{t(key('disabled_hint'))}</div>}
      {since && (
        <div className="hint">
          {t(key('since'), { date: formatDateTimeValue(since, i18n.language) })}
        </div>
      )}

      {!usage || usage.requests === 0 ? (
        <div className={styles.emptyState}>{t(key('none'))}</div>
      ) : (
        <>
          <div className={styles.apiKeyUsageCost}>
            <span>{t(key('api_cost'))}</span>
            <strong>{bucketMoney(cost?.total)}</strong>
          </div>
          <div className="hint">{t(key('cost_hint'))}</div>
          {!!cost?.fallbackModels.length && (
            <div className="hint">
              {t(key('fallback_hint'), {
                models: cost.fallbackModels
                  .map(({ model, pricingModel }) => `${model} → ${pricingModel}`)
                  .join(', '),
              })}
            </div>
          )}
          {unpricedModels.length > 0 && (
            <div className="hint">
              {t(key('unpriced_hint'), { models: unpricedModels.join(', ') })}
            </div>
          )}
          <dl className={styles.apiKeyUsageStats}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.apiKeyUsageStat}>
                <dt>{stat.label}</dt>
                <dd>{stat.value === undefined ? '?' : number(stat.value)}</dd>
                <dd className={styles.apiKeyTokenCost}>{bucketMoney(stat.cost)}</dd>
              </div>
            ))}
          </dl>
          {usage.lastUsedAt && (
            <div className="hint">
              {t(key('last_used'), { date: formatDateTimeValue(usage.lastUsedAt, i18n.language) })}
            </div>
          )}
          {usage.models.length > 0 && (
            <div className={styles.apiKeyUsageModelsScroll}>
              <table className={styles.apiKeyUsageModels}>
                <caption>{t(key('models'))}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t(key('model'))}</th>
                    <th scope="col">{t(key('api_cost'))}</th>
                    <th scope="col">{t(key('input_tokens'))}</th>
                    <th scope="col">{t(key('output_tokens'))}</th>
                    <th scope="col">{t(key('total_tokens'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.models.map((model) => {
                    const modelCost = estimateModelCost(model);
                    const value = money(modelCost?.total);
                    return (
                      <tr key={model.model}>
                        <th scope="row">{model.model}</th>
                        <td>
                          {modelCost?.fallback ? t(key('fallback_cost'), { cost: value }) : value}
                        </td>
                        <td>{number(model.inputTokens)}</td>
                        <td>{number(model.outputTokens)}</td>
                        <td>{number(model.totalTokens)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
