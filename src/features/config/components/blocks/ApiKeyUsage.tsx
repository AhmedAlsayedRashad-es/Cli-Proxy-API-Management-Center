import { useTranslation } from 'react-i18next';
import type { ClientKeyUsage } from '@/services/api';
import { formatCompactNumber, formatDateTimeValue } from '@/utils/format';
import type { ClientKeyUsageStatus } from '../../hooks/useClientKeyUsage';
import styles from './Blocks.module.scss';

interface ApiKeyUsageSummaryProps {
  status: ClientKeyUsageStatus;
  usage: ClientKeyUsage | undefined;
}

/** One-line token and request count shown in an API key row. */
export function ApiKeyUsageSummary({ status, usage }: ApiKeyUsageSummaryProps) {
  const { t } = useTranslation();
  if (status === 'unavailable') return null;

  let text: string;
  if (status === 'loading') {
    text = t('config_management.visual.api_keys.usage.loading');
  } else if (!usage || usage.requests === 0) {
    text = t('config_management.visual.api_keys.usage.none');
  } else {
    text = t('config_management.visual.api_keys.usage.summary', {
      tokens: formatCompactNumber(usage.totalTokens),
      requests: formatCompactNumber(usage.requests),
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

  const stats: Array<{ label: string; value: number }> = usage
    ? [
        { label: t(key('total_tokens')), value: usage.totalTokens },
        { label: t(key('input_tokens')), value: usage.inputTokens },
        { label: t(key('output_tokens')), value: usage.outputTokens },
        { label: t(key('reasoning_tokens')), value: usage.reasoningTokens },
        { label: t(key('cached_tokens')), value: usage.cachedTokens },
        { label: t(key('requests')), value: usage.requests },
        { label: t(key('success')), value: usage.success },
        { label: t(key('failed')), value: usage.failed },
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
          <dl className={styles.apiKeyUsageStats}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.apiKeyUsageStat}>
                <dt>{stat.label}</dt>
                <dd>{number(stat.value)}</dd>
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
                    <th scope="col">{t(key('requests'))}</th>
                    <th scope="col">{t(key('input_tokens'))}</th>
                    <th scope="col">{t(key('output_tokens'))}</th>
                    <th scope="col">{t(key('total_tokens'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.models.map((model) => (
                    <tr key={model.model}>
                      <th scope="row">{model.model}</th>
                      <td>{number(model.requests)}</td>
                      <td>{number(model.inputTokens)}</td>
                      <td>{number(model.outputTokens)}</td>
                      <td>{number(model.totalTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
