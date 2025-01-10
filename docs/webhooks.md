# Webhook Integration Guide

This guide explains how to integrate webhooks with the Replicate MCP Server for receiving updates about predictions.

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

const app = express();
app.use(express.json());

app.post("/webhooks/replicate", async (req, res) => {
  try {
    const { event, prediction } = req.body;
    
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
        console.warn(`Unknown event type: ${event}`);
    }

    // Return 200 OK quickly to acknowledge receipt
    res.status(200).send("OK");
  } catch (error) {
    // Log error for debugging
    console.error("Webhook processing failed:", error);
    
    // Return 500 error
    res.status(500).json({
      error: "Webhook processing failed",
      details: error instanceof Error ? error.message : String(error)
    });
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
  webhook_url: "https://api.yourapp.com/webhooks/replicate"
});
```

## Error Handling

When processing webhooks, implement proper error handling:

```typescript
app.post("/webhooks/replicate", async (req, res) => {
  try {
    const { event, prediction } = req.body;
    
    // Process webhook asynchronously
    processWebhookAsync(event, prediction).catch(error => {
      if (error instanceof ReplicateError) {
        console.error("Webhook processing failed:", error.message, error.context);
      } else {
        console.error("Unexpected error in webhook processing:", error);
      }
    });
    
    // Return success quickly
    res.status(200).send("OK");
  } catch (error) {
    if (error instanceof ReplicateError) {
      console.error("Webhook error:", error.message, error.context);
      res.status(400).json({
        error: error.message,
        context: error.context
      });
    } else {
      console.error("Unexpected webhook error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

async function processWebhookAsync(event: string, prediction: any) {
  try {
    switch (event) {
      case "prediction.completed":
        await handlePredictionCompleted(prediction);
        break;
      case "prediction.failed":
        await handlePredictionFailed(prediction);
        break;
      default:
        throw createError.validation("event", `Unknown event type: ${event}`);
    }
  } catch (error) {
    // Log error but don't throw since we're in an async context
    if (error instanceof ReplicateError) {
      console.error("Failed to process webhook:", error.message, error.context);
    } else {
      console.error("Unexpected error in webhook processing:", error);
    }
  }
}
```

## Best Practices

1. **Use HTTPS**
   - Always use HTTPS for webhook endpoints
   - Ensure proper TLS configuration

2. **Handle Errors Gracefully**
   - Use the `ReplicateError` class for consistent error handling
   - Include relevant context in error messages
   - Return appropriate status codes

3. **Process Asynchronously**
   - Handle webhook processing in the background
   - Return 200 OK quickly to acknowledge receipt
   - Use error handling in async handlers

4. **Monitor Webhook Health**
   - Log webhook deliveries and errors
   - Track success/failure rates
   - Monitor processing times
