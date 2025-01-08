/**
 * Data models for Replicate hardware options.
 */

/**
 * A hardware option for running models on Replicate.
 */
export interface Hardware {
  /** Human-readable name of the hardware */
  name: string;
  /** SKU identifier for the hardware */
  sku: string;
}

/**
 * Response format for listing hardware options.
 */
export interface HardwareList {
  /** List of available hardware options */
  hardware: Hardware[];
}
