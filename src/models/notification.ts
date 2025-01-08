/**
 * Notification types for MCP server.
 */

import type { MCPNotification, MCPResource } from "../types/mcp.js";
import type { Prediction, PredictionStatus } from "./prediction.js";

/**
 * Base notification interface with generic params type.
 */
export interface BaseNotification<
  T extends Record<string, unknown> = { resource?: MCPResource }
> extends MCPNotification {
  params: T;
}

/**
 * Resource notification interface.
 */
export interface ResourceNotification
  extends BaseNotification<{
    resource: MCPResource;
  }> {}

/**
 * Prediction status change notification.
 */
export interface PredictionStatusNotification extends ResourceNotification {
  method: "prediction/status";
  params: {
    resource: MCPResource;
    status: PredictionStatus;
    previous_status: PredictionStatus;
    prediction: Prediction;
  };
}

/**
 * Prediction progress notification.
 */
export interface PredictionProgressNotification extends ResourceNotification {
  method: "prediction/progress";
  params: {
    resource: MCPResource;
    progress: number;
    prediction: Prediction;
  };
}

/**
 * Prediction error notification.
 */
export interface PredictionErrorNotification extends ResourceNotification {
  method: "prediction/error";
  params: {
    resource: MCPResource;
    error: string;
    prediction: Prediction;
  };
}

/**
 * Session closed notification.
 */
export interface SessionClosedNotification
  extends BaseNotification<{
    reason: string;
  }> {
  method: "session/closed";
  params: {
    reason: string;
  };
}

/**
 * Create a prediction status notification.
 */
export function createPredictionStatusNotification(
  prediction: Prediction,
  previousStatus: PredictionStatus
): PredictionStatusNotification {
  return {
    jsonrpc: "2.0",
    method: "prediction/status",
    params: {
      resource: {
        uri: `replicate-prediction://${prediction.id}`,
        mimeType: "application/json",
        text: JSON.stringify(prediction),
      },
      status: prediction.status,
      previous_status: previousStatus,
      prediction,
    },
  };
}

/**
 * Create a prediction progress notification.
 */
export function createPredictionProgressNotification(
  prediction: Prediction,
  progress: number
): PredictionProgressNotification {
  return {
    jsonrpc: "2.0",
    method: "prediction/progress",
    params: {
      resource: {
        uri: `replicate-prediction://${prediction.id}`,
        mimeType: "application/json",
        text: JSON.stringify(prediction),
      },
      progress,
      prediction,
    },
  };
}

/**
 * Create a prediction error notification.
 */
export function createPredictionErrorNotification(
  prediction: Prediction,
  error: string
): PredictionErrorNotification {
  return {
    jsonrpc: "2.0",
    method: "prediction/error",
    params: {
      resource: {
        uri: `replicate-prediction://${prediction.id}`,
        mimeType: "application/json",
        text: JSON.stringify(prediction),
      },
      error,
      prediction,
    },
  };
}

/**
 * Create a session closed notification.
 */
export function createSessionClosedNotification(
  reason: string
): SessionClosedNotification {
  return {
    jsonrpc: "2.0",
    method: "session/closed",
    params: {
      reason,
    },
  };
}
