/**
 * Advanced Proxy Manager for MTProto
 * Handles connection pooling, load balancing, and anti-censorship
 */

export class ProxyManager {
  constructor(env) {
    this.env = env;
    this.connections = new Map();
    this.connectionPool = new ConnectionPool(env);
    this.loadBalancer = new LoadBalancer();
    this.antiCensorship = new AntiCensorshipModule();
  }

  /**
   * Handle proxy request
   */
  async handleProxy(request, mtprotoHandler) {
    try {
      const url = new URL(request.url);
      const targetDC = this.extractTargetDC(url);

      if (!targetDC) {
        return new Response('Invalid proxy target', { status: 400 });
      }

      // Get connection from pool
      const connection = await this.connectionPool.getConnection(targetDC);

      if (request.method === 'POST') {
        return await this.handleHTTPProxy(request, connection, mtprotoHandler);
      } else {
        return await this.handleWebSocketProxy(request, connection, mtprotoHandler);
      }
    } catch (error) {
      console.error('Proxy error:', error);
      return new Response('Proxy Error', { status: 500 });
    }
  }

  /**
   * Handle HTTP proxy requests
   */
  async handleHTTPProxy(request, connection, mtprotoHandler) {
    const body = await request.arrayBuffer();
    const data = new Uint8Array(body);

    // Apply anti-censorship obfuscation if needed
    const obfuscatedData = await this.antiCensorship.obfuscateIfNeeded(data, request);

    // Proxy to Telegram servers
    const response = await this.proxyToTelegram(obfuscatedData, connection);

    // Deobfuscate response
    const deobfuscatedResponse = await this.antiCensorship.deobfuscateIfNeeded(response, request);

    return new Response(deobfuscatedResponse, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  /**
   * Handle WebSocket proxy requests
   */
  async handleWebSocketProxy(request, connection, mtprotoHandler) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    // Set up bidirectional proxy
    this.setupWebSocketProxy(server, connection);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  /**
   * Set up WebSocket proxy with Telegram servers
   */
  setupWebSocketProxy(clientWS, connection) {
    // Create WebSocket connection to Telegram
    const telegramWS = new WebSocket(connection.wsUrl);

    // Client -> Telegram
    clientWS.addEventListener('message', async event => {
      try {
        const data = new Uint8Array(event.data);
        const obfuscated = await this.antiCensorship.obfuscateIfNeeded(data);
        telegramWS.send(obfuscated);
      } catch (error) {
        console.error('Client->Telegram error:', error);
      }
    });

    // Telegram -> Client
    telegramWS.addEventListener('message', async event => {
      try {
        const data = new Uint8Array(event.data);
        const deobfuscated = await this.antiCensorship.deobfuscateIfNeeded(data);
        clientWS.send(deobfuscated);
      } catch (error) {
        console.error('Telegram->Client error:', error);
      }
    });

    // Handle connection cleanup
    clientWS.addEventListener('close', () => {
      telegramWS.close();
    });

    telegramWS.addEventListener('close', () => {
      clientWS.close();
    });
  }

  /**
   * Proxy data to Telegram servers
   */
  async proxyToTelegram(data, connection) {
    const response = await fetch(connection.url, {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream',
        'User-Agent': this.generateRandomUserAgent()
      }
    });

    if (!response.ok) {
      throw new Error(`Telegram server error: ${response.status}`);
    }

    const responseData = await response.arrayBuffer();
    return new Uint8Array(responseData);
  }

  /**
   * Extract target DC from URL
   */
  extractTargetDC(url) {
    const pathParts = url.pathname.split('/');

    // Support various URL formats
    if (pathParts[1] === 'mtproto' && pathParts[2]) {
      return pathParts[2]; // /mtproto/dc1
    }

    const dcParam = url.searchParams.get('dc');
    if (dcParam) {
      return dcParam;
    }

    return null;
  }

  /**
   * Generate random User-Agent for anti-detection
   */
  generateRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}

/**
 * Connection Pool Manager
 */
class ConnectionPool {
  constructor(env) {
    this.env = env;
    this.pools = new Map();
    this.maxConnections = parseInt(env.MAX_CONNECTIONS) || 1000;
  }

  /**
   * Get connection from pool
   */
  async getConnection(dc) {
    let pool = this.pools.get(dc);

    if (!pool) {
      pool = new DCConnectionPool(dc, this.maxConnections / 10);
      this.pools.set(dc, pool);
    }

    return await pool.getConnection();
  }

  /**
   * Return connection to pool
   */
  async returnConnection(dc, connection) {
    const pool = this.pools.get(dc);
    if (pool) {
      await pool.returnConnection(connection);
    }
  }
}

/**
 * Data Center Connection Pool
 */
class DCConnectionPool {
  constructor(dc, maxSize) {
    this.dc = dc;
    this.maxSize = maxSize;
    this.available = [];
    this.inUse = new Set();
    this.dcUrls = this.getDCUrls(dc);
  }

  /**
   * Get connection from pool
   */
  async getConnection() {
    // Try to reuse existing connection
    if (this.available.length > 0) {
      const connection = this.available.pop();
      this.inUse.add(connection);
      return connection;
    }

    // Create new connection if under limit
    if (this.inUse.size < this.maxSize) {
      const connection = await this.createConnection();
      this.inUse.add(connection);
      return connection;
    }

    // Wait for available connection
    return await this.waitForConnection();
  }

