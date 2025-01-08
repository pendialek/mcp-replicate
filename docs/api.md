# Replicate MCP Server API Reference

## Overview

The Replicate MCP Server provides a Model Context Protocol (MCP) interface to Replicate's AI model platform. This document details the available resources, tools, and methods for interacting with the server.

## Resources

Resources are identified by unique URIs and represent the core data types in the system.

### Models (`replicate-model://{owner}/{name}`)

Represents an AI model on Replicate.

#### Properties
- `id`: Unique identifier (owner/name)
- `owner`: Model owner/creator
- `name`: Model name
- `description`: Model description
- `visibility`: Public/private status
- `paper_url`: Optional link to research paper
- `license_url`: Optional link to license
- `latest_version`: Most recent version details
- `versions`: Array of model versions

#### Example
```typescript
{
  "id": "stability-ai/sdxl",
  "owner": "stability-ai",
  "name": "sdxl",
  "description": "A text-to-image generative AI model",
  "visibility": "public",
  "latest_version": {
    "id": "v1.0.0",
    "created_at": "2023-07-11T15:47:43.247Z",
    "cog_version": "0.3.0"
  }
}
```

### Predictions (`replicate-prediction://{id}`)

Represents a model execution instance.

#### Properties
- `id`: Unique prediction identifier
- `version`: Model version used
- `input`: Input parameters
- `status`: Current status (starting/processing/succeeded/failed)
- `output`: Results (when completed)
- `error`: Error details (if failed)
- `created_at`: Creation timestamp
- `started_at`: Execution start timestamp
- `completed_at`: Completion timestamp
- `urls`: Associated resource URLs
- `webhook_completed`: Webhook delivery status

#### Example
```typescript
{
  "id": "pred_123abc",
  "version": "stability-ai/sdxl@v1.0.0",
  "input": {
    "prompt": "A serene mountain landscape"
  },
  "status": "succeeded",
  "output": {
    "image": "https://replicate.com/output/123abc.png"
  },
  "created_at": "2024-01-10T12:00:00Z",
  "completed_at": "2024-01-10T12:01:30Z"
}
```

### Collections (`replicate-collection://{slug}`)

Represents a curated group of models.

#### Properties
- `slug`: Unique collection identifier
- `name`: Display name
- `description`: Collection description
- `models`: Array of included models

#### Example
```typescript
{
  "slug": "text-to-image",
  "name": "Text to Image Models",
  "description": "Models that generate images from text descriptions",
  "models": [
    {
      "id": "stability-ai/sdxl",
      "name": "SDXL"
    }
  ]
}
```

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

The server implements a comprehensive error handling system with detailed context and automatic recovery mechanisms.

### Error Types

#### ReplicateError
Base error class with enhanced context and stack traces.

#### RateLimitExceeded
```typescript
{
  code: "RateLimitExceeded",
  message: "Rate limit exceeded. Retry after 60 seconds.",
  context: {
    retry_after: 60,
    remaining_requests: 0,
    reset_time: "2024-01-10T12:30:00Z"
  }
}
```

#### AuthenticationError
```typescript
{
  code: "AuthenticationError",
  message: "Invalid or missing API token",
  context: {
    details: "Token expired"
  }
}
```

#### NotFoundError
```typescript
{
  code: "NotFoundError",
  message: "Resource not found: stability-ai/nonexistent-model",
  context: {
    resource: "stability-ai/nonexistent-model"
  }
}
```

#### PredictionError
```typescript
{
  code: "PredictionError",
  message: "Prediction failed: Invalid input parameters",
  context: {
    prediction_id: "pred_123abc",
    status: "failed",
    logs: "Error: prompt cannot be empty"
  }
}
```

#### ValidationError
```typescript
{
  code: "ValidationError",
  message: "Validation error for width: Must be between 512 and 2048",
  context: {
    field: "width",
    value: 256
  }
}
```

### Retry Mechanism

The server implements sophisticated retry logic with exponential backoff:

- Automatic retries for transient failures
- Configurable retry attempts (default: 3)
- Exponential backoff with jitter
- Smart retry decisions based on error type
- Detailed retry status logging

Example retry configuration:
```typescript
{
  max_attempts: 3,
  min_delay: 1000,    // 1 second
  max_delay: 10000,   // 10 seconds
  backoff_factor: 2,  // Exponential growth
  jitter: true       // Random delay variation
}
```

### Error Reporting

Comprehensive error reports include:
- Error type and message
- Detailed context
- Stack traces
- Timestamp information
- Request/response details
- System state information

## Caching

The server implements an intelligent caching system to improve performance and reduce API calls.

### Cache Types

#### Model Cache
- Caches model metadata and versions
- TTL-based invalidation (24 hours)
- Automatic refresh on updates
- Search results caching

#### Prediction Cache
- Smart caching based on prediction status
- Completed predictions cached indefinitely
- In-progress predictions refreshed frequently
- Status-aware cache invalidation

#### Collection Cache
- Collection metadata and models
- TTL-based invalidation (6 hours)
- Automatic refresh on collection updates

### Cache Features

- LRU (Least Recently Used) eviction
- Memory usage monitoring
- Cache statistics tracking
- Automatic cache warming
- Cache hit/miss metrics
- Configurable TTLs per resource type

### Cache Control

Headers for fine-grained cache control:
```typescript
{
  "Cache-Control": "max-age=3600",
  "ETag": "\"abc123\"",
  "Last-Modified": "Wed, 10 Jan 2024 12:00:00 GMT"
}
```

## Webhooks

The server supports webhooks for asynchronous notifications:

### Events
- `prediction.started`: Prediction execution began
- `prediction.completed`: Prediction finished successfully
- `prediction.failed`: Prediction encountered an error

### Payload Format
```typescript
{
  event: string,           // Event type
  prediction: Prediction,  // Full prediction object
  timestamp: string       // ISO timestamp
}
```

### Security
- HMAC signatures included in `X-Replicate-Signature` header
- Configurable retry policy for failed deliveries
- Delivery tracking and status monitoring

## Rate Limiting

The server implements sophisticated rate limiting:

### Limits
- Concurrent predictions per user
- API requests per minute
- Webhook delivery attempts

### Features
- Automatic request queuing
- Smart backoff strategies
- Request prioritization
- Rate limit headers
- Quota monitoring

### Headers
```typescript
{
  "X-RateLimit-Limit": "100",
  "X-RateLimit-Remaining": "95",
  "X-RateLimit-Reset": "1704891600"
}
```

Rate limit errors include retry-after headers and remaining quota information.
