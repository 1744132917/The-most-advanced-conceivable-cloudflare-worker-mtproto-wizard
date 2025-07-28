/**
 * Advanced Logger with Multiple Output Formats
 */

export class Logger {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.logLevel = 'info';
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  /**
   * Log debug message
   */
  debug(message, context = {}) {
    this.log('debug', message, context);
  }

  /**
   * Log info message
   */
  info(message, context = {}) {
    this.log('info', message, context);
  }

  /**
   * Log warning message
   */
  warn(message, context = {}) {
    this.log('warn', message, context);
  }

  /**
   * Log error message
   */
  error(message, context = {}) {
    this.log('error', message, context);
  }

  /**
   * Core logging function
   */
  log(level, message, context = {}) {
    if (!this.enabled) return;

    if (this.logLevels[level] < this.logLevels[this.logLevel]) {
      return; // Skip if below current log level
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      context,
      service: 'MTProto-Wizard'
    };

    // Console output with colors (if supported)
    this.outputToConsole(logEntry);

    // Could also send to external logging services
    this.sendToExternalLogger(logEntry);
  }

  /**
   * Output to console with formatting
   */
  outputToConsole(logEntry) {
    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m', // Green
      WARN: '\x1b[33m', // Yellow
      ERROR: '\x1b[31m' // Red
    };

    const reset = '\x1b[0m';
    const color = colors[logEntry.level] || '';

    const formattedMessage = `${color}[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}${reset}`;

    if (Object.keys(logEntry.context).length > 0) {
      console.log(formattedMessage, logEntry.context);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Send to external logging service
   */
  async sendToExternalLogger(logEntry) {
    // This could send logs to services like:
    // - Cloudflare Analytics
    // - External log aggregation services
    // - Custom webhook endpoints

    // For now, it's a placeholder
    if (logEntry.level === 'ERROR') {
      // Could send critical errors to alerting systems
    }
  }

  /**
   * Set log level
   */
  setLogLevel(level) {
    if (Object.prototype.hasOwnProperty.call(this.logLevels, level)) {
      this.logLevel = level;
    }
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Log request details
   */
  logRequest(request, response = null, duration = null) {
    const url = new URL(request.url);
    const context = {
      method: request.method,
      path: url.pathname,
      query: url.search,
      userAgent: request.headers.get('User-Agent'),
      clientIP: request.headers.get('CF-Connecting-IP'),
      country: request.cf?.country,
      duration: duration ? `${duration}ms` : undefined,
      status: response?.status
    };

    this.info('Request processed', context);
  }

  /**
   * Log MTProto specific events
   */
  logMTProto(event, data = {}) {
    this.info(`MTProto: ${event}`, {
      event,
      ...data,
      category: 'mtproto'
    });
  }

  /**
   * Log security events
   */
  logSecurity(event, details = {}) {
    this.warn(`Security: ${event}`, {
      event,
      ...details,
      category: 'security'
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(metric, value, unit = 'ms') {
    this.info(`Performance: ${metric}`, {
      metric,
      value,
      unit,
      category: 'performance'
    });
  }

  /**
   * Create structured log entry
   */
  createStructuredLog(level, message, data = {}) {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      service: 'MTProto-Wizard',
      version: '1.0.0',
      ...data
    };
  }

  /**
   * Log with correlation ID for request tracing
   */
  logWithCorrelation(level, message, correlationId, context = {}) {
    this.log(level, message, {
      correlationId,
      ...context
    });
  }

  /**
   * Batch logging for high-volume scenarios
   */
  async batchLog(entries) {
    for (const entry of entries) {
      this.log(entry.level, entry.message, entry.context);
    }
  }
}
