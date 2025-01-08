/**
 * Webhook types and utilities.
 */

import crypto from "node:crypto";

export interface WebhookConfig {
  url: string;
  secret?: string;
  retries?: number;
  timeout?: number;
}

export interface WebhookEvent {
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export type WebhookEventType =
  | "prediction.created"
  | "prediction.processing"
  | "prediction.succeeded"
  | "prediction.failed"
  | "prediction.canceled";

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  retryCount: number;
  timestamp: string;
}

/**
 * Generate a webhook signature for request verification.
 */
export function generateWebhookSignature(
  payload: string,
  secret: string
): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verify a webhook signature from request headers.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Format a webhook event payload.
 */
export function formatWebhookEvent(
  type: WebhookEventType,
  data: Record<string, unknown>
): WebhookEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * Validate webhook configuration.
 */
export function validateWebhookConfig(config: WebhookConfig): string[] {
  const errors: string[] = [];

  // Validate URL
  try {
    new URL(config.url);
  } catch {
    errors.push("Invalid webhook URL");
  }

  // Validate secret
  if (config.secret && config.secret.length < 32) {
    errors.push("Webhook secret should be at least 32 characters long");
  }

  // Validate retries
  if (config.retries !== undefined) {
    if (!Number.isInteger(config.retries) || config.retries < 0) {
      errors.push("Retries must be a non-negative integer");
    }
  }

  // Validate timeout
  if (config.timeout !== undefined) {
    if (!Number.isInteger(config.timeout) || config.timeout < 1000) {
      errors.push("Timeout must be at least 1000ms");
    }
  }

  return errors;
}

/**
 * Default webhook configuration.
 */
export const DEFAULT_WEBHOOK_CONFIG: Partial<WebhookConfig> = {
  retries: 3,
  timeout: 10000, // 10 seconds
};

/**
 * Retry delay calculator with exponential backoff.
 */
export function calculateRetryDelay(attempt: number, baseDelay = 1000): number {
  const maxDelay = 60000; // 1 minute
  const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
}
