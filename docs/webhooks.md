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
import crypto from "crypto";

const app = express();
app.use(express.json());

app.post("/webhooks/replicate", (req, res) => {
  // Verify webhook signature
  const signature = req.headers["x-replicate-signature"];
  if (!verifySignature(signature, webhookSecret, req.body)) {
    return res.status(401).send("Invalid signature");
  }

  // Process the webhook
  const { event, prediction } = req.body;
  
  switch (event) {
    case "prediction.started":
      console.log(`Prediction ${prediction.id} started processing`);
      break;
    case "prediction.completed":
      console.log(`Prediction ${prediction.id} completed:`, prediction.output);
      break;
    case "prediction.failed":
      console.error(`Prediction ${prediction.id} failed:`, prediction.error);
      break;
  }

  res.status(200).send("OK");
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
  webhook_url: "https://api.yourapp.com/webhooks/replicate"
});
```

## Security

### Signature Verification

Webhooks include a signature in the `X-Replicate-Signature` header. Verify this signature to ensure the webhook is legitimate:

```typescript
function verifySignature(
  signature: string | undefined,
  secret: string,
  payload: any
): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Best Practices

1. **Use HTTPS**: Always use HTTPS for webhook endpoints
2. **Validate Signatures**: Always verify webhook signatures
3. **Handle Timeouts**: Set appropriate timeout limits
4. **Implement Idempotency**: Handle duplicate deliveries gracefully
5. **Log Webhooks**: Maintain logs of webhook deliveries

## Retry Logic

The server implements automatic retries for failed webhook deliveries:

```typescript
interface RetryConfig {
  maxAttempts: number;      // Maximum retry attempts
  initialDelay: number;     // Initial delay in milliseconds
  maxDelay: number;         // Maximum delay between retries
  backoffFactor: number;    // Exponential backoff multiplier
}

const defaultRetryConfig: RetryConfig = {
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 60000,
  backoffFactor: 2
};
```

### Retry Strategy

1. First failure: Wait 1 second
2. Second failure: Wait 2 seconds
3. Third failure: Wait 4 seconds
4. Fourth failure: Wait 8 seconds
5. Fifth failure: Wait 16 seconds

After maxAttempts failures, the webhook is marked as failed in the prediction status.

## Monitoring

### Webhook Status

Track webhook delivery status in prediction details:

```typescript
const prediction = await client.getPrediction({
  prediction_id: "pred_123abc"
});

console.log("Webhook status:", prediction.webhook_completed);
```

### Delivery Logs

Access webhook delivery logs for debugging:

```typescript
interface WebhookDeliveryLog {
  id: string;
  event: string;
  url: string;
  status: number;
  attempt: number;
  timestamp: string;
  response?: string;
  error?: string;
}
```

## Error Handling

### Common Issues

1. **Invalid Signature**
   - Check webhook secret configuration
   - Verify payload formatting
   - Ensure clock synchronization

2. **Timeout Issues**
   - Increase server timeout limits
   - Implement async processing
   - Use webhook queuing

3. **Network Problems**
   - Implement circuit breakers
   - Use retry mechanisms
   - Monitor network stability

### Example Error Handler

```typescript
async function handleWebhookError(error: Error, delivery: WebhookDelivery) {
  // Log the error
  console.error(`Webhook delivery ${delivery.id} failed:`, error);

  // Check retry eligibility
  if (delivery.attempt < config.maxAttempts) {
    // Schedule retry
    const delay = Math.min(
      config.initialDelay * Math.pow(config.backoffFactor, delivery.attempt),
      config.maxDelay
    );
    
    setTimeout(() => retryDelivery(delivery), delay);
  } else {
    // Mark as permanently failed
    await markWebhookFailed(delivery);
  }
}
```

## Testing Webhooks

### Local Development

Use tools like ngrok for local webhook testing:

```bash
# Start ngrok
ngrok http 3000

# Use the provided URL in your webhook configuration
https://your-ngrok-url.ngrok.io/webhooks/replicate
```

### Test Mode

The server includes a test mode for webhook development:

```typescript
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: { prompt: "Test webhook" },
  webhook_url: "https://api.yourapp.com/webhooks/replicate",
  test_mode: true  // Sends test events immediately
});
```

## Webhook Management

### Updating Webhook URLs

Update webhook configuration for existing predictions:

```typescript
await client.updatePrediction({
  prediction_id: "pred_123abc",
  webhook_url: "https://new-url.com/webhooks"
});
```

### Disabling Webhooks

Remove webhook configuration:

```typescript
await client.updatePrediction({
  prediction_id: "pred_123abc",
  webhook_url: null
});
```

## Best Practices Summary

1. **Security**
   - Always use HTTPS
   - Verify signatures
   - Keep webhook secrets secure
   - Implement rate limiting

2. **Reliability**
   - Implement retry logic
   - Use webhook queuing
   - Monitor delivery status
   - Log webhook events

3. **Performance**
   - Process webhooks asynchronously
   - Implement timeout handling
   - Use appropriate server scaling
   - Monitor resource usage

4. **Maintenance**
   - Regular log rotation
   - Monitor failed deliveries
   - Update webhook URLs as needed
   - Test webhook endpoints
