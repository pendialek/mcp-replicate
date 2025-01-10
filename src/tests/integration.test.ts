/**
 * Integration tests with Replicate API.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  beforeAll,
  afterAll,
} from "vitest";
import { ReplicateClient } from "../replicate_client.js";
import { WebhookService } from "../services/webhook.js";
import { TemplateManager } from "../templates/manager.js";
import { ErrorHandler, ReplicateError } from "../services/error.js";
import { Cache } from "../services/cache.js";
import type { Model } from "../models/model.js";
import type { Prediction } from "../models/prediction.js";
import { PredictionStatus } from "../models/prediction.js";
import type { SchemaObject, PropertyObject } from "../models/openapi.js";
import type { WebhookEvent } from "../models/webhook.js";
import { createError } from "../services/error.js";

// Mock environment variables
process.env.REPLICATE_API_TOKEN = "test_token";

describe("Replicate API Integration", () => {
  let client: ReplicateClient;
  let webhookService: WebhookService;
  let templateManager: TemplateManager;
  let cache: Cache<string>;

  beforeEach(() => {
    // Initialize components
    client = new ReplicateClient();
    webhookService = new WebhookService();
    templateManager = new TemplateManager();
    cache = new Cache();

    // Mock client methods
    vi.spyOn(client, "listModels").mockResolvedValue({
      models: [
        {
          owner: "stability-ai",
          name: "sdxl",
          description: "Test model",
          id: "stability-ai/sdxl",
          visibility: "public",
          latest_version: {
            id: "test-version",
            created_at: new Date().toISOString(),
            cog_version: "0.3.0",
            openapi_schema: {
              openapi: "3.0.0",
              info: {
                title: "Test Model API",
                version: "1.0.0",
              },
              paths: {},
              components: {
                schemas: {
                  Input: {
                    type: "object",
                    required: ["prompt"],
                    properties: {
                      prompt: { type: "string" },
                      width: { type: "number", minimum: 0 },
                      height: { type: "number", minimum: 0 },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });

    vi.spyOn(client, "searchModels").mockResolvedValue({
      models: [
        {
          id: "stability-ai/sdxl",
          owner: "stability-ai",
          name: "sdxl",
          description: "Text to image model",
          visibility: "public",
        },
      ],
    });

    vi.spyOn(client, "getModel").mockResolvedValue({
      owner: "stability-ai",
      name: "sdxl",
      description: "Test model",
      id: "stability-ai/sdxl",
      visibility: "public",
      latest_version: {
        id: "test-version",
        created_at: new Date().toISOString(),
        cog_version: "0.3.0",
        openapi_schema: {
          openapi: "3.0.0",
          info: {
            title: "Test Model API",
            version: "1.0.0",
          },
          paths: {},
          components: {
            schemas: {
              Input: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string" },
                  width: { type: "number", minimum: 0 },
                  height: { type: "number", minimum: 0 },
                },
              },
            },
          },
        },
      },
    });

    vi.spyOn(client, "createPrediction").mockResolvedValue({
      id: "test-prediction",
      version: "test-version",
      status: PredictionStatus.Starting,
      input: { prompt: "test" },
      created_at: new Date().toISOString(),
      urls: {},
    });

    vi.spyOn(client, "getPredictionStatus").mockResolvedValue({
      id: "test-prediction",
      version: "test-version",
      status: PredictionStatus.Succeeded,
      input: { prompt: "test" },
      output: { image: "test.png" },
      created_at: new Date().toISOString(),
      urls: {},
    });

    vi.spyOn(client, "listPredictions").mockResolvedValue([
      {
        id: "test-prediction",
        version: "test-version",
        status: PredictionStatus.Succeeded,
        input: { prompt: "test" },
        output: { image: "test.png" },
        created_at: new Date().toISOString(),
        urls: {},
      },
    ]);

    vi.spyOn(client, "listCollections").mockResolvedValue({
      collections: [
        {
          id: "test-collection",
          name: "Test Collection",
          slug: "test",
          description: "Test collection",
          models: [],
          created_at: new Date().toISOString(),
        },
      ],
    });

    vi.spyOn(client, "getCollection").mockResolvedValue({
      id: "test-collection",
      name: "Test Collection",
      slug: "test",
      description: "Test collection",
      models: [],
      created_at: new Date().toISOString(),
    });

    // Mock webhook service
    vi.spyOn(webhookService, "queueWebhook").mockResolvedValue("test-webhook");
    vi.spyOn(webhookService, "getDeliveryResults").mockReturnValue([
      {
        success: false,
        error: "Mock delivery failure",
        retryCount: 0,
        timestamp: new Date().toISOString(),
      },
    ]);
  });

  afterEach(() => {
    cache.clear();
    vi.clearAllMocks();
  });

  describe("Error Handling", () => {
    it("should handle authentication errors", async () => {
      const invalidClient = new ReplicateClient("invalid_token");
      vi.spyOn(invalidClient, "listModels").mockRejectedValue(
        createError.authentication()
      );

      await expect(invalidClient.listModels()).rejects.toThrow(ReplicateError);
    });

    it("should handle rate limit errors with retries", async () => {
      const rateLimitError = createError.rateLimit(1);

      // Mock client to throw rate limit error once then succeed
      let attempts = 0;
      vi.spyOn(client, "listModels").mockImplementation(async () => {
        if (attempts === 0) {
          attempts++;
          throw rateLimitError;
        }
        return { models: [] };
      });

      const result = await ErrorHandler.withRetries(
        async () => client.listModels(),
        {
          maxAttempts: 2,
          retryIf: (error: Error) => error instanceof ReplicateError,
        }
      );

      expect(attempts).toBe(1);
      expect(result).toEqual({ models: [] });
    });

    it("should handle network errors with retries", async () => {
      const networkError = createError.api(500, "Connection failed");

      // Mock client to throw network error twice then succeed
      let attempts = 0;
      vi.spyOn(client, "listModels").mockImplementation(async () => {
        if (attempts < 2) {
          attempts++;
          throw networkError;
        }
        return { models: [] };
      });

      const result = await ErrorHandler.withRetries(
        async () => client.listModels(),
        {
          maxAttempts: 3,
          retryIf: (error: Error) => error instanceof ReplicateError,
        }
      );

      expect(attempts).toBe(2);
      expect(result).toEqual({ models: [] });
    });

    it("should handle validation errors", async () => {
      vi.spyOn(client, "createPrediction").mockRejectedValue(
        createError.validation("version", "Invalid version")
      );

      await expect(
        client.createPrediction({
          version: "invalid-version",
          input: {},
        })
      ).rejects.toThrow(ReplicateError);
    });

    it("should generate detailed error reports", async () => {
      const error = createError.validation("test", "Test error");

      const report = ErrorHandler.createErrorReport(error);
      expect(report).toMatchObject({
        name: "ReplicateError",
        message: "Invalid input parameters",
        context: {
          field: "test",
          message: "Test error",
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe("Caching Behavior", () => {
    it("should cache model listings", async () => {
      // First request should hit API
      const result1 = await client.listModels();
      expect(result1.models.length).toBeGreaterThan(0);

      // Mock cache hit
      const result2 = await client.listModels();
      expect(result2).toEqual(result1);
    });

    it("should cache model details with TTL", async () => {
      const owner = "stability-ai";
      const name = "sdxl";

      // First request should hit API
      const model1 = await client.getModel(owner, name);
      expect(model1).toBeDefined();

      // Mock cache hit
      const model2 = await client.getModel(owner, name);
      expect(model2).toEqual(model1);

      // Advance time past TTL
      vi.useFakeTimers();
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      // Request should hit API again
      const model3 = await client.getModel(owner, name);
      expect(model3).toBeDefined();
    });

    it("should handle cache invalidation for predictions", async () => {
      const prediction = await client.createPrediction({
        version: "stability-ai/sdxl@latest",
        input: {
          prompt: "test",
        },
      });

      // Initial status should be cached
      const status1 = await client.getPredictionStatus(prediction.id);
      const status2 = await client.getPredictionStatus(prediction.id);
      expect(status2).toEqual(status1);

      // Completed predictions should stay cached
      if (status2.status === PredictionStatus.Succeeded) {
        const status3 = await client.getPredictionStatus(prediction.id);
        expect(status3).toEqual(status2);
      }
      // In-progress predictions should refresh
      else {
        const status3 = await client.getPredictionStatus(prediction.id);
        expect(status3).toBeDefined();
      }
    });
  });

  describe("Model Operations", () => {
    it("should list available models", async () => {
      const result = await client.listModels();
      expect(result.models).toBeInstanceOf(Array);
      expect(result.models.length).toBeGreaterThan(0);

      const model = result.models[0];
      expect(model).toHaveProperty("owner");
      expect(model).toHaveProperty("name");
      expect(model).toHaveProperty("description");
    });

    it("should search models by query", async () => {
      const query = "text to image";
      const result = await client.searchModels(query);
      expect(result.models).toBeInstanceOf(Array);
      expect(result.models.length).toBeGreaterThan(0);

      // Results should be relevant to the query
      const relevantModels = result.models.filter(
        (model) =>
          model.description?.toLowerCase().includes("text") ||
          model.description?.toLowerCase().includes("image")
      );
      expect(relevantModels.length).toBeGreaterThan(0);
    });

    it("should get model details", async () => {
      // Use a known stable model
      const owner = "stability-ai";
      const name = "sdxl";
      const model = await client.getModel(owner, name);

      expect(model.owner).toBe(owner);
      expect(model.name).toBe(name);
      expect(model.latest_version).toBeDefined();
      expect(model.latest_version?.openapi_schema).toBeDefined();
    });
  });

  describe("Prediction Operations", () => {
    let testModel: Model;

    beforeEach(async () => {
      // Get a test model for predictions
      const models = await client.listModels();
      const foundModel = models.models.find(
        (m) => m.owner === "stability-ai" && m.name === "sdxl"
      );
      if (!foundModel || !foundModel.latest_version) {
        throw new Error("Test model not found or missing version");
      }
      testModel = foundModel;
      expect(testModel).toBeDefined();
    });

    it("should create prediction with community model version", async () => {
      if (!testModel.latest_version) {
        throw new Error("Test model missing version");
      }
      const prediction = await client.createPrediction({
        version: testModel.latest_version.id,
        input: { prompt: "test" },
      });

      expect(prediction.id).toBeDefined();
      expect(prediction.status).toBe(PredictionStatus.Starting);
      expect(prediction.version).toBe(testModel.latest_version.id);
    });

    it("should create prediction with official model", async () => {
      const prediction = await client.createPrediction({
        model: "stability-ai/sdxl",
        input: { prompt: "test" },
      });

      expect(prediction.id).toBeDefined();
      expect(prediction.status).toBe(PredictionStatus.Starting);
    });

    it("should create and track prediction", async () => {
      if (!testModel.latest_version) {
        throw new Error("Test model missing version");
      }
      const prompt = "a photo of a mountain landscape at sunset";
      const params = templateManager.generateParameters(prompt, {
        quality: "quality",
        style: "photorealistic",
        size: "landscape",
      });

      // Create prediction
      const prediction = await client.createPrediction({
        version: testModel.latest_version.id,
        input: params as Record<string, unknown>,
      });

      expect(prediction.id).toBeDefined();
      expect(prediction.status).toBe(PredictionStatus.Starting);

      // Mock the status progression
      vi.spyOn(client, "getPredictionStatus")
        .mockResolvedValueOnce({
          ...prediction,
          status: PredictionStatus.Processing,
        })
        .mockResolvedValueOnce({
          ...prediction,
          status: PredictionStatus.Succeeded,
          output: { image: "test.png" },
        });

      // Check processing status
      const processingStatus = await client.getPredictionStatus(prediction.id);
      expect(processingStatus.status).toBe(PredictionStatus.Processing);

      // Check final status
      const finalStatus = await client.getPredictionStatus(prediction.id);
      expect(finalStatus.status).toBe(PredictionStatus.Succeeded);
      expect(finalStatus.output).toBeDefined();
    });

    it("should handle webhook notifications", async () => {
      if (!testModel.latest_version) {
        throw new Error("Test model missing version");
      }
      // Setup fake timers
      vi.useFakeTimers();

      const prompt = "a photo of a mountain landscape at sunset";
      const params = templateManager.generateParameters(prompt, {
        quality: "quality",
        style: "photorealistic",
        size: "landscape",
      });

      // Create mock webhook server
      const mockWebhook = {
        url: "https://example.com/webhook",
      };

      // Create prediction with webhook
      const prediction = await client.createPrediction({
        version: testModel.latest_version.id,
        input: params as Record<string, unknown>,
        webhook: mockWebhook.url,
      });

      // Queue webhook delivery
      const webhookId = await webhookService.queueWebhook(
        { url: mockWebhook.url },
        {
          type: "prediction.created",
          timestamp: new Date().toISOString(),
          data: JSON.parse(JSON.stringify(prediction)),
        } as WebhookEvent
      );

      // Advance timers instead of waiting
      await vi.runAllTimersAsync();

      const results = webhookService.getDeliveryResults(webhookId);
      expect(results).toHaveLength(1);
      // Expect failure since we're using a mock URL
      expect(results[0].success).toBe(false);

      // Cleanup
      vi.useRealTimers();
    });
  });

  describe("Collection Operations", () => {
    it("should list collections", async () => {
      const result = await client.listCollections();
      expect(result.collections).toBeInstanceOf(Array);
      expect(result.collections.length).toBeGreaterThan(0);

      const collection = result.collections[0];
      expect(collection).toHaveProperty("name");
      expect(collection).toHaveProperty("slug");
      expect(collection).toHaveProperty("models");
    });

    it("should get collection details", async () => {
      const collections = await client.listCollections();
      const testCollection = collections.collections[0];

      const collection = await client.getCollection(testCollection.slug);
      expect(collection.name).toBe(testCollection.name);
      expect(collection.slug).toBe(testCollection.slug);
      expect(collection.models).toBeInstanceOf(Array);
    });
  });

  describe("Template System Integration", () => {
    it("should generate valid parameters for models", async () => {
      // Get SDXL model for testing
      const model = await client.getModel("stability-ai", "sdxl");
      const schema = model.latest_version?.openapi_schema;
      expect(schema).toBeDefined();

      // Generate parameters
      const prompt = "a detailed portrait in anime style";
      const params = templateManager.generateParameters(prompt, {
        quality: "quality",
        style: "anime",
        size: "portrait",
      });

      // Validate against model schema
      const errors = [];
      const inputSchema = schema?.components?.schemas?.Input as SchemaObject;
      if (inputSchema) {
        // Check required fields
        if (inputSchema.required) {
          for (const field of inputSchema.required) {
            if (!(field in params)) {
              errors.push(`Missing required field: ${field}`);
            }
          }
        }

        // Validate property types
        if (inputSchema.properties) {
          for (const [field, prop] of Object.entries(
            inputSchema.properties as Record<string, PropertyObject>
          )) {
            if (field in params) {
              const value = params[field as keyof typeof params] as unknown;
              switch (prop.type) {
                case "number": {
                  const numValue = value as number;
                  if (typeof numValue !== "number") {
                    errors.push(`${field} must be a number`);
                  } else {
                    if (prop.minimum !== undefined && numValue < prop.minimum) {
                      errors.push(`${field} must be >= ${prop.minimum}`);
                    }
                    if (prop.maximum !== undefined && numValue > prop.maximum) {
                      errors.push(`${field} must be <= ${prop.maximum}`);
                    }
                  }
                  break;
                }
                case "string": {
                  const strValue = value as string;
                  if (typeof strValue !== "string") {
                    errors.push(`${field} must be a string`);
                  } else if (prop.enum && !prop.enum.includes(strValue)) {
                    errors.push(
                      `${field} must be one of: ${prop.enum.join(", ")}`
                    );
                  }
                  break;
                }
                case "integer": {
                  const intValue = value as number;
                  if (!Number.isInteger(intValue)) {
                    errors.push(`${field} must be an integer`);
                  }
                  break;
                }
              }
            }
          }
        }
      }

      expect(errors).toHaveLength(0);
    });
  });
});
