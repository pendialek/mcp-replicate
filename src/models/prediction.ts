/**
 * Data models for Replicate predictions.
 */

/**
 * Status of a prediction.
 */
export enum PredictionStatus {
  Starting = "starting",
  Processing = "processing",
  Succeeded = "succeeded",
  Failed = "failed",
  Canceled = "canceled",
}

/**
 * Model input/output types
 */
export type ModelIO = Record<string, unknown>;

/**
 * Input parameters for creating a prediction.
 */
export interface PredictionInput {
  /** Model version to use for prediction */
  model_version: string;
  /** Model-specific input parameters */
  input: ModelIO;
  /** Optional template ID to use */
  template_id?: string;
  /** URL for webhook notifications */
  webhook_url?: string;
  /** Events to trigger webhooks */
  webhook_events?: string[];
  /** Whether to wait for prediction completion */
  wait?: boolean;
  /** Max seconds to wait if wait=True (1-60) */
  wait_timeout?: number;
  /** Whether to request streaming output */
  stream?: boolean;
}

/**
 * A prediction (model run) on Replicate.
 */
export interface Prediction {
  /** Unique identifier for this prediction */
  id: string;
  /** Model version used for this prediction */
  version: string;
  /** Current status of the prediction */
  status: PredictionStatus | string;
  /** Input parameters used for the prediction */
  input: ModelIO;
  /** Output from the prediction if completed */
  output?: ModelIO;
  /** Error message if prediction failed */
  error?: string;
  /** Execution logs from the prediction */
  logs?: string;
  /** When the prediction was created */
  created_at: string;
  /** When the prediction started processing */
  started_at?: string;
  /** When the prediction completed */
  completed_at?: string;
  /** Related API URLs for this prediction */
  urls: Record<string, string>;
  /** Performance metrics if available */
  metrics?: Record<string, number>;
  /** URL for streaming output if requested */
  stream_url?: string;
}
