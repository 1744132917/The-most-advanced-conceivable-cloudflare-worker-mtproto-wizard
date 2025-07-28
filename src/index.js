/**
 * The Most Advanced Conceivable Cloudflare Worker MTProto Wizard
 *
 * Features:
 * - Complete MTProto 2.0 implementation
 * - Advanced encryption and security
 * - Anti-censorship capabilities
 * - Connection pooling and optimization
 * - Comprehensive monitoring and logging
 */

import { MTProtoHandler } from './mtproto/handler.js';
import { ProxyManager } from './proxy/manager.js';
import { SecurityModule } from './security/module.js';
import { ConnectionManager } from './proxy/connections.js';
import { RateLimiter } from './utils/ratelimiter.js';
import { Logger } from './utils/logger.js';
import { MetricsCollector } from './utils/metrics.js';

export { ConnectionManager };

export default {
  /**
   * Main request handler for the Cloudflare Worker
   */
  async fetch(request, env, _ctx) {
    const logger = new Logger(env.ENABLE_LOGGING === 'true');
    const metrics = new MetricsCollector(env.ENABLE_METRICS === 'true');

    try {
      // Initialize core modules
      const security = new SecurityModule();
      const rateLimiter = new RateLimiter(env);
      const proxyManager = new ProxyManager(env);
      const mtprotoHandler = new MTProtoHandler(env);

      // Log request details
      logger.info('Incoming request', {
        url: request.url,
        method: request.method,
        userAgent: request.headers.get('User-Agent'),
        cf: request.cf
      });

      // Security checks
      const securityResult = await security.validateRequest(request);
      if (!securityResult.allowed) {
        metrics.increment('security.blocked');
        return new Response('Access Denied', {
          status: 403,
          headers: { 'X-Block-Reason': securityResult.reason }
        });
      }

      // Rate limiting
      const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
      const rateLimitResult = await rateLimiter.checkLimit(clientIP);
      if (!rateLimitResult.allowed) {
        metrics.increment('ratelimit.exceeded');
        return new Response('Rate Limit Exceeded', {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfter.toString(),
            'X-RateLimit-Limit': env.RATE_LIMIT_REQUESTS,
            'X-RateLimit-Remaining': '0'
          }
        });
      }

      const url = new URL(request.url);

      // Handle WebSocket upgrade requests
      if (request.headers.get('Upgrade') === 'websocket') {
        return await handleWebSocket(request, env, {
          proxyManager,
          mtprotoHandler,
          logger,
          metrics
        });
      }

      // Route HTTP requests
      switch (url.pathname) {
      case '/':
        return await handleRoot(request, env);

      case '/health':
        return await handleHealth(env, metrics);

      case '/metrics':
        return await handleMetrics(metrics);

      case '/proxy':
        return await proxyManager.handleProxy(request, mtprotoHandler);

      case '/api/v1/mtproto':
        return await mtprotoHandler.handleHTTP(request);

      default:
        // Try to handle as MTProto proxy request
        if (url.pathname.startsWith('/mtproto/')) {
          return await proxyManager.handleProxy(request, mtprotoHandler);
        }

        metrics.increment('requests.not_found');
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      logger.error('Unhandled error', { error: error.message, stack: error.stack });
      metrics.increment('errors.unhandled');
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

/**
 * Handle WebSocket connections for real-time MTProto communication
 */
async function handleWebSocket(request, env, modules) {
  const { proxyManager, mtprotoHandler, logger, metrics } = modules;

  try {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Handle WebSocket connection
    server.accept();

    // Set up MTProto WebSocket handler
    server.addEventListener('message', async event => {
      try {
        const data = new Uint8Array(event.data);
        const response = await mtprotoHandler.handleWebSocket(data);
        if (response) {
          server.send(response);
        }
      } catch (error) {
        logger.error('WebSocket message error', { error: error.message });
        metrics.increment('websocket.errors');
      }
    });

    server.addEventListener('close', () => {
      logger.info('WebSocket connection closed');
      metrics.increment('websocket.disconnections');
    });

    metrics.increment('websocket.connections');
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  } catch (error) {
    logger.error('WebSocket setup error', { error: error.message });
    metrics.increment('websocket.setup_errors');
    return new Response('WebSocket Error', { status: 500 });
  }
}

/**
 * Handle root endpoint with service information
 */
async function handleRoot(request, env) {
  const info = {
    service: 'MTProto Wizard',
    version: '1.0.0',
    description: 'The most advanced conceivable Cloudflare Worker MTProto wizard',
    features: [
      'MTProto 2.0 Support',
      'Advanced Encryption',
      'Anti-Censorship',
      'Connection Pooling',
      'Rate Limiting',
      'Real-time Monitoring',
      'WebSocket Support',
      'HTTP Proxy Support'
    ],
    endpoints: {
      '/': 'Service information',
      '/health': 'Health check',
      '/metrics': 'Service metrics',
      '/proxy': 'HTTP MTProto proxy',
      '/api/v1/mtproto': 'MTProto API endpoint',
      '/mtproto/*': 'MTProto proxy paths'
    },
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Handle health check endpoint
 */
async function handleHealth(env, metrics) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Date.now(),
    version: '1.0.0',
    environment: env.ENVIRONMENT || 'production'
  };

  metrics.increment('health.checks');

  return new Response(JSON.stringify(health), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle metrics endpoint
 */
async function handleMetrics(metrics) {
  const metricsData = await metrics.getMetrics();

  return new Response(JSON.stringify(metricsData, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
