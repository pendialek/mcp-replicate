# Replicate MCP Server Usage Examples

This document provides practical examples of common use cases for the Replicate MCP server.

## Basic Usage

### Generating Images with Text

```typescript
// Create a prediction with SDXL
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A serene mountain landscape at sunset",
    quality: "balanced",
    style: "photographic"
  }
});

// Get prediction status
const status = await client.getPrediction({
  prediction_id: prediction.id
});

// Cancel a running prediction if needed
await client.cancelPrediction({
  prediction_id: prediction.id
});
```

### Browsing Models

```typescript
// List all models (uses caching)
const models = await client.listModels({});

// Filter models by owner (cached by owner)
const stabilityModels = await client.listModels({
  owner: "stability-ai"
});

// Search for specific models (cached by query)
const searchResults = await client.searchModels({
  query: "text to image models with good quality"
});
```

### Working with Collections

```typescript
// List available collections (cached)
const collections = await client.listCollections({});

// Get details of a specific collection (cached by slug)
const textToImage = await client.getCollection({
  slug: "text-to-image"
});

// Browse models in a collection
const collectionModels = textToImage.models;
```

## Advanced Usage

### Using Templates

```typescript
// Using quality templates
const highQualityPrediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A futuristic cityscape",
    ...templates.quality.extreme,
    ...templates.style.cinematic,
    ...templates.size.widescreen
  }
});
```

### Webhook Integration

```typescript
// Create prediction with webhook notification
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "An abstract digital artwork"
  },
  webhook_url: "https://api.myapp.com/webhooks/replicate"
});

// Example webhook handler (Express.js)
app.post("/webhooks/replicate", async (req, res) => {
  try {
    const signature = req.headers["x-replicate-signature"];
    const webhookSecret = await client.getWebhookSecret();
    
    if (!verifyWebhookSignature(signature, webhookSecret, req.body)) {
      throw new ValidationError("Invalid signature");
    }

    const { event, prediction } = req.body;
    switch (event) {
      case "prediction.completed":
        await handleCompletedPrediction(prediction);
        break;
      case "prediction.failed":
        await handleFailedPrediction(prediction);
        break;
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error(ErrorHandler.createErrorReport(error));
    res.status(error instanceof ValidationError ? 401 : 500).json({
      error: error.message,
      code: error.name
    });
  }
});
```

### Enhanced Error Handling

```typescript
try {
  const prediction = await client.createPrediction({
    version: "invalid-model@latest",
    input: { prompt: "Test" }
  });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error("Model not found:", error.context.resource);
  } else if (error instanceof RateLimitExceeded) {
    console.error(
      `Rate limit exceeded. Try again in ${error.retry_after} seconds. `,
      `Remaining requests: ${error.remaining_requests}, `,
      `Reset time: ${error.reset_time}`
    );
  } else if (error instanceof ValidationError) {
    console.error(
      `Validation error for ${error.context.field}: `,
      error.context.value
    );
  } else if (error instanceof PredictionError) {
    console.error(
      `Prediction ${error.context.prediction_id} failed: `,
      error.context.logs
    );
  } else {
    // Generate detailed error report
    console.error(ErrorHandler.createErrorReport(error));
  }
}
```

### Automatic Retries with Backoff

```typescript
// Using built-in retry mechanism
const prediction = await ErrorHandler.withRetries(
  async () => {
    return client.createPrediction({
      version: "stability-ai/sdxl@latest",
      input: { prompt: "Test prompt" }
    });
  },
  {
    max_attempts: 3,
    min_delay: 1000,
    max_delay: 10000,
    backoff_factor: 2,
    jitter: true,
    retry_if: (error) => error instanceof RateLimitExceeded,
    on_retry: (error, attempt) => {
      console.warn(
        `Attempt ${attempt + 1} failed: ${error.message}. Retrying...`
      );
    }
  }
);
```

### Real-time Updates with SSE

```typescript
// Subscribe to prediction updates
const subscription = client.subscribe(`replicate-prediction://${prediction.id}`);

