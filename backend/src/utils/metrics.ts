import { listApiKeys, listCompletions, sumCompletionTokenUsage, sumPromptTokenUsage } from "@/db";
import * as client from "prom-client";
import { register } from "prom-client";

const METRIC_PREFIX = "nexusgate_";

const PROMPT_TOKENS_METRIC = `${METRIC_PREFIX}prompt_tokens`;
const COMPLETION_TOKENS_METRIC = `${METRIC_PREFIX}completion_tokens`;
const REQUESTS_METRIC = `${METRIC_PREFIX}requests`;
const TTFT_METRIC = `${METRIC_PREFIX}ttft`;

const promptTokensCounter = new client.Counter({
  name: PROMPT_TOKENS_METRIC,
  help: "Number of tokens in prompts",
  labelNames: ["keyId"],
  registers: [register],
  collect: async function () {
    this.reset();
    const apiKeys = await listApiKeys();
    for (const key of apiKeys) {
      const promptTokens = await sumPromptTokenUsage(key.id);
      this.labels(key.id.toString()).inc(Number(promptTokens?.total_prompt_tokens ?? 0));
    }
  },
});

const completionTokensCounter = new client.Counter({
  name: COMPLETION_TOKENS_METRIC,
  help: "Number of tokens in completions",
  labelNames: ["keyId"],
  registers: [register],
  collect: async function () {
    this.reset();
    const apiKeys = await listApiKeys();
    for (const key of apiKeys) {
      const completionTokens = await sumCompletionTokenUsage(key.id);
      this.labels(key.id.toString()).inc(Number(completionTokens?.total_completion_tokens ?? 0));
    }
  },
});

export const requestsCounter = new client.Counter({
  name: REQUESTS_METRIC,
  help: "Total number of API requests",
  labelNames: ["status", "model", "keyId"],
  registers: [register],
});

export const ttftGauge = new client.Gauge({
  name: TTFT_METRIC,
  help: "Time to first token in seconds",
  labelNames: ["keyId"],
  registers: [register],
});
