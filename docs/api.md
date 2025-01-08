# API Reference

## Core Components

### ReplicateClient

The main client for interacting with the Replicate API through MCP.

```typescript
class ReplicateClient {
  constructor(options?: {
    apiToken?: string;
    baseUrl?: string;
    timeout?: number;
  });

  // Model Operations
  async listModels(options?: { owner?: string; cursor?: string }): Promise<ModelList>;
  async searchModels(query: string): Promise<ModelList>;
  async getModel(owner: string, name: string): Promise<Model>;

  // Prediction Operations
  async createPrediction(params: {
    version: string;
    input: Record<string, unknown>;
    webhook?: string;
  }): Promise<Prediction>;
  async getPredictionStatus(id: string): Promise<Prediction>;
  async cancelPrediction(id: string): Promise<void>;

  // Collection Operations
  async listCollections(cursor?: string): Promise<CollectionList>;
  async getCollection(slug: string): Promise<Collection>;
}
```

### TemplateManager

Manages templates and parameter generation for image generation.

```typescript
class TemplateManager {
  constructor(maxImageSize?: number);

  // Template Management
  getAvailablePresets(): {
    quality: QualityPreset[];
    style: StylePreset[];
    size: SizePreset[];
  };

  // Parameter Generation
  generateParameters(
    prompt: string,
    options?: TemplateOptions
  ): ImageGenerationParameters;

  // Parameter Validation
  validateParameters(
    parameters: ImageGenerationParameters,
    modelConstraints?: {
      min_width?: number;
      max_width?: number;
      min_height?: number;
      max_height?: number;
      step_size?: number;
      supported_schedulers?: string[];
    }
  ): string[];

  // Parameter Suggestions
  suggestParameters(prompt: string): TemplateOptions;
}
```

### WebhookService

Manages webhook delivery with retry logic and delivery tracking.

```typescript
class WebhookService {
  constructor();

  // Webhook Management
  async queueWebhook(
    config: Partial<WebhookConfig>,
    event: WebhookEvent
  ): Promise<string>;
  getDeliveryResults(webhookId: string): WebhookDeliveryResult[];
  validateWebhookConfig(config: WebhookConfig): string[];
}
```

## Types

### Models

```typescript
interface Model {
  owner: string;
  name: string;
  description?: string;
  visibility: "public" | "private";
  latest_version?: ModelVersion;
  versions?: ModelVersion[];
}

interface ModelVersion {
  id: string;
  created_at: string;
  cog_version: string;
  openapi_schema?: OpenAPISchema;
}

interface Collection {
  name: string;
  slug: string;
  description?: string;
  models: Model[];
}
```

### Predictions

```typescript
interface Prediction {
  id: string;
  version: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  urls?: {
    get: string;
    cancel?: string;
  };
  webhook_completed?: string;
}
```

### Templates

```typescript
interface TemplateOptions {
  quality?: "draft" | "balanced" | "quality" | "extreme";
  style?: string;
  size?: string;
  custom_size?: { width: number; height: number };
  seed?: number;
  num_outputs?: number;
}

interface ImageGenerationParameters {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  style_strength?: number;
  seed?: number;
  num_outputs?: number;
}
```

### Webhooks

```typescript
interface WebhookConfig {
  url: string;
  secret?: string;
  retries?: number;
  timeout?: number;
}

interface WebhookEvent {
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

type WebhookEventType =
  | "prediction.created"
  | "prediction.processing"
  | "prediction.succeeded"
  | "prediction.failed"
  | "prediction.canceled";

interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  retryCount: number;
  timestamp: string;
}
```

## Usage Examples

### Basic Model Operations

```typescript
const client = new ReplicateClient();

// List models
const models = await client.listModels();

// Search models
const results = await client.searchModels("text to image");

// Get model details
const model = await client.getModel("stability-ai", "sdxl");
```

### Creating Predictions

```typescript
// Initialize components
const client = new ReplicateClient();
const templateManager = new TemplateManager();

// Generate parameters
const params = templateManager.generateParameters(
  "a photo of a mountain landscape at sunset",
  {
    quality: "quality",
    style: "photorealistic",
    size: "landscape",
  }
);

// Create prediction
const prediction = await client.createPrediction({
  version: "model_version_id",
  input: params,
});

// Track status
let status = await client.getPredictionStatus(prediction.id);
while (status.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  status = await client.getPredictionStatus(prediction.id);
}
```

### Webhook Integration

```typescript
// Initialize webhook service
const webhookService = new WebhookService();

// Configure webhook
const config = {
  url: "https://example.com/webhook",
  secret: "your_webhook_secret",
  retries: 3,
  timeout: 10000,
};

// Queue webhook delivery
const webhookId = await webhookService.queueWebhook(config, {
  type: "prediction.created",
  timestamp: new Date().toISOString(),
  data: prediction,
});

// Check delivery results
const results = webhookService.getDeliveryResults(webhookId);
```

## Error Handling

The client uses standard error types for different failure scenarios:

