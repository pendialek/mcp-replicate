/**
 * Server-Sent Events (SSE) transport implementation for MCP.
 */

import { BaseTransport } from "../types/mcp.js";
import type {
  MCPMessage,
  MCPNotification,
  MCPRequest,
  MCPResponse,
  MCPResource,
} from "../types/mcp.js";
import { EventEmitter } from "node:events";

interface MessageEvent {
  data: string;
  type: string;
}

interface EventSourceInit {
  withCredentials?: boolean;
}

interface Event {
  type: string;
}

// Custom EventSource implementation for Node.js
export class EventSource extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = EventSource.CONNECTING;
  readonly OPEN = EventSource.OPEN;
  readonly CLOSED = EventSource.CLOSED;

  readonly url: string;
  readyState: number;
  withCredentials: boolean;

  onopen: ((this: EventSource, ev: Event) => void) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => void) | null = null;
  onerror: ((this: EventSource, ev: Event) => void) | null = null;

  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    super();
    this.url = url;
    this.readyState = EventSource.CONNECTING;
    this.withCredentials = eventSourceInitDict?.withCredentials ?? false;
    this.connect();
  }

  private async connect() {
    try {
      const response = await fetch(this.url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("Response body is null");
      }

      this.readyState = EventSource.OPEN;
      this.emit("open");
      if (this.onopen) {
        this.onopen.call(this, new Event("open"));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            const messageEvent = { type: "message", data } as MessageEvent;
            this.emit("message", messageEvent);
            if (this.onmessage) {
              this.onmessage.call(this, messageEvent);
            }
          }
        }
      }
    } catch (error) {
      this.readyState = EventSource.CLOSED;
      this.emit("error", error);
      if (this.onerror) {
        this.onerror.call(this, new Event("error"));
      }
    }
  }

  close() {
    this.readyState = EventSource.CLOSED;
    this.emit("close");
    this.removeAllListeners();
  }

  addEventListener(
    type: string,
    listener: (event: Event | MessageEvent) => void
  ) {
    this.on(type, listener);
  }

  removeEventListener(
    type: string,
    listener: (event: Event | MessageEvent) => void
  ) {
    this.off(type, listener);
  }

  dispatchEvent(event: Event | MessageEvent): boolean {
    this.emit(event.type, event);
    return true;
  }
}

const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const RECONNECT_TIMEOUT = 1000; // 1 second
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * SSE transport implementation for real-time updates.
 */
export class SSEServerTransport extends BaseTransport {
  private connections: Map<string, EventSource>;
  private keepAliveIntervals: Map<string, NodeJS.Timeout>;
  private reconnectAttempts: Map<string, number>;
  private subscriptions: Map<string, Set<string>>;
  private isConnected: boolean;

  constructor() {
    super();
    this.connections = new Map();
    this.keepAliveIntervals = new Map();
    this.reconnectAttempts = new Map();
    this.subscriptions = new Map();
    this.isConnected = false;
  }

  // Add protected method for testing
  protected getConnection(connectionId: string): EventSource | undefined {
    return this.connections.get(connectionId);
  }

  protected getFirstConnectionId(): string | undefined {
    return Array.from(this.connections.keys())[0];
  }

  // For testing purposes
  protected emitEvent(event: string, data?: unknown): void {
    this.emit(event, data);
  }

  /**
   * Connect to the SSE endpoint.
   */
  async connect(): Promise<void> {
    // Initialize connection tracking
    const connectionId = Math.random().toString(36).substring(2, 15);
    const connection = new EventSource("http://localhost:3000/events");
    this.connections.set(connectionId, connection);
    this.reconnectAttempts.set(connectionId, 0);
    this.subscriptions.set(connectionId, new Set());

    // Start keep-alive interval
    this.keepAliveIntervals.set(
      connectionId,
      setInterval(() => this.sendKeepAlive(connectionId), KEEP_ALIVE_INTERVAL)
    );

    // Set up event handlers
    this.setupEventHandlers(connectionId);
  }

