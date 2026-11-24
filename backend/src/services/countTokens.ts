import type { ModelWithProvider } from "@/adapters/types";
import {
  DEFAULT_FAILOVER_CONFIG,
  isRetriableNetworkError,
  selectMultipleCandidates,
} from "@/services/failover";
import { extractUpstreamHeaders, filterCandidates } from "@/utils/api-helpers";
import { createLogger } from "@/utils/logger";
import { getProviderProxy, proxyFetch } from "@/utils/proxy-fetch";

const logger = createLogger("countTokens");
const RETRIABLE_STATUSES = new Set([404, 405, 429, 500, 502, 503, 504]);
const ATTEMPT_TIMEOUT_MS = 30_000;

type CountTokensRequest = {
  body: Record<string, unknown>;
  request: Request;
  modelsWithProviders: ModelWithProvider[];
  targetProvider?: string;
};

function countTokensError(
  status: number,
  message: string,
  type: "api_error" | "not_found_error" = "api_error",
) {
  return { status, body: { type: "error", error: { type, message } } };
}

export async function countAnthropicTokens({
  body,
  request,
  modelsWithProviders,
  targetProvider,
}: CountTokensRequest) {
  const clientSignal = request.signal;
  if (clientSignal.aborted) {
    return;
  }

  // Apply the target-provider policy only after discarding incompatible routes.
  const eligible = modelsWithProviders.filter(
    ({ provider }) => provider.type === "anthropic",
  );
  if (eligible.length === 0) {
    return countTokensError(
      404,
      "No Anthropic provider is available for this model",
      "not_found_error",
    );
  }

  const candidates = selectMultipleCandidates(
    filterCandidates(eligible, targetProvider),
    3,
  );
  const extraHeaders = extractUpstreamHeaders(request.headers);

  for (const { model, provider } of candidates) {
    if (clientSignal.aborted) {
      return;
    }

    const deadline = new AbortController();
    const signal = AbortSignal.any([clientSignal, deadline.signal]);
    const timer = setTimeout(() => {
      deadline.abort();
    }, ATTEMPT_TIMEOUT_MS);
    let response: Response | undefined;

    try {
      const baseUrl = provider.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
      response = await proxyFetch(
        `${baseUrl}/v1/messages/count_tokens`,
        {
          method: "POST",
          headers: {
            ...extraHeaders,
            "Content-Type": "application/json",
            "anthropic-version": provider.apiVersion || "2023-06-01",
            ...(provider.apiKey && { "x-api-key": provider.apiKey }),
          },
          body: JSON.stringify({
            ...body,
            model: model.remoteId ?? model.systemName,
          }),
          signal,
        },
        getProviderProxy(provider),
      );
      signal.throwIfAborted();

      if (!response.ok) {
        const { status } = response;
        const retryable = RETRIABLE_STATUSES.has(status);
        logger.warn("Upstream token counting returned an error status", {
          providerId: provider.id,
          status,
          retryable,
        });
        if (retryable) {
          continue;
        }
        return countTokensError(
          status,
          `Upstream token counting returned HTTP ${status}`,
        );
      }

      const payload: unknown = await response.json().catch(() => undefined);
      signal.throwIfAborted();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "input_tokens" in payload
      ) {
        const count = payload.input_tokens;
        if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
          return { status: 200, body: { input_tokens: count } };
        }
      }

      logger.warn("Upstream token counting returned an invalid response", {
        providerId: provider.id,
      });
    } catch (error) {
      if (clientSignal.aborted) {
        return;
      }

      const timedOut = deadline.signal.aborted;
      const retryable =
        timedOut ||
        (error instanceof Error &&
          isRetriableNetworkError(error, DEFAULT_FAILOVER_CONFIG));
      logger.warn("Upstream token counting request failed", {
        providerId: provider.id,
        timedOut,
        retryable,
      });
      if (!retryable) {
        break;
      }
    } finally {
      clearTimeout(timer);
      // Discard unread bodies without waiting on or logging the upstream.
      if (response && !response.bodyUsed) {
        void response.body?.cancel().catch(() => undefined);
      }
    }
  }

  return countTokensError(502, "Upstream token counting failed");
}
