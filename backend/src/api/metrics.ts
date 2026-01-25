import { Elysia } from "elysia";
import { generatePrometheusMetrics } from "@/services/prometheus";

/**
 * Prometheus metrics endpoint
 * Exposes operational metrics in Prometheus exposition format
 *
 * SECURITY NOTE: This endpoint is intentionally public (no authentication required).
 * This is a deliberate design choice because:
 *
 * 1. Standard Practice: Prometheus metrics endpoints are typically unauthenticated
 *    to allow easy scraping by monitoring systems.
 *
 * 2. Operational Data Only: The metrics expose only aggregated operational data
 *    (request counts, latencies, token usage, error rates). No sensitive data
 *    like API keys, request/response content, or user data is exposed.
 *
 * 3. API Key Privacy: The `api_key_comment` label is used instead of the actual
 *    API key value, providing meaningful aggregation without exposing secrets.
 *
 * 4. Network Security: In production deployments, network-level security (firewall
 *    rules, VPC, ingress policies) should restrict access to the metrics endpoint
 *    to authorized monitoring systems only.
 *
 * If stricter security is required, consider:
 * - Using network policies to restrict access to Prometheus scrapers
 * - Deploying a metrics proxy with authentication
 * - Adding optional bearer token authentication via environment variable
 */
export const metricsApi = new Elysia().get(
  "/metrics",
  async () => {
    const metrics = await generatePrometheusMetrics();
    return new Response(metrics, {
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      },
    });
  },
  {
    detail: {
      description:
        "Prometheus metrics endpoint. Returns operational metrics in Prometheus exposition format.",
      tags: ["Metrics"],
    },
  },
);
