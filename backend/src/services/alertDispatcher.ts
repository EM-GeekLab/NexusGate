import { createTransport } from "nodemailer";
import { createLogger } from "@/utils/logger";
import type {
  AlertChannelConfig,
  AlertPayload,
  EmailChannelConfig,
  FeishuChannelConfig,
  WebhookChannelConfig,
  AlertChannelTypeEnumType,
} from "@/db/schema";

const logger = createLogger("alertDispatcher");

/**
 * Escape HTML special characters to prevent XSS in email templates
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Compute HMAC-SHA256 signature for webhook payloads
 */
async function computeHmacSha256(
  secret: string,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return Buffer.from(signature).toString("hex");
}

/**
 * Compute Feishu webhook signature.
 * Per Feishu docs: HMAC-SHA256 with key = "timestamp\nsecret", data = "", then Base64.
 */
async function computeFeishuSignature(
  timestamp: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(`${timestamp}\n${secret}`);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new Uint8Array(0));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Dispatch alert via webhook
 */
async function dispatchWebhook(
  config: WebhookChannelConfig,
  payload: AlertPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  if (config.secret) {
    const signature = await computeHmacSha256(config.secret, body);
    headers["X-Signature-256"] = `sha256=${signature}`;
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook failed: ${response.status} ${text}`);
  }
}

/**
 * Dispatch alert via email (SMTP)
 */
async function dispatchEmail(
  config: EmailChannelConfig,
  payload: AlertPayload,
): Promise<void> {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  const subject = `[NexusGate Alert] ${payload.ruleName}: ${payload.ruleType}`;
  const html = `
    <h2>NexusGate Alert</h2>
    <p><strong>Rule:</strong> ${escapeHtml(payload.ruleName)}</p>
    <p><strong>Type:</strong> ${escapeHtml(payload.ruleType)}</p>
    <p><strong>Message:</strong> ${escapeHtml(payload.message)}</p>
    <p><strong>Current Value:</strong> ${escapeHtml(String(payload.currentValue))}</p>
    <p><strong>Threshold:</strong> ${escapeHtml(String(payload.threshold))}</p>
    ${payload.details ? `<p><strong>Details:</strong> <pre>${escapeHtml(JSON.stringify(payload.details, null, 2))}</pre></p>` : ""}
  `;

  await transport.sendMail({
    from: config.from,
    to: config.to.join(", "),
    subject,
    html,
  });
}

/**
 * Dispatch alert via Feishu webhook
 */
async function dispatchFeishu(
  config: FeishuChannelConfig,
  payload: AlertPayload,
): Promise<void> {
  const body: Record<string, unknown> = {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: `NexusGate Alert: ${payload.ruleName}`,
        },
        template: "red",
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: [
              `**Type:** ${payload.ruleType}`,
              `**Message:** ${payload.message}`,
              `**Current Value:** ${payload.currentValue}`,
              `**Threshold:** ${payload.threshold}`,
            ].join("\n"),
          },
        },
      ],
    },
  };

  if (config.secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await computeFeishuSignature(timestamp, config.secret);
    Object.assign(body, { timestamp, sign: signature });
  }

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Feishu webhook failed: ${response.status} ${text}`);
  }
}

/**
 * Dispatch alert to a single channel based on its type
 */
export async function dispatchToChannel(
  channelType: AlertChannelTypeEnumType,
  config: AlertChannelConfig,
  payload: AlertPayload,
): Promise<void> {
  switch (channelType) {
    case "webhook":
      return dispatchWebhook(config as WebhookChannelConfig, payload);
    case "email":
      return dispatchEmail(config as EmailChannelConfig, payload);
    case "feishu":
      return dispatchFeishu(config as FeishuChannelConfig, payload);
    default:
      throw new Error(`Unsupported channel type: ${channelType as string}`);
  }
}

/**
 * Send a test notification to a channel
 */
export async function sendTestNotification(
  channelType: AlertChannelTypeEnumType,
  config: AlertChannelConfig,
): Promise<void> {
  const testPayload: AlertPayload = {
    ruleType: "test",
    ruleName: "Test Notification",
    message: "This is a test notification from NexusGate alert system.",
    currentValue: 0,
    threshold: 0,
  };

  await dispatchToChannel(channelType, config, testPayload);
  logger.info("Test notification sent successfully");
}