subscription.on("update", (update) => {
  console.log("Prediction status:", update.status);
  if (update.output) {
    console.log("Generated image URL:", update.output.image);
  }
});

subscription.on("error", (error) => {
  // Generate detailed error report
  console.error(ErrorHandler.createErrorReport(error));
});

// Cleanup when done
subscription.unsubscribe();
```

### Image Viewer Integration

```typescript
// Display an image in the system browser
await client.viewImage({
  url: "https://example.com/image.png"
});

// Get cache statistics
const stats = await client.getImageCacheStats();
console.log("Cache hits:", stats.hits);
console.log("Cache size:", stats.size);

// Clear the image cache
await client.clearImageCache();
```

### Cache Control

```typescript
// Working with cached data
async function getModelWithCache(owner: string, name: string) {
  try {
    // Attempt to get from cache first
    const model = await client.getModel(owner, name);
    console.log("Cache hit:", model.id);
    return model;
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.warn("Cache miss, fetching from API");
      // Handle cache miss
      return refreshModel(owner, name);
    }
    throw error;
  }
}

// Batch processing with cache
async function batchProcess(prompts: string[]) {
  return await ErrorHandler.withRetries(
    async () => {
      const predictions = await Promise.all(
        prompts.map(prompt =>
          client.createPrediction({
            version: "stability-ai/sdxl@latest",
            input: { prompt }
          })
        )
      );

      // Monitor all predictions (uses cache for completed predictions)
      return Promise.all(
        predictions.map(prediction =>
          client.getPredictionStatus(prediction.id)
        )
      );
    },
    {
      max_attempts: 3,
      on_retry: (error, attempt) => {
        console.warn(`Batch processing attempt ${attempt + 1} failed:`, error);
      }
    }
  );
}

// Usage
const prompts = [
  "A serene beach at sunset",
  "A mystical forest with glowing mushrooms",
  "A futuristic space station"
];

const results = await batchProcess(prompts);
```

## Best Practices

1. Always use proper error handling:
   ```typescript
   try {
     // Your code here
   } catch (error) {
     if (error instanceof ReplicateError) {
       // Handle specific error types
       console.error(error.getReport());
     } else {
       // Handle unexpected errors
       console.error(ErrorHandler.createErrorReport(error));
     }
   }
   ```

2. Implement proper retry logic:
   ```typescript
   const result = await ErrorHandler.withRetries(
     async () => {
       // Your API call here
     },
     {
       max_attempts: 3,
       retry_if: (error) => ErrorHandler.isRetryable(error)
     }
   );
   ```

3. Use caching effectively:
   - Let the client handle caching automatically
   - Cache is invalidated appropriately for each resource type
   - Completed predictions are cached indefinitely
   - In-progress predictions are refreshed frequently

4. Implement webhook security:
   ```typescript
   // Verify webhook signatures
   const isValid = await verifyWebhook(
     signature,
     await client.getWebhookSecret(),
     payload
   );
   ```

5. Monitor prediction status:
   ```typescript
   // Use status-aware caching
   const status = await client.getPredictionStatus(predictionId);
   if (status.status === "completed") {
     // Result is cached
   } else {
     // Status will be refreshed on next check
   }
   ```

6. Handle rate limits gracefully:
   ```typescript
   try {
     await makeRequest();
   } catch (error) {
     if (error instanceof RateLimitExceeded) {
       const { retry_after, remaining_requests, reset_time } = error;
       console.log(`Rate limit hit. Retry after ${retry_after}s`);
       // Implement backoff strategy
     }
   }
   ```

7. Use proper error context:
   ```typescript
   try {
     await makeRequest();
   } catch (error) {
     // Log detailed error information
     console.error(error.getReport());
     // Include stack trace and context
     console.error(error.context);
   }
   ```

8. Clean up resources:
   ```typescript
   const subscription = client.subscribe(resourceUri);
   try {
     // Use subscription
   } finally {
     // Always clean up
     subscription.unsubscribe();
   }
   ```
