# NexusGate - Backend

## Installation

### With docker-compose (Recommended)

Refer to README.md in project root.

**Image with `latest` tag is the latest release. If you are looking for a nightly build, use `main` tag**

### From sources

Ensure you have the latest bun installation and a production-ready PostgresSQL instance.

Edit `.env` file:

```shell
ADMIN_SUPER_SECRET=CHANGE_ME_IN_PRODUCTION
DATABASE_URL=postgres://nexusgate:your-password@databae:5432/nexusgate
REDIS_URL=redis://localhost:6379
```

Build from source:

```shell
cd /path/to/NexusGate/backend && \
bun install && \
NODE_ENV=production bun build src/index.ts --target bun --outdir out/
# Or simply
bun run build
```

You will get a standalone bundle in `out/index.js`, and start server with:

```shell
NODE_ENV=production bun run out/index.js
```

Alternatively, you can bundle `index.js` with `bun` into single executable (`linux-x64-musl` for example, **NOT TESTED in other target**):

```shell
NODE_ENV=production bun build src/index.ts --target bun-linux-x64-musl --outfile out/backend --compile
```

### Static files

`FRONTEND_DIR` and `DOCS_DIR` must point to trusted deployment trees. Keep
these trees read-only to untrusted users while the server is running. Symlinks
to files inside the same canonical root are supported; paths outside that root
return 404 rather than falling back to an HTML shell.

## Managing API keys by ID

Keep the numeric `id` returned by `POST /api/admin/apiKey` or
`PUT /api/admin/apiKey/by-external-id/:externalId`. The following routes require
the admin bearer credential, but never take or return the managed key's plaintext:

- `DELETE /api/admin/apiKey/by-id/:id` returns `{ "id": 42, "revoked": true, "alreadyRevoked": false }`
  on first revocation and `alreadyRevoked: true` on repeats. An unknown ID
  returns `404`. New inference requests using the revoked key return `401`;
  requests already admitted can finish. The external-ID ensure operation still
  explicitly reactivates a revoked key.
- `GET /api/admin/apiKey/by-id/:id/usage` returns all-time token totals for the
  given ID, including revoked and expired keys. An unknown ID returns `404`.

```json
{
  "id": 42,
  "generation": {
    "total_prompt_tokens": "120",
    "total_completion_tokens": "34"
  },
  "embeddings": {
    "total_input_tokens": "56"
  }
}
```

Generation covers Chat Completions, Messages and Responses. Embeddings are counted
separately. Totals are decimal strings, include retained soft-deleted usage
records, exclude unavailable (negative) counts, and return `"0"` for a field
with no known usage. This endpoint is not a live RPM/TPM bucket or a billing report.
The legacy `/api/admin/apiKey/:key/usage` route reports live RPM/TPM buckets.

Gateway access logs record the method, matched route template and status, not the
raw URL or credentials. Use the ID endpoints to keep keys out of URLs sent to
clients, proxies and other infrastructure as well.

## Anthropic token counting

`POST /v1/messages/count_tokens` uses the same gateway API key and request rate
limits as `POST /v1/messages`. It forwards the request to providers configured
with the `anthropic` protocol and rewrites `model` to the provider's model name.
If `X-NexusGate-Provider` or `model@provider` names an eligible provider, only
that provider is used. If the named provider is ineligible or unavailable for
the model, the gateway falls back to the other eligible providers.

The gateway tries up to three eligible providers, with a 30-second deadline per
attempt that includes reading the response body. A successful response contains
`input_tokens` as a nonnegative integer. HTTP `404`, `405`, `429`, `500`, `502`,
`503`, or `504`, timeouts, transient network failures, and malformed successful
responses can advance to another provider. If no attempt succeeds and there is
no nonretryable HTTP response, the gateway returns a generic `502`. It preserves
nonretryable upstream HTTP statuses but never returns their raw error bodies.
If no eligible Anthropic provider offers the requested model, the gateway
returns `404` without contacting an upstream.

## Initialization Configuration

NexusGate supports automatic initialization of upstreams through configuration files. This is especially useful for Docker deployments where you want to pre-configure the system.

### Enabling Initialization

Set the following environment variables:

```shell
# Enable the initialization feature (true/false)
ENABLE_INIT_CONFIG=true

# Optional: Path to initialization config file (default: ./init.json)
INIT_CONFIG_PATH=/path/to/your/init.json
```

### Configuration File Format

Create a JSON file with the following structure:

```json
{
  "upstreams": [
    {
      "name": "deepseek",
      "url": "https://api.deepseek.com",
      "model": "r1",
      "upstreamModel": "deepseek-reasoner",
      "apiKey": "sk-your-deepseek-key",
      "weight": 1,
      "comment": "DeepSeek R1 API"
    }
  ]
}
```

The system will only initialize once. After the first run, the configuration will be ignored unless you clear the initialization flag(INIT_CONFIG_FLAG) from the database.

To start a instance of backend:

## Contributing

NexusGate is built on Elysia.js, which depends on Bun. Ensure you have the latest bun installation.

A PostgreSQL database is required. We recommend to setup it with:

```shell
podman run -p 127.0.0.1:5432:5432 --name nexusgate-testdb -e POSTGRES_PASSWORD=password --POSTGRES_DB=testdb postgres:latest
```

A Redis instance is also required. We recommend to setup it with:

```shell
podman run -p 127.0.0.1:6379:6379 --name nexusgate-redis redis:latest
```

Edit `.env` file:

```shell
ADMIN_SUPER_SECRET=supa_admin_secret
DATABASE_URL=postgres://postgres:password@localhost:5432/testdb
REDIS_URL=redis://localhost:6379
```

To start a instance of backend:

```shell
bun run dev
```

Before committing, format with biome

```shell
biome format --fix
```
