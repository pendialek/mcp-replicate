/**
 * Data models for Replicate collections.
 */

import type { Model } from "./model.js";

/**
 * A collection of related models on Replicate.
 */
export interface Collection {
  /** Unique identifier for this collection */
  id: string;
  /** Human-readable name of the collection */
  name: string;
  /** URL-friendly slug for the collection */
  slug: string;
  /** Description of the collection's purpose */
  description?: string;
  /** Models included in this collection */
  models: Model[];
  /** Whether this collection is featured */
  featured?: boolean;
  /** When this collection was created */
  created_at: string;
  /** When this collection was last updated */
  updated_at?: string;
}

/**
 * Response format for listing collections.
 */
export interface CollectionList {
  /** List of collections */
  collections: Collection[];
  /** Cursor for pagination */
  next_cursor?: string;
  /** Total number of collections */
  total_count?: number;
} 
