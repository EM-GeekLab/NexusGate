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