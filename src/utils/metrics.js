/**
 * Advanced Metrics Collector for Performance Monitoring
 */

export class MetricsCollector {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.metrics = new Map();
    this.timers = new Map();
    this.histograms = new Map();
    this.counters = new Map();
    this.startTime = Date.now();
  }

  /**
   * Increment a counter metric
   */
  increment(name, value = 1, tags = {}) {
    if (!this.enabled) return;

    const key = this.createMetricKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    this.updateMetric('counter', name, current + value, tags);
  }

  /**
   * Decrement a counter metric
   */
  decrement(name, value = 1, tags = {}) {
    this.increment(name, -value, tags);
  }

  /**
   * Set a gauge metric
   */
  gauge(name, value, tags = {}) {
    if (!this.enabled) return;

    const key = this.createMetricKey(name, tags);
    this.updateMetric('gauge', name, value, tags);
  }

  /**
   * Record a histogram value
   */
  histogram(name, value, tags = {}) {
    if (!this.enabled) return;

    const key = this.createMetricKey(name, tags);
    let histogram = this.histograms.get(key);

    if (!histogram) {
      histogram = {
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity
      };
      this.histograms.set(key, histogram);
    }

    histogram.values.push(value);
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);

    // Keep only last 1000 values to prevent memory issues
    if (histogram.values.length > 1000) {
      histogram.values = histogram.values.slice(-1000);
    }

    this.updateMetric('histogram', name, histogram, tags);
  }

  /**
   * Start a timer
   */
  startTimer(name, tags = {}) {
    if (!this.enabled) return null;

    const key = this.createMetricKey(name, tags);
    const timerId = `${key}_${Date.now()}_${Math.random()}`;

    this.timers.set(timerId, {
      name,
      tags,
      startTime: Date.now()
    });

    return timerId;
  }

  /**
   * End a timer and record the duration
   */
  endTimer(timerId) {
    if (!this.enabled || !timerId) return;

    const timer = this.timers.get(timerId);
    if (!timer) return;

    const duration = Date.now() - timer.startTime;
    this.histogram(`${timer.name}.duration`, duration, timer.tags);
    this.timers.delete(timerId);

    return duration;
  }

  /**
   * Time a function execution
   */
  async timeFunction(name, fn, tags = {}) {
    const timerId = this.startTimer(name, tags);

    try {
      const result = await fn();
      return result;
    } finally {
      this.endTimer(timerId);
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(request, response, duration) {
    if (!this.enabled) return;

    const url = new URL(request.url);
    const tags = {
      method: request.method,
      path: url.pathname,
      status: response?.status || 0,
      country: request.cf?.country || 'unknown'
    };

    this.increment('requests.total', 1, tags);
    this.histogram('requests.duration', duration, tags);

    if (response?.status >= 400) {
      this.increment('requests.errors', 1, tags);
    }
  }

  /**
   * Record MTProto specific metrics
   */
  recordMTProtoMetrics(event, data = {}) {
    if (!this.enabled) return;

    const tags = { event, ...data };
    this.increment('mtproto.events', 1, tags);

    switch (event) {
    case 'message_sent':
      this.increment('mtproto.messages.sent', 1);
      if (data.size) {
        this.histogram('mtproto.message_size.sent', data.size);
      }
      break;

    case 'message_received':
      this.increment('mtproto.messages.received', 1);
      if (data.size) {
        this.histogram('mtproto.message_size.received', data.size);
      }
      break;

    case 'connection_established':
      this.increment('mtproto.connections.established', 1);
      break;

    case 'connection_closed':
      this.increment('mtproto.connections.closed', 1);
      if (data.duration) {
        this.histogram('mtproto.connection_duration', data.duration);
      }
      break;
    }
  }

  /**
   * Record security metrics
   */
  recordSecurityEvent(event, blocked = false, reason = null) {
    if (!this.enabled) return;

    const tags = { event, blocked: blocked.toString() };
    if (reason) tags.reason = reason;

    this.increment('security.events', 1, tags);

    if (blocked) {
      this.increment('security.blocked', 1, tags);
    }
  }

  /**
   * Record rate limiting metrics
   */
  recordRateLimit(allowed, remaining, clientId = null) {
    if (!this.enabled) return;

    const tags = { allowed: allowed.toString() };
    if (clientId) tags.client = clientId;

    this.increment('ratelimit.checks', 1, tags);

    if (!allowed) {
      this.increment('ratelimit.exceeded', 1, tags);
    }

    if (remaining !== undefined) {
      this.gauge('ratelimit.remaining', remaining, tags);
    }
  }

  /**
   * Get current metrics snapshot
   */
  async getMetrics() {
    if (!this.enabled) return {};

    const snapshot = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      counters: this.getCounterMetrics(),
      histograms: this.getHistogramMetrics(),
      system: await this.getSystemMetrics()
    };

    return snapshot;
  }

  /**
   * Get counter metrics
   */
  getCounterMetrics() {
    const counters = {};
    for (const [key, value] of this.counters) {
      counters[key] = value;
    }
    return counters;
  }

  /**
   * Get histogram metrics with calculated statistics
   */
  getHistogramMetrics() {
    const histograms = {};

    for (const [key, histogram] of this.histograms) {
      const values = histogram.values.sort((a, b) => a - b);
      const count = values.length;

      histograms[key] = {
        count: histogram.count,
        sum: histogram.sum,
        min: histogram.min,
        max: histogram.max,
        mean: count > 0 ? histogram.sum / count : 0,
        median: count > 0 ? this.calculatePercentile(values, 0.5) : 0,
        p95: count > 0 ? this.calculatePercentile(values, 0.95) : 0,
        p99: count > 0 ? this.calculatePercentile(values, 0.99) : 0
      };
    }

    return histograms;
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics() {
    return {
      memoryUsage: this.getMemoryUsage(),
      activeConnections: this.getActiveConnections(),
      timestamp: Date.now()
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  calculatePercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;

    const index = percentile * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] * (upper - index) + sortedValues[upper] * (index - lower);
  }

  /**
   * Create metric key with tags
   */
  createMetricKey(name, tags = {}) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join(',');

    return tagString ? `${name}{${tagString}}` : name;
  }

  /**
   * Update metric in storage
   */
  updateMetric(type, name, value, tags = {}) {
    const key = this.createMetricKey(name, tags);

    this.metrics.set(key, {
      type,
      name,
      value,
      tags,
      timestamp: Date.now()
    });
  }

  /**
   * Get memory usage estimation
   */
  getMemoryUsage() {
    // Estimate memory usage based on stored data
    const metricsSize = this.metrics.size * 100; // rough estimate
    const countersSize = this.counters.size * 50;
    const histogramsSize = Array.from(this.histograms.values()).reduce(
      (sum, h) => sum + h.values.length * 8,
      0
    );

    return {
      estimated: metricsSize + countersSize + histogramsSize,
      metrics: this.metrics.size,
      counters: this.counters.size,
      histograms: this.histograms.size,
      timers: this.timers.size
    };
  }

  /**
   * Get active connections count
   */
  getActiveConnections() {
    // This would typically query the connection manager
    return this.counters.get('mtproto.connections.active') || 0;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.counters.clear();
    this.histograms.clear();
    this.timers.clear();
    this.startTime = Date.now();
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus() {
    const lines = [];

    // Export counters
    for (const [key, value] of this.counters) {
      lines.push(`# TYPE ${key} counter`);
      lines.push(`${key} ${value}`);
    }

    // Export histograms
    for (const [key, histogram] of this.histograms) {
      lines.push(`# TYPE ${key} histogram`);
      lines.push(`${key}_count ${histogram.count}`);
      lines.push(`${key}_sum ${histogram.sum}`);
    }

    return lines.join('\n');
  }
}
