/**
 * Integration tests with Replicate API.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReplicateClient } from "../replicate_client.js";
import { WebhookService } from "../services/webhook.js";
import { TemplateManager } from "../templates/manager.js";
import type { Model } from "../models/model.js";
import type { Prediction } from "../models/prediction.js";
import type { SchemaObject, PropertyObject } from "../models/openapi.js";
import type { WebhookEvent } from "../models/webhook.js";

describe("Replicate API Integration", () => {
  let client: ReplicateClient;
  let webhookService: WebhookService;
  let templateManager: TemplateManager;

  beforeEach(() => {
    client = new ReplicateClient();
    webhookService = new WebhookService();
    templateManager = new TemplateManager();
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
      testModel = models.models.find(
        (m) => m.owner === "stability-ai" && m.name === "sdxl"
      )!;
      expect(testModel).toBeDefined();
    });

    it("should create and track prediction", async () => {
      const prompt = "a photo of a mountain landscape at sunset";
      const params = templateManager.generateParameters(prompt, {
        quality: "draft", // Use draft quality for faster tests
        style: "photorealistic",
        size: "landscape",
      });

      // Create prediction
      const prediction = await client.createPrediction({
        version: testModel.latest_version!.id,
        input: params as Record<string, unknown>,
      });

      expect(prediction.id).toBeDefined();
      expect(prediction.status).toBe("starting");

      // Track prediction status
      let finalPrediction: Prediction | undefined;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (attempts < maxAttempts) {
        const status = await client.getPredictionStatus(prediction.id);
        if (
          status.status === "succeeded" ||
          status.status === "failed" ||
          status.status === "canceled"
        ) {
          finalPrediction = status;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      expect(finalPrediction).toBeDefined();
      if (finalPrediction?.status === "failed") {
        console.error("Prediction failed:", finalPrediction.error);
      }
      expect(finalPrediction?.status).toBe("succeeded");
      expect(finalPrediction?.output).toBeDefined();
    });

    it("should handle webhook notifications", async () => {
      const prompt = "a photo of a mountain landscape at sunset";
      const params = templateManager.generateParameters(prompt, {
        quality: "draft",
        style: "photorealistic",
        size: "landscape",
      });

      // Create mock webhook server
      const mockWebhook = {
        url: "https://example.com/webhook",
      };

      // Create prediction with webhook
      const prediction = await client.createPrediction({
        version: testModel.latest_version!.id,
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

      // Wait for delivery attempt
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check delivery results
      const results = webhookService.getDeliveryResults(webhookId);
      expect(results).toHaveLength(1);
      // Expect failure since we're using a mock URL
      expect(results[0].success).toBe(false);
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
      expect(collection.models.length).toBeGreaterThan(0);
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
