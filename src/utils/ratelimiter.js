/**
 * Advanced Rate Limiter with Multiple Strategies
 */

export class RateLimiter {
  constructor(env) {
    this.env = env;
    this.requestsPerWindow = parseInt(env.RATE_LIMIT_REQUESTS) || 100;
    this.windowSize = parseInt(env.RATE_LIMIT_WINDOW) || 60; // seconds
    this.strategies = new Map();
    this.initializeStrategies();
  }

  /**
   * Initialize rate limiting strategies
   */
  initializeStrategies() {
    this.strategies.set('sliding_window', this.slidingWindowStrategy.bind(this));
    this.strategies.set('token_bucket', this.tokenBucketStrategy.bind(this));
    this.strategies.set('fixed_window', this.fixedWindowStrategy.bind(this));
  }

  /**
   * Check rate limit for client
   */
  async checkLimit(clientId, strategy = 'sliding_window') {
    try {
      const strategyFunc = this.strategies.get(strategy);
      if (!strategyFunc) {
        throw new Error(`Unknown rate limiting strategy: ${strategy}`);
      }

      return await strategyFunc(clientId);
    } catch (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true, reason: 'Rate limiter error' };
    }
  }

  /**
   * Sliding window rate limiting
   */
  async slidingWindowStrategy(clientId) {
    const now = Date.now();
    const windowStart = now - this.windowSize * 1000;

    // Get request history (would use KV storage in production)
    const key = `rate_limit:${clientId}`;
    let requestHistory = [];

    try {
      const stored = await this.env.CACHE?.get(key);
      if (stored) {
        requestHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error reading rate limit cache:', error);
    }

    // Remove old requests outside the window
    requestHistory = requestHistory.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    if (requestHistory.length >= this.requestsPerWindow) {
      const oldestRequest = Math.min(...requestHistory);
      const retryAfter = Math.ceil((oldestRequest + this.windowSize * 1000 - now) / 1000);

      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: Math.max(1, retryAfter),
        remaining: 0,
        resetTime: oldestRequest + this.windowSize * 1000
      };
    }

    // Add current request
    requestHistory.push(now);

    // Store updated history
    try {
      await this.env.CACHE?.put(key, JSON.stringify(requestHistory), {
        expirationTtl: this.windowSize + 60
      });
    } catch (error) {
      console.error('Error storing rate limit cache:', error);
    }

    return {
      allowed: true,
      remaining: this.requestsPerWindow - requestHistory.length,
      resetTime: now + this.windowSize * 1000
    };
  }

  /**
   * Token bucket rate limiting
   */
  async tokenBucketStrategy(clientId) {
    const now = Date.now();
    const key = `token_bucket:${clientId}`;

    let bucket = {
      tokens: this.requestsPerWindow,
      lastRefill: now
    };

    try {
      const stored = await this.env.CACHE?.get(key);
      if (stored) {
        bucket = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error reading token bucket cache:', error);
    }

    // Calculate tokens to add based on time elapsed
    const timeElapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timeElapsed * (this.requestsPerWindow / this.windowSize));

    bucket.tokens = Math.min(this.requestsPerWindow, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if tokens available
    if (bucket.tokens < 1) {
      const timeToRefill = Math.ceil((1 * this.windowSize) / this.requestsPerWindow);

      return {
        allowed: false,
        reason: 'No tokens available',
        retryAfter: timeToRefill,
        remaining: 0
      };
    }

    // Consume token
    bucket.tokens -= 1;

    // Store updated bucket
    try {
      await this.env.CACHE?.put(key, JSON.stringify(bucket), {
        expirationTtl: this.windowSize * 2
      });
    } catch (error) {
      console.error('Error storing token bucket cache:', error);
    }

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens)
    };
  }

  /**
   * Fixed window rate limiting
   */
  async fixedWindowStrategy(clientId) {
    const now = Date.now();
    const windowStart = Math.floor(now / (this.windowSize * 1000)) * (this.windowSize * 1000);
    const key = `fixed_window:${clientId}:${windowStart}`;

    let requestCount = 0;

    try {
      const stored = await this.env.CACHE?.get(key);
      if (stored) {
        requestCount = parseInt(stored);
      }
    } catch (error) {
      console.error('Error reading fixed window cache:', error);
    }

    // Check if limit exceeded
    if (requestCount >= this.requestsPerWindow) {
      const resetTime = windowStart + this.windowSize * 1000;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: Math.max(1, retryAfter),
        remaining: 0,
        resetTime
      };
    }

    // Increment counter
    requestCount += 1;

    // Store updated count
    try {
      await this.env.CACHE?.put(key, requestCount.toString(), {
        expirationTtl: this.windowSize + 60
      });
    } catch (error) {
      console.error('Error storing fixed window cache:', error);
    }

    return {
      allowed: true,
      remaining: this.requestsPerWindow - requestCount,
      resetTime: windowStart + this.windowSize * 1000
    };
  }

  /**
   * Advanced rate limiting with user tiers
   */
  async checkLimitWithTier(clientId, userTier = 'basic') {
    const tierLimits = {
      basic: { requests: 100, window: 60 },
      premium: { requests: 1000, window: 60 },
      enterprise: { requests: 10000, window: 60 }
    };

    const limits = tierLimits[userTier] || tierLimits['basic'];

    // Temporarily override limits for this check
    const originalRequests = this.requestsPerWindow;
    const originalWindow = this.windowSize;

    this.requestsPerWindow = limits.requests;
    this.windowSize = limits.window;

    const result = await this.checkLimit(clientId);

    // Restore original limits
    this.requestsPerWindow = originalRequests;
    this.windowSize = originalWindow;

    return result;
  }

  /**
   * Burst protection - allow short bursts but penalize sustained traffic
   */
  async checkBurstProtection(clientId) {
    const shortWindow = 10; // 10 seconds
    const shortLimit = Math.floor(this.requestsPerWindow / 6); // 1/6 of limit in 10 seconds

    const originalWindow = this.windowSize;
    this.windowSize = shortWindow;

    const burstResult = await this.slidingWindowStrategy(`burst:${clientId}`);

    this.windowSize = originalWindow;

    if (
      !burstResult.allowed ||
      (burstResult.remaining !== undefined && burstResult.remaining < shortLimit / 2)
    ) {
      return {
        allowed: false,
        reason: 'Burst limit exceeded',
        retryAfter: 10
      };
    }

    return { allowed: true };
  }

  /**
   * Adaptive rate limiting based on server load
   */
  async getAdaptiveLimit() {
    // This would integrate with system metrics
    // For now, return base limits
    return {
      requests: this.requestsPerWindow,
      window: this.windowSize
    };
  }

  /**
   * Whitelist check - bypass rate limiting for trusted clients
   */
  async isWhitelisted(clientId) {
    // Check if client is whitelisted (could be stored in KV)
    const whitelistKey = `whitelist:${clientId}`;

    try {
      const isWhitelisted = await this.env.CACHE?.get(whitelistKey);
      return isWhitelisted === 'true';
    } catch (error) {
      console.error('Error checking whitelist:', error);
      return false;
    }
  }

  /**
   * Add client to whitelist
   */
  async addToWhitelist(clientId, ttl = 86400) {
    const whitelistKey = `whitelist:${clientId}`;

    try {
      await this.env.CACHE?.put(whitelistKey, 'true', {
        expirationTtl: ttl
      });
    } catch (error) {
      console.error('Error adding to whitelist:', error);
    }
  }

  /**
   * Get rate limit statistics for monitoring
   */
  async getStatistics() {
    // This would aggregate rate limiting statistics
    // For now, return basic info
    return {
      strategy: 'sliding_window',
      requestsPerWindow: this.requestsPerWindow,
      windowSize: this.windowSize,
      timestamp: Date.now()
    };
  }
}
