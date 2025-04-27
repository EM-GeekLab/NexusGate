import { Elysia } from "elysia";

import { register } from "prom-client";

export const adminMetrics = new Elysia()
  .get(
    "/metrics",
     async () => {
      return register.metrics();
    }
  );