```typescript
// API Errors
try {
  await client.createPrediction(params);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limiting
  } else if (error instanceof AuthenticationError) {
    // Handle auth failure
  } else if (error instanceof ValidationError) {
    // Handle invalid parameters
  } else {
    // Handle other errors
  }
}

// Webhook Errors
try {
  const errors = webhookService.validateWebhookConfig(config);
  if (errors.length > 0) {
    // Handle validation errors
  }
} catch (error) {
  // Handle delivery errors
}
```

## Best Practices

1. **Rate Limiting**: The client handles rate limiting automatically with exponential backoff. However, you should still implement proper error handling:
   ```typescript
   try {
     await client.createPrediction(params);
   } catch (error) {
     if (error instanceof RateLimitError) {
       console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
     }
   }
   ```

2. **Webhook Security**: Always use webhook secrets and validate signatures:
   ```typescript
   const config = {
     url: "https://example.com/webhook",
     secret: crypto.randomBytes(32).toString("hex"),
   };
   ```

3. **Parameter Validation**: Always validate parameters against model constraints:
   ```typescript
   const errors = templateManager.validateParameters(params, modelConstraints);
   if (errors.length > 0) {
     throw new ValidationError(errors.join(", "));
   }
   ```

4. **Resource Cleanup**: Cancel unused predictions to free up resources:
   ```typescript
   try {
     await client.cancelPrediction(predictionId);
   } catch (error) {
     console.error("Failed to cancel prediction:", error);
   }
   ```

5. **Error Recovery**: Implement proper error handling and recovery:
   ```typescript
   const MAX_RETRIES = 3;
   let attempts = 0;
   
   while (attempts < MAX_RETRIES) {
     try {
       const prediction = await client.createPrediction(params);
       break;
     } catch (error) {
       attempts++;
       if (attempts === MAX_RETRIES) {
         throw error;
       }
       await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
     }
   }
   ```

6. **Template Usage**: Use templates for consistent parameter generation:
   ```typescript
   // Let the template manager handle parameter generation
   const params = templateManager.generateParameters(prompt, {
     quality: "quality",
     style: "photorealistic",
   });
   
   // Instead of manually constructing parameters
   const params = {
     prompt,
     num_inference_steps: 50,
     guidance_scale: 7.5,
     // ... other parameters
   };
   ```

7. **Webhook Delivery**: Handle webhook delivery failures gracefully:
   ```typescript
   const results = webhookService.getDeliveryResults(webhookId);
   const lastAttempt = results[results.length - 1];
   
   if (!lastAttempt.success) {
     console.error(
       `Webhook delivery failed after ${lastAttempt.retryCount} attempts:`,
       lastAttempt.error
     );
     // Implement fallback notification mechanism
   }
   ```

8. **Resource Management**: Implement proper cleanup in your application lifecycle:
   ```typescript
   process.on("SIGINT", async () => {
     // Cancel any running predictions
     for (const predictionId of activePredictions) {
       try {
         await client.cancelPrediction(predictionId);
       } catch (error) {
         console.error(`Failed to cancel prediction ${predictionId}:`, error);
       }
     }
     process.exit(0);
   });
   ```

## Advanced Usage

### Real-time Updates with SSE

The client supports Server-Sent Events (SSE) for real-time prediction updates:

```typescript
const client = new ReplicateClient();

// Create prediction with SSE updates
const prediction = await client.createPrediction({
  version: "model_version_id",
  input: params,
});

// Subscribe to updates
client.on("prediction.update", (update) => {
  console.log(`Prediction ${update.id} status: ${update.status}`);
  if (update.output) {
    console.log("Generation complete:", update.output);
  }
});

// Start SSE connection
await client.connectSSE();
```

### Batch Processing

For batch operations, use the webhook system:

```typescript
const webhookService = new WebhookService();
const predictions = new Map<string, Prediction>();

// Create multiple predictions
for (const prompt of prompts) {
  const prediction = await client.createPrediction({
    version: "model_version_id",
    input: { prompt },
    webhook: "https://example.com/webhook",
  });
  
  predictions.set(prediction.id, prediction);
}

// Handle webhook notifications
app.post("/webhook", async (req, res) => {
  const event = req.body as WebhookEvent;
  const prediction = predictions.get(event.data.id);
  
  if (prediction) {
    if (event.type === "prediction.succeeded") {
      await processResult(event.data.output);
    } else if (event.type === "prediction.failed") {
      await handleFailure(event.data.error);
    }
  }
  
  res.sendStatus(200);
});
```

### Custom Template System

You can extend the template system with custom presets:

```typescript
class CustomTemplateManager extends TemplateManager {
  constructor() {
    super();
    this.registerCustomPresets();
  }

  private registerCustomPresets() {
    this.qualityPresets.custom = {
      name: "Custom Quality",
      description: "Custom quality settings",
      parameters: {
        num_inference_steps: 75,
        guidance_scale: 8.5,
        scheduler: "dpmsolver++",
      },
    };
  }

  generateParameters(
    prompt: string,
    options?: TemplateOptions
  ): ImageGenerationParameters {
    const params = super.generateParameters(prompt, options);
    
    // Add custom processing
    if (options?.quality === "custom") {
      params.negative_prompt = `${params.negative_prompt}, custom_negative_prompt`;
    }
    
    return params;
  }
}
```

For more examples and detailed documentation, see the [examples](./examples/) directory.
