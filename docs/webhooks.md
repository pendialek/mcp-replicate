# Webhook Integration Guide

This guide explains how to integrate webhooks with the Replicate MCP Server for receiving real-time updates about predictions and other events.

## Overview

Webhooks provide a way to receive asynchronous notifications about events in your Replicate predictions. Instead of polling for updates, your application can receive push notifications when important events occur.

## Supported Events

The server sends webhooks for the following events:

- `prediction.started`: When a prediction begins processing
- `prediction.completed`: When a prediction successfully completes
- `prediction.failed`: When a prediction encounters an error

## Webhook Payload

Each webhook delivery includes a JSON payload with event details:

```typescript
interface WebhookPayload {
  event: string;              // Event type
  prediction: {               // Prediction details
    id: string;              // Prediction ID
    version: string;         // Model version
    input: Record<string, any>; // Input parameters
    output?: any;            // Output data (for completed predictions)
    error?: string;          // Error message (for failed predictions)
    status: string;          // Current status
    created_at: string;      // Creation timestamp
    started_at?: string;     // Processing start timestamp
    completed_at?: string;   // Completion timestamp
  };
  timestamp: string;         // Event timestamp
}
```

## Setting Up Webhooks

### 1. Create a Webhook Endpoint

First, create an endpoint in your application to receive webhook notifications. Example using Express:

```typescript
import express from "express";
import { WebhookHandler, ErrorHandler } from "@replicate/mcp";

const app = express();
app.use(express.json());

app.post("/webhooks/replicate", async (req, res) => {
  try {
    // Verify webhook signature with enhanced error handling
    const signature = req.headers["x-replicate-signature"];
    const webhookSecret = await client.getWebhookSecret();
    
    if (!WebhookHandler.verifySignature(signature, webhookSecret, req.body)) {
      throw new ValidationError("Invalid webhook signature", {
        signature,
        payload: req.body
      });
    }

    // Process the webhook with comprehensive error handling
    const { event, prediction } = req.body;
    
    await ErrorHandler.withRetries(
      async () => {
        switch (event) {
          case "prediction.started":
            await handlePredictionStarted(prediction);
            break;
          case "prediction.completed":
            await handlePredictionCompleted(prediction);
            break;
          case "prediction.failed":
            await handlePredictionFailed(prediction);
            break;
          default:
            throw new ValidationError(`Unknown event type: ${event}`);
        }
      },
      {
        max_attempts: 3,
        min_delay: 1000,
        max_delay: 10000,
        backoff_factor: 2,
        jitter: true,
        retry_if: (error) => {
          // Retry on specific error types
          return error instanceof NetworkError ||
                 error instanceof DatabaseError;
        }
      }
    );

    res.status(200).send("OK");
  } catch (error) {
    // Enhanced error reporting
    console.error(ErrorHandler.createErrorReport(error));
    
    if (error instanceof ValidationError) {
      res.status(401).json({
        error: "Webhook validation failed",
        details: error.context
      });
    } else {
      res.status(500).json({
        error: "Webhook processing failed",
        details: error.message
      });
    }
  }
});
```

### 2. Configure Webhook URL

When creating a prediction, include your webhook URL:

```typescript
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A serene landscape"
  },
  webhook_url: "https://api.yourapp.com/webhooks/replicate",
  webhook_events: ["started", "completed", "failed"] // Optional event filtering
});
```

## Enhanced Security

### Signature Verification

Webhooks include a signature in the `X-Replicate-Signature` header. The WebhookHandler provides robust signature verification:

```typescript
class WebhookHandler {
  static verifySignature(
    signature: string | undefined,
    secret: string,
    payload: any,
    options = {
      clockTolerance: 300, // 5 minutes
      algorithm: "sha256"
    }
  ): boolean {
    try {
      if (!signature) {
        throw new ValidationError("Missing signature");
      }

      // Parse signature components
      const [timestamp, hash] = signature.split(",");
      if (!timestamp || !hash) {
        throw new ValidationError("Invalid signature format");
      }

      // Verify timestamp
      const eventTime = parseInt(timestamp, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      if (Math.abs(currentTime - eventTime) > options.clockTolerance) {
        throw new ValidationError("Signature timestamp expired");
      }

      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac(options.algorithm, secret)
        .update(`${timestamp}.${JSON.stringify(payload)}`)
        .digest("hex");

      // Constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      throw new ValidationError("Signature verification failed", {
        details: error.message
      });
    }
  }
}
```

## Enhanced Retry Logic

