import { listApiKeys, listCompletions, sumCompletionTokenUsage, sumPromptTokenUsage } from '@/db';
import * as client from 'prom-client';
import { register } from 'prom-client';

const METRIC_PREFIX = 'nexusgate_';

const PROMPT_TOKENS_METRIC = `${METRIC_PREFIX}prompt_tokens`;
const COMPLETION_TOKENS_METRIC = `${METRIC_PREFIX}completion_tokens`;
const REQUESTS_METRIC = `${METRIC_PREFIX}requests`;
const TTFT_METRIC = `${METRIC_PREFIX}ttft`;

const promptTokensCounter = new client.Counter({
  name: PROMPT_TOKENS_METRIC,
  help: 'Number of tokens in prompts',
  labelNames: ['key'],
  registers: [register],
  collect: async () => {
    promptTokensCounter.reset();
    const apiKeys = await listApiKeys();
    for (const key of apiKeys) {
      const promptTokens = await sumPromptTokenUsage(key.id);
      if (promptTokens === null) {
        continue;
      }
      promptTokensCounter.labels(key.key).inc(Number(promptTokens.total_prompt_tokens));
    }
  }
});

const completionTokensCounter = new client.Counter({
  name: COMPLETION_TOKENS_METRIC,
  help: 'Number of tokens in completions',
  labelNames: ['key'],
  registers: [register],
  collect: async () => {
    completionTokensCounter.reset();
    const apiKeys = await listApiKeys();
    for (const key of apiKeys) {
      const completionTokens = await sumCompletionTokenUsage(key.id);
      if (completionTokens === null) {
        continue;
      }
      completionTokensCounter.labels(key.key).inc(Number(completionTokens.total_completion_tokens));
    }
  }
});

export const requestsCounter = new client.Counter({
  name: REQUESTS_METRIC,
  help: 'Total number of API requests',
  labelNames: ['status', 'model', 'key'],
  registers: [register],
});

export const ttftGauge = new client.Gauge({
  name: TTFT_METRIC,
  help: 'Time to first token in seconds',
  labelNames: ['key'],
  registers: [register],
});