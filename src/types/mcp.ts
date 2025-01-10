/**
 * Type definitions for MCP protocol.
 */

import { EventEmitter } from "node:events";

export interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params: Record<string, unknown>;
}

export interface MCPResponse extends MCPMessage {
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPNotification extends MCPMessage {
  method: string;
  params: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  mimeType?: string;
  text?: string;
}

export abstract class BaseTransport extends EventEmitter {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: MCPMessage): Promise<void>;
}
