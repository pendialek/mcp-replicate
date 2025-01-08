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

The server uses standard MCP error codes:

- `InvalidRequest`: Malformed request or invalid parameters
- `MethodNotFound`: Unknown tool or method
- `ResourceNotFound`: Requested resource doesn't exist
- `RateLimitExceeded`: API rate limit reached
- `InternalError`: Server-side error
- `AuthenticationError`: Invalid or missing API token

Each error includes:
- `code`: Error type identifier
- `message`: Human-readable error description
- `data`: Optional additional error details

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

The server implements rate limiting based on Replicate's API constraints:

- Concurrent predictions per user
- API requests per minute
- Webhook delivery attempts

Rate limit errors include retry-after headers and remaining quota information.
