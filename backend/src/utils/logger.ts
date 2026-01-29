import { LogLayer } from "loglayer";
import { getSimplePrettyTerminal } from "@loglayer/transport-simple-pretty-terminal";

/**
 * Global LogLayer instance with pretty terminal output
 */
export const log = new LogLayer({
  transport: getSimplePrettyTerminal({
    runtime: "node",
    viewMode: "inline",
  }),
});

/**
 * Logger wrapper that provides consola-compatible API.
 * Supports both `logger.info("message")` and `logger.info("message", data)` patterns.
 */
export interface Logger {
  debug(message: string, ...data: unknown[]): void;
  info(message: string, ...data: unknown[]): void;
  warn(message: string, ...data: unknown[]): void;
  error(message: string, ...data: unknown[]): void;
  trace(message: string, ...data: unknown[]): void;
  fatal(message: string, ...data: unknown[]): void;
  withMetadata(metadata: Record<string, unknown>): Logger;
  child(): Logger;
}

/**
 * Creates a logger wrapper around LogLayer that supports consola-style API.
 * Handles the pattern: logger.info("message", { data }) by using withMetadata.
 */
function createLoggerWrapper(logLayer: LogLayer): Logger {
  const createMethod = (level: "debug" | "info" | "warn" | "error" | "trace" | "fatal") => {
    return (message: string, ...data: unknown[]) => {
      if (data.length > 0) {
        // If there's additional data, attach it as metadata
        const metadata: Record<string, unknown> = {};
        data.forEach((item, index) => {
          if (item !== null && item !== undefined) {
            if (typeof item === "object" && !Array.isArray(item) && !(item instanceof Error)) {
              // Spread object properties into metadata
              Object.assign(metadata, item);
            } else if (item instanceof Error) {
              // Handle Error objects specially
              metadata.error = item;
              metadata.errorMessage = item.message;
              metadata.errorStack = item.stack;
            } else {
              // For primitives and arrays, use indexed key
              metadata[`arg${index}`] = item;
            }
          }
        });
        logLayer.withMetadata(metadata)[level](message);
      } else {
        logLayer[level](message);
      }
    };
  };

  return {
    debug: createMethod("debug"),
    info: createMethod("info"),
    warn: createMethod("warn"),
    error: createMethod("error"),
    trace: createMethod("trace"),
    fatal: createMethod("fatal"),
    withMetadata(metadata: Record<string, unknown>): Logger {
      return createLoggerWrapper(logLayer.withMetadata(metadata) as unknown as LogLayer);
    },
    child(): Logger {
      return createLoggerWrapper(logLayer.child());
    },
  };
}

/**
 * Creates a child logger with a specific tag/context.
 * This is equivalent to consola.withTag("tagName").
 *
 * @param tag - The tag/context name for the logger
 * @returns A Logger instance with the tag set as context
 */
export function createLogger(tag: string): Logger {
  return createLoggerWrapper(log.child().withContext({ tag }));
}