  /**
   * Return connection to pool
   */
  async returnConnection(connection) {
    this.inUse.delete(connection);

    if (this.isConnectionHealthy(connection)) {
      this.available.push(connection);
    }
  }

  /**
   * Create new connection
   */
  async createConnection() {
    const dcUrl = this.selectDCUrl();

    return {
      url: dcUrl,
      wsUrl: dcUrl.replace('https://', 'wss://'),
      created: Date.now(),
      lastUsed: Date.now(),
      requestCount: 0
    };
  }

  /**
   * Check if connection is healthy
   */
  isConnectionHealthy(connection) {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const maxRequests = 1000;

    return Date.now() - connection.created < maxAge && connection.requestCount < maxRequests;
  }

  /**
   * Get DC URLs for data center
   */
  getDCUrls(dc) {
    const dcMap = {
      dc1: ['https://149.154.175.50/api'],
      dc2: ['https://149.154.167.51/api'],
      dc3: ['https://149.154.175.100/api'],
      dc4: ['https://149.154.167.91/api'],
      dc5: ['https://91.108.56.130/api']
    };

    return dcMap[dc] || dcMap['dc1'];
  }

  /**
   * Select DC URL with load balancing
   */
  selectDCUrl() {
    const urls = this.dcUrls;
    return urls[Math.floor(Math.random() * urls.length)];
  }

  /**
   * Wait for available connection
   */
  async waitForConnection() {
    return new Promise(resolve => {
      const checkAvailable = () => {
        if (this.available.length > 0) {
          const connection = this.available.pop();
          this.inUse.add(connection);
          resolve(connection);
        } else {
          setTimeout(checkAvailable, 100);
        }
      };
      checkAvailable();
    });
  }
}

/**
 * Load Balancer for multiple DCs
 */
class LoadBalancer {
  constructor() {
    this.dcStats = new Map();
  }

  /**
   * Select best DC based on performance metrics
   */
  selectBestDC(availableDCs) {
    if (availableDCs.length === 1) {
      return availableDCs[0];
    }

    // Simple round-robin for now
    // In a real implementation, this would consider latency, load, etc.
    return availableDCs[Math.floor(Math.random() * availableDCs.length)];
  }

  /**
   * Update DC performance stats
   */
  updateDCStats(dc, latency, success) {
    let stats = this.dcStats.get(dc);
    if (!stats) {
      stats = { latency: [], successRate: 1.0, requestCount: 0 };
      this.dcStats.set(dc, stats);
    }

    stats.requestCount++;
    stats.latency.push(latency);

    // Keep only last 100 measurements
    if (stats.latency.length > 100) {
      stats.latency.shift();
    }

    // Update success rate
    const recentRequests = Math.min(stats.requestCount, 100);
    stats.successRate =
      (stats.successRate * (recentRequests - 1) + (success ? 1 : 0)) / recentRequests;
  }
}

/**
 * Anti-Censorship Module
 */
class AntiCensorshipModule {
  constructor() {
    this.obfuscationMethods = new Map();
    this.initializeObfuscationMethods();
  }

  /**
   * Initialize obfuscation methods
   */
  initializeObfuscationMethods() {
    this.obfuscationMethods.set('simple_xor', this.simpleXOR.bind(this));
    this.obfuscationMethods.set('domain_fronting', this.domainFronting.bind(this));
    this.obfuscationMethods.set('traffic_shaping', this.trafficShaping.bind(this));
  }

  /**
   * Apply obfuscation if needed
   */
  async obfuscateIfNeeded(data, request = null) {
    // Detect if censorship is likely
    if (this.isCensorshipDetected(request)) {
      return await this.simpleXOR(data);
    }

    return data;
  }

  /**
   * Remove obfuscation if needed
   */
  async deobfuscateIfNeeded(data, request = null) {
    // If we applied obfuscation, reverse it
    if (this.isCensorshipDetected(request)) {
      return await this.simpleXOR(data); // XOR is self-inverse
    }

    return data;
  }

  /**
   * Detect potential censorship
   */
  isCensorshipDetected(request) {
    if (!request) return false;

    // Check for known censorship indicators
    const cf = request.cf;
    if (cf && cf.country) {
      const censoredCountries = ['CN', 'IR', 'RU']; // Example
      return censoredCountries.includes(cf.country);
    }

    return false;
  }

  /**
   * Simple XOR obfuscation
   */
  async simpleXOR(data) {
    const key = new Uint8Array([0xab, 0xcd, 0xef, 0x12]);
    const result = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ key[i % key.length];
    }

    return result;
  }

  /**
   * Domain fronting technique
   */
  async domainFronting(data) {
    // Implementation would involve routing through CDNs
    // This is a placeholder for the concept
    return data;
  }

  /**
   * Traffic shaping to mimic normal HTTPS traffic
   */
  async trafficShaping(data) {
    // Add random padding and timing delays
    const padding = new Uint8Array(Math.floor(Math.random() * 100));
    crypto.getRandomValues(padding);

    const result = new Uint8Array(data.length + padding.length);
    result.set(data);
    result.set(padding, data.length);

    return result;
  }
}
