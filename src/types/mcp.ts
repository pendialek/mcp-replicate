/**
 * Type definitions for MCP protocol.
 */

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

export abstract class BaseTransport {
  protected listeners: Map<string, Set<(data: unknown) => void>>;

  constructor() {
    this.listeners = new Map();
  }

  protected emit(event: string, data?: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  public on(event: string, handler: (data: unknown) => void): void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
  }

  public off(event: string, handler: (data: unknown) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: MCPMessage): Promise<void>;
}
