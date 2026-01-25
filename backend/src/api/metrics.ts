import { Elysia } from "elysia";
import { generatePrometheusMetrics } from "@/services/prometheus";

/**
 * Prometheus metrics endpoint
 * Exposes operational metrics in Prometheus exposition format
 * Public endpoint (no authentication required)
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