The server implements sophisticated retry logic for webhook deliveries:

```typescript
interface RetryConfig {
  max_attempts: number;      // Maximum retry attempts
  min_delay: number;         // Minimum delay in milliseconds
  max_delay: number;         // Maximum delay between retries
  backoff_factor: number;    // Exponential backoff multiplier
  jitter: boolean;          // Add random jitter to delays
  timeout: number;          // Request timeout
  retry_if: (error: Error) => boolean; // Custom retry condition
}

const defaultRetryConfig: RetryConfig = {
  max_attempts: 5,
  min_delay: 1000,
  max_delay: 60000,
  backoff_factor: 2,
  jitter: true,
  timeout: 10000,
  retry_if: (error) => {
    return error instanceof NetworkError ||
           error instanceof TimeoutError ||
           (error instanceof HttpError && error.status >= 500);
  }
};
```

### Retry Strategy

The retry mechanism uses exponential backoff with jitter:

```typescript
class WebhookDeliveryManager {
  async deliverWithRetries(
    webhook: Webhook,
    payload: WebhookPayload,
    config: RetryConfig
  ) {
    return ErrorHandler.withRetries(
      async () => {
        const response = await this.deliver(webhook, payload);
        if (!response.ok) {
          throw new HttpError(response.status, await response.text());
        }
        return response;
      },
      {
        max_attempts: config.max_attempts,
        min_delay: config.min_delay,
        max_delay: config.max_delay,
        backoff_factor: config.backoff_factor,
        jitter: config.jitter,
        retry_if: config.retry_if,
        on_retry: (error, attempt) => {
          console.warn(
            `Webhook delivery attempt ${attempt + 1} failed:`,
            error.message
          );
        }
      }
    );
  }
}
```

## Enhanced Monitoring

### Webhook Analytics

Track detailed webhook metrics:

```typescript
interface WebhookMetrics {
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  retry_count: number;
  average_latency: number;
  error_distribution: Record<string, number>;
}

class WebhookMonitor {
  private metrics: WebhookMetrics;

  trackDelivery(delivery: WebhookDelivery) {
    this.metrics.total_deliveries++;
    if (delivery.success) {
      this.metrics.successful_deliveries++;
    } else {
      this.metrics.failed_deliveries++;
      this.metrics.retry_count += delivery.attempts - 1;
      this.metrics.error_distribution[delivery.error?.name ?? "unknown"]++;
    }
    this.metrics.average_latency = this.calculateAverageLatency();
  }
}
```

### Enhanced Logging

Comprehensive webhook logging with context:

```typescript
interface WebhookDeliveryLog {
  id: string;
  event: string;
  url: string;
  status: number;
  attempt: number;
  timestamp: string;
  duration: number;
  request: {
    headers: Record<string, string>;
    body: any;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  error?: {
    name: string;
    message: string;
    stack: string;
    context: any;
  };
}
```

## Best Practices

1. **Enhanced Security**
   - Use HTTPS with strong TLS configuration
   - Implement rate limiting with token buckets
   - Rotate webhook secrets periodically
   - Monitor for suspicious patterns

2. **Reliability**
   - Implement circuit breakers for failing endpoints
   - Use webhook queuing with persistent storage
   - Monitor delivery success rates
   - Implement fallback notification methods

3. **Performance**
   - Process webhooks asynchronously
   - Use connection pooling
   - Implement request timeouts
   - Monitor resource usage

4. **Error Handling**
   ```typescript
   // Implement comprehensive error handling
   try {
     await processWebhook(payload);
   } catch (error) {
     if (error instanceof ValidationError) {
       // Handle validation errors
       console.error(error.getReport());
       await notifyAdmin(error);
     } else if (error instanceof DeliveryError) {
       // Handle delivery failures
       await scheduleRetry(error.delivery);
     } else {
       // Handle unexpected errors
       console.error(ErrorHandler.createErrorReport(error));
       await fallbackNotification(payload);
     }
   }
   ```

5. **Monitoring**
   ```typescript
   // Implement comprehensive monitoring
   class WebhookMonitor {
     async trackDelivery(delivery: WebhookDelivery) {
       // Track metrics
       this.updateMetrics(delivery);
       
       // Log delivery details
       await this.logDelivery(delivery);
       
       // Check for anomalies
       if (this.detectAnomaly(delivery)) {
         await this.notifyAdmin({
           type: "webhook_anomaly",
           delivery,
           metrics: this.getMetrics()
         });
       }
     }
   }
   ```
