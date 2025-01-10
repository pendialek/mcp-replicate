# Replicate MCP Server API Reference

## Overview

The Replicate MCP Server provides a Model Context Protocol (MCP) interface to Replicate's AI model platform. This document details the available tools and methods for interacting with the server.

## Tools

### search_models

Search for models using semantic search.

#### Input Schema
```typescript
{
  query: string  // Search query
}
```

#### Example
```typescript
await client.searchModels({
  query: "high quality text to image models"
});
```

### list_models

List available models with optional filtering.

#### Input Schema
```typescript
{
  owner?: string,    // Filter by model owner
  cursor?: string    // Pagination cursor
}
```

#### Example
```typescript
await client.listModels({
  owner: "stability-ai"
});
```

### create_prediction

Create a new prediction using a model version.

#### Input Schema
```typescript
{
  version: string,           // Model version ID
  input: Record<string, any>,// Model input parameters
  webhook_url?: string      // Optional webhook URL
}
```

#### Example
```typescript
await client.createPrediction({
  version: "stability-ai/sdxl@v1.0.0",
  input: {
    prompt: "A serene mountain landscape"
  }
});
```

### cancel_prediction

Cancel a running prediction.

#### Input Schema
```typescript
{
  prediction_id: string  // ID of prediction to cancel
}
```

#### Example
```typescript
await client.cancelPrediction({
  prediction_id: "pred_123abc"
});
```

### get_prediction

Get details about a specific prediction.

#### Input Schema
```typescript
{
  prediction_id: string  // ID of prediction to get details for
}
```

#### Example
```typescript
await client.getPrediction({
  prediction_id: "pred_123abc"
});
```

## Templates

The server includes a template system for common parameter configurations.

### Quality Templates

Preset quality levels for image generation:
- `draft`: Fast, lower quality results
- `balanced`: Good balance of speed and quality
- `quality`: High quality output
- `extreme`: Maximum quality, slower generation

### Style Templates

Common artistic styles:
- `photographic`: Realistic photo-like images
- `digital-art`: Digital artwork style
- `cinematic`: Movie-like composition
- `anime`: Anime/manga style
- `painting`: Traditional painting styles

### Size Templates

Standard image dimensions:
- `square`: 1024x1024
- `portrait`: 832x1216
- `landscape`: 1216x832
- `widescreen`: 1344x768

## Error Handling

The server uses a simple error handling system with a single error class and clear error messages.

### ReplicateError

All errors from the Replicate API are instances of `ReplicateError`. This class provides a consistent way to handle errors across the API.

```typescript
class ReplicateError extends Error {
  name: "ReplicateError";
  message: string;
  context?: Record<string, unknown>;
}
```

### Error Factory Functions

The API provides factory functions to create standardized errors:

```typescript
const createError = {
  rateLimit: (retryAfter: number) =>
    new ReplicateError("Rate limit exceeded", { retryAfter }),

  authentication: (details?: string) =>
    new ReplicateError("Authentication failed", { details }),

  notFound: (resource: string) =>
    new ReplicateError("Model not found", { resource }),

  validation: (field: string, message: string) =>
    new ReplicateError("Invalid input parameters", { field, message }),

  timeout: (operation: string, ms: number) =>
    new ReplicateError("Operation timed out", { operation, timeoutMs: ms }),
};
```

### Example Error Handling

```typescript
try {
  const prediction = await client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "Test prompt" }
  });
} catch (error) {
  if (error instanceof ReplicateError) {
    console.error(error.message);
    // Access additional context if available
    if (error.context) {
      console.error("Error context:", error.context);
    }
  }
}
```

### Automatic Retries

The API includes built-in retry functionality for certain types of errors:

```typescript
const result = await ErrorHandler.withRetries(
  async () => client.listModels(),
  {
    maxAttempts: 3,
    minDelay: 1000,
    maxDelay: 30000,
    retryIf: (error) => error instanceof ReplicateError
  }
);
```

## Rate Limiting

The server implements basic rate limiting to prevent abuse. When rate limits are exceeded, the API returns a `ReplicateError` with the message "Rate limit exceeded" and includes a `retryAfter` value in the context.

### Limits
- API requests per minute
- Concurrent predictions per user

### Rate Limit Headers
```typescript
{
  "X-RateLimit-Limit": "100",     // Maximum requests per minute
  "X-RateLimit-Remaining": "95",  // Remaining requests
  "X-RateLimit-Reset": "1704891600" // Unix timestamp when limit resets
}
```
