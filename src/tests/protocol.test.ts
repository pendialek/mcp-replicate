/**
 * Protocol compliance tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "../transport/sse.js";
import { WebhookService } from "../services/webhook.js";
import { ReplicateClient } from "../replicate_client.js";
import { TemplateManager } from "../templates/manager.js";
import { ErrorHandler, ReplicateError } from "../services/error.js";
import { PredictionStatus } from "../models/prediction.js";

describe("Protocol Compliance", () => {
  let server: Server;
  let client: ReplicateClient;
  let webhookService: WebhookService;
  let templateManager: TemplateManager;
  let transport: StdioServerTransport;
  let sseTransport: SSEServerTransport;

  beforeEach(() => {
    // Initialize components
    client = new ReplicateClient();
    webhookService = new WebhookService();
    templateManager = new TemplateManager();
    transport = new StdioServerTransport();
    sseTransport = new SSEServerTransport();

    // Create server with test configuration
    server = new Server(
      {
        name: "replicate-test",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {
            schemes: [
              "replicate-model://",
              "replicate-prediction://",
              "replicate-collection://",
            ],
          },
          tools: {},
          prompts: {},
        },
      }
    );
  });

  afterEach(async () => {
    // Clean up
    await server.close();
    vi.clearAllMocks();
  });

  describe("Message Format", () => {
    it("should use JSON-RPC 2.0 format", async () => {
      const message = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
        id: 1,
      };

      expect(message.jsonrpc).toBe("2.0");
      expect(message).toHaveProperty("method");
      expect(message).toHaveProperty("params");
      expect(message).toHaveProperty("id");
    });

    it("should handle notifications without id", async () => {
      const notification = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
      };

      expect(notification.jsonrpc).toBe("2.0");
      expect(notification).toHaveProperty("method");
      expect(notification).toHaveProperty("params");
      expect(notification).not.toHaveProperty("id");
    });
  });

  describe("Error Handling", () => {
    it("should handle rate limit errors with retries", async () => {
      const rateLimitError = new ReplicateError("Rate limit exceeded", {
        retry_after: 1,
        remaining_requests: 0,
        reset_time: new Date(Date.now() + 1000).toISOString(),
      });

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
          max_attempts: 2,
          retry_if: (error) => error instanceof ReplicateError,
        }
      );

      expect(attempts).toBe(1);
      expect(result).toEqual({ models: [] });
    });

    it("should generate detailed error reports", () => {
      const error = new ReplicateError("Test error", {
        field: "test",
        value: 123,
      });

      const report = ErrorHandler.createErrorReport(error);
      expect(report).toMatchObject({
        name: "ReplicateError",
        message: "Test error",
        context: {
          field: "test",
          value: 123,
        },
        environment: expect.any(Object),
        timestamp: expect.any(String),
      });
    });

    it("should handle prediction status transitions", async () => {
      const prediction = {
        id: "test",
        status: PredictionStatus.Starting,
        version: "test-version",
      };

      const statusUpdates: PredictionStatus[] = [];
      const mockTransport = {
        notify: vi.fn().mockImplementation((notification) => {
          if (notification.method === "prediction/status") {
            statusUpdates.push(notification.params.status);
          }
        }),
      };

      // Simulate status transitions
      prediction.status = PredictionStatus.Processing;
      await mockTransport.notify({
        method: "prediction/status",
        params: { status: prediction.status },
      });

      prediction.status = PredictionStatus.Succeeded;
      await mockTransport.notify({
        method: "prediction/status",
        params: { status: prediction.status },
      });

      expect(statusUpdates).toEqual([
        PredictionStatus.Processing,
        PredictionStatus.Succeeded,
      ]);
      expect(mockTransport.notify).toHaveBeenCalledTimes(2);
    });
  });

  describe("Resource URIs", () => {
    it("should use valid URI schemes", () => {
      const modelUri = "replicate-model://owner/name";
      const predictionUri = "replicate-prediction://123";
      const collectionUri = "replicate-collection://slug";

      expect(() => new URL(modelUri)).not.toThrow();
      expect(() => new URL(predictionUri)).not.toThrow();
      expect(() => new URL(collectionUri)).not.toThrow();
    });

    it("should parse URI components correctly", () => {
      const modelUri = new URL("replicate-model://owner/name");
      expect(modelUri.protocol).toBe("replicate-model:");
      expect(modelUri.pathname).toBe("/owner/name");

      const predictionUri = new URL("replicate-prediction://123");
      expect(predictionUri.protocol).toBe("replicate-prediction:");
      expect(predictionUri.pathname).toBe("/123");

      const collectionUri = new URL("replicate-collection://slug");
      expect(collectionUri.protocol).toBe("replicate-collection:");
      expect(collectionUri.pathname).toBe("/slug");
    });
  });

  describe("SSE Transport", () => {
    it("should establish SSE connection", async () => {
      await sseTransport.connect();
      expect(sseTransport).toHaveProperty("emit");
    });

    it("should handle connection lifecycle", async () => {
      let connected = false;
      sseTransport.on("connected", () => {
        connected = true;
      });

      await sseTransport.connect();
      expect(connected).toBe(true);

      await sseTransport.disconnect();
      expect(connected).toBe(false);
    });

    it("should deliver messages", async () => {
      const messages: unknown[] = [];
      sseTransport.on("message", (msg) => {
        messages.push(msg);
      });

      await sseTransport.connect();
      await sseTransport.send({ jsonrpc: "2.0", method: "test", params: {} });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "test",
        params: {},
      });
    });

    it("should handle reconnection with backoff", async () => {
      const connectSpy = vi.spyOn(sseTransport as any, "connect");
      const disconnectSpy = vi.spyOn(sseTransport as any, "disconnect");

      // Simulate connection failures
      connectSpy.mockRejectedValueOnce(new Error("Connection failed"));
      connectSpy.mockRejectedValueOnce(new Error("Connection failed"));
      connectSpy.mockResolvedValueOnce(undefined);

      await sseTransport.connect();

      expect(connectSpy).toHaveBeenCalledTimes(3);
      expect(disconnectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Webhook Integration", () => {
    it("should validate webhook configuration", () => {
      const validConfig = {
        url: "https://example.com/webhook",
        secret: "1234567890abcdef1234567890abcdef",
        retries: 3,
        timeout: 5000,
      };

      const invalidConfig = {
        url: "not-a-url",
        secret: "too-short",
        retries: -1,
        timeout: 500,
      };

      expect(webhookService.validateWebhookConfig(validConfig)).toHaveLength(0);
      expect(webhookService.validateWebhookConfig(invalidConfig)).toHaveLength(
        4
      );
    });

    it("should handle webhook delivery with retries", async () => {
      const deliverySpy = vi.spyOn(webhookService as any, "deliverWebhook");
      deliverySpy
        .mockRejectedValueOnce(new Error("Delivery failed"))
        .mockResolvedValueOnce({ success: true });

      const webhookId = await webhookService.queueWebhook(
        {
          url: "https://example.com/webhook",
          retries: 1,
        },
        {
          type: "prediction.created",
          timestamp: new Date().toISOString(),
          data: { id: "123" },
        }
      );

      // Wait for delivery attempts
      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = webhookService.getDeliveryResults(webhookId);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
      expect(deliverySpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Template System", () => {
    it("should generate parameters from templates", () => {
      const prompt = "a photo of a mountain landscape at sunset";
      const params = templateManager.generateParameters(prompt, {
        quality: "quality",
        style: "photorealistic",
        size: "landscape",
      });

      expect(params).toHaveProperty("prompt");
      expect(params).toHaveProperty("negative_prompt");
      expect(params).toHaveProperty("width");
      expect(params).toHaveProperty("height");
      expect(params).toHaveProperty("num_inference_steps");
      expect(params).toHaveProperty("guidance_scale");
    });

    it("should suggest parameters based on prompt", () => {
      const prompt = "a detailed anime-style portrait";
      const suggestions = templateManager.suggestParameters(prompt);

      expect(suggestions.quality).toBe("quality");
      expect(suggestions.style).toBe("anime");
      expect(suggestions.size).toBe("portrait");
    });

    it("should validate template parameters", () => {
      const validTemplate = templateManager.generateParameters("test prompt", {
        quality: "quality",
        style: "photorealistic",
        size: "landscape",
      });

      const invalidTemplate = {
        ...validTemplate,
        width: -100, // Invalid width
      };

      expect(() =>
        templateManager.validateParameters(validTemplate)
      ).not.toThrow();
      expect(() =>
        templateManager.validateParameters(invalidTemplate)
      ).toThrow();
    });
  });
});
