/**
 * Data models for Replicate webhooks.
 */

import type { Prediction } from "./prediction.js";

/**
 * Types of events that can trigger webhooks.
 */
export type WebhookEventType = "start" | "output" | "logs" | "completed";

/**
 * Event-specific data payloads
 */
export interface WebhookEventData {
  start: {
    status: "starting";
  };
  output: {
    status: "processing" | "succeeded";
    output?: unknown;
  };
  logs: {
    status: "processing";
    logs: string;
  };
  completed: {
    status: "succeeded" | "failed" | "canceled";
    output?: unknown;
    error?: string;
  };
}

/**
 * A webhook event from Replicate.
 */
export interface WebhookEvent {
  /** Type of webhook event */
  type: WebhookEventType;
  /** ID of the prediction that triggered this event */
  prediction_id: string;
  /** When this event occurred */
  timestamp: string;
  /** Event-specific data payload */
  data: WebhookEventData[keyof WebhookEventData];
}

/**
 * The full payload of a webhook request.
 */
export interface WebhookPayload {
  /** The webhook event */
  event: WebhookEvent;
  /** Full prediction object at time of event */
  prediction: Prediction;
}
