/**
 * Connection Manager - Durable Object for managing persistent connections
 */

export class ConnectionManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();
    this.sessions = new Map();
  }

  /**
   * Handle HTTP requests to the connection manager
   */
  async fetch(request) {
    const url = new URL(request.url);

    switch (url.pathname) {
    case '/connect':
      return await this.handleConnect(request);
    case '/disconnect':
      return await this.handleDisconnect(request);
    case '/status':
      return await this.handleStatus(request);
    default:
      return new Response('Not Found', { status: 404 });
    }
  }

  /**
   * Handle new connection
   */
  async handleConnect(request) {
    try {
      const body = await request.json();
      const { clientId, dcId, sessionData } = body;

      // Create connection record
      const connection = {
        clientId,
        dcId,
        sessionData,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'active'
      };

      this.connections.set(clientId, connection);

      // Store in durable storage
      await this.state.storage.put(`connection:${clientId}`, connection);

      return new Response(JSON.stringify({ success: true, connectionId: clientId }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Handle connection disconnect
   */
  async handleDisconnect(request) {
    try {
      const body = await request.json();
      const { clientId } = body;

      // Remove from memory
      this.connections.delete(clientId);

      // Remove from storage
      await this.state.storage.delete(`connection:${clientId}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Handle connection status request
   */
  async handleStatus(request) {
    try {
      const connectionCount = this.connections.size;
      const activeConnections = Array.from(this.connections.values()).filter(
        conn => conn.status === 'active'
      ).length;

      const status = {
        totalConnections: connectionCount,
        activeConnections,
        timestamp: Date.now()
      };

      return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Clean up expired connections
   */
  async cleanupExpiredConnections() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [clientId, connection] of this.connections) {
      if (now - connection.lastActivity > maxAge) {
        this.connections.delete(clientId);
        await this.state.storage.delete(`connection:${clientId}`);
      }
    }
  }
}