  /**
   * Disconnect from the SSE endpoint.
   */
  async disconnect(): Promise<void> {
    // Prevent any reconnection attempts during cleanup
    this.isConnected = false;

    // Clean up all connections
    const connectionIds = Array.from(this.connections.keys());
    for (const connectionId of connectionIds) {
      await this.cleanupConnection(connectionId);
    }
  }

  /**
   * Send a message over the SSE connection.
   */
  async send(message: MCPMessage): Promise<void> {
    const event = new MessageEvent("message", {
      data: JSON.stringify(message),
    });

    // Send to all active connections
    for (const [connectionId, connection] of this.connections) {
      if (connection && connection.readyState === EventSource.OPEN) {
        connection.dispatchEvent(event);
      }
    }
  }

  /**
   * Subscribe to resource updates.
   */
  async subscribe(connectionId: string, resourceUri: string): Promise<void> {
    const subs = this.subscriptions.get(connectionId);
    if (subs) {
      subs.add(resourceUri);
    }
  }

  /**
   * Unsubscribe from resource updates.
   */
  async unsubscribe(connectionId: string, resourceUri: string): Promise<void> {
    const subs = this.subscriptions.get(connectionId);
    if (subs) {
      subs.delete(resourceUri);
    }
  }

  /**
   * Send a notification to subscribed clients.
   */
  async notify(
    notification: MCPNotification & { params: { resource?: MCPResource } }
  ): Promise<void> {
    const event = new MessageEvent("notification", {
      data: JSON.stringify(notification),
    });

    // Send to all connections subscribed to this resource
    for (const [connectionId, subs] of this.subscriptions) {
      const connection = this.connections.get(connectionId);
      if (
        connection &&
        connection.readyState === EventSource.OPEN &&
        notification.params.resource?.uri &&
        subs.has(notification.params.resource.uri)
      ) {
        connection.dispatchEvent(event);
      }
    }
  }

  /**
   * Set up event handlers for a connection.
   */
  private setupEventHandlers(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.onopen = () => {
      this.reconnectAttempts.set(connectionId, 0);
      this.isConnected = true;
      this.emit("connected");
      this.emit("open");
    };

    connection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as MCPMessage;
        this.emit("message", message);
        this.emit("raw", event);
      } catch (error) {
        console.error("Failed to parse SSE message:", error);
      }
    };

    connection.onerror = async () => {
      const attempts = this.reconnectAttempts.get(connectionId) || 0;
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts.set(connectionId, attempts + 1);
        await this.reconnect(connectionId);
      } else {
        await this.cleanupConnection(connectionId);
        this.emit("error", new Error("Max reconnection attempts reached"));
      }
    };
  }

  /**
   * Attempt to reconnect a failed connection.
   */
  private async reconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.close();
    }

    // Wait before reconnecting with exponential backoff
    const attempts = this.reconnectAttempts.get(connectionId) || 0;
    const delay = Math.min(1000 * 2 ** attempts, 30000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Create new connection
    const newConnection = new EventSource("http://localhost:3000/events");
    this.connections.set(connectionId, newConnection);
    this.setupEventHandlers(connectionId);
  }

  /**
   * Clean up a connection and its resources.
   */
  private async cleanupConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Remove all event handlers first
      connection.onopen = null;
      connection.onmessage = null;
      connection.onerror = null;
      connection.close();
    }

    // Clear intervals and remove from maps
    const interval = this.keepAliveIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
    }

    this.connections.delete(connectionId);
    this.keepAliveIntervals.delete(connectionId);
    this.reconnectAttempts.delete(connectionId);
    this.subscriptions.delete(connectionId);

    // Only emit disconnected when all connections are gone
    if (this.connections.size === 0) {
      this.emit("disconnected");
    }
  }

  /**
   * Send a keep-alive message to maintain the connection.
   */
  private async sendKeepAlive(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection && connection.readyState === EventSource.OPEN) {
      const event = new MessageEvent("keep-alive", {
        data: JSON.stringify({ type: "keep-alive", timestamp: Date.now() }),
      });
      connection.dispatchEvent(event);
    }
  }
}
