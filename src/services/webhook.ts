/**
 * Webhook delivery service.
 */

import {
  type WebhookConfig,
  type WebhookEvent,
  type WebhookDeliveryResult,
  DEFAULT_WEBHOOK_CONFIG,
  generateWebhookSignature,
  calculateRetryDelay,
  validateWebhookConfig,
} from "../models/webhook.js";

interface QueuedWebhook {
  id: string;
  config: WebhookConfig;
  event: WebhookEvent;
  retryCount: number;
  lastAttempt?: Date;
  nextAttempt?: Date;
}

/**
 * Service for managing webhook deliveries with retry logic.
 */
export class WebhookService {
  private queue: Map<string, QueuedWebhook>;
  private processing: boolean;
  private deliveryResults: Map<string, WebhookDeliveryResult[]>;

  constructor() {
    this.queue = new Map();
    this.processing = false;
    this.deliveryResults = new Map();
  }

  /**
   * Validate webhook configuration.
   */
  validateWebhookConfig(config: WebhookConfig): string[] {
    return validateWebhookConfig(config);
  }

  /**
   * Queue a webhook event for delivery.
   */
  async queueWebhook(
    config: Partial<WebhookConfig>,
    event: WebhookEvent
  ): Promise<string> {
    const id = crypto.randomUUID();
    const fullConfig = {
      ...DEFAULT_WEBHOOK_CONFIG,
      ...config,
    } as WebhookConfig;

    this.queue.set(id, {
      id,
      config: fullConfig,
      event,
      retryCount: 0,
    });

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue().catch(console.error);
    }

    return id;
  }

  /**
   * Get delivery results for a webhook.
   */
  getDeliveryResults(webhookId: string): WebhookDeliveryResult[] {
    return this.deliveryResults.get(webhookId) || [];
  }

  /**
   * Process the webhook queue.
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    try {
      while (this.queue.size > 0) {
        const now = new Date();
        const readyWebhooks = Array.from(this.queue.values()).filter(
          (webhook) => !webhook.nextAttempt || webhook.nextAttempt <= now
        );

        if (readyWebhooks.length === 0) {
          // No webhooks ready for delivery, wait for the next one
          const nextAttempt = Math.min(
            ...Array.from(this.queue.values())
              .map((w) => w.nextAttempt?.getTime() || Date.now())
              .filter((t) => t > Date.now())
          );
          await new Promise((resolve) =>
            setTimeout(resolve, nextAttempt - Date.now())
          );
          continue;
        }

        // Process ready webhooks in parallel
        await Promise.all(
          readyWebhooks.map((webhook) => this.deliverWebhook(webhook))
        );
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Attempt to deliver a webhook.
   */
  private async deliverWebhook(webhook: QueuedWebhook): Promise<void> {
    const { id, config, event, retryCount } = webhook;
    const payload = JSON.stringify(event);

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "MCP-Replicate-Webhook/1.0",
      "X-Webhook-ID": id,
      "X-Event-Type": event.type,
      "X-Timestamp": event.timestamp,
    };

    // Add signature if secret is provided
    if (config.secret) {
      headers["X-Signature"] = generateWebhookSignature(payload, config.secret);
    }

    try {
      // Attempt delivery with timeout
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.timeout || DEFAULT_WEBHOOK_CONFIG.timeout
      );

      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Record result
      const result: WebhookDeliveryResult = {
        success: response.ok,
        statusCode: response.status,
        retryCount,
        timestamp: new Date().toISOString(),
      };

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      this.recordDeliveryResult(id, result);

      // Handle failed delivery
      const maxRetries = config.retries ?? DEFAULT_WEBHOOK_CONFIG.retries ?? 3;
      if (!response.ok && retryCount < maxRetries) {
        // Schedule retry
        const delay = calculateRetryDelay(retryCount);
        webhook.retryCount++;
        webhook.lastAttempt = new Date();
        webhook.nextAttempt = new Date(Date.now() + delay);
        return;
      }

      // Delivery succeeded or max retries reached
      this.queue.delete(id);
    } catch (error) {
      // Record error result
      const result: WebhookDeliveryResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryCount,
        timestamp: new Date().toISOString(),
      };

      this.recordDeliveryResult(id, result);

      // Handle error
      const maxRetries = config.retries ?? DEFAULT_WEBHOOK_CONFIG.retries ?? 3;
      if (retryCount < maxRetries) {
        // Schedule retry
        const delay = calculateRetryDelay(retryCount);
        webhook.retryCount++;
        webhook.lastAttempt = new Date();
        webhook.nextAttempt = new Date(Date.now() + delay);
        return;
      }

      // Max retries reached
      this.queue.delete(id);
    }
  }

  /**
   * Record a delivery result.
   */
  private recordDeliveryResult(
    webhookId: string,
    result: WebhookDeliveryResult
  ): void {
    const results = this.deliveryResults.get(webhookId) || [];
    results.push(result);
    this.deliveryResults.set(webhookId, results);

    // Clean up old results (keep last 10)
    if (results.length > 10) {
      results.splice(0, results.length - 10);
    }
  }
}
