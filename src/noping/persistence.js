/**
 * No-Ping Connection Persistence Manager
 * 
 * Implements intelligent connection management that eliminates the need for
 * periodic ping messages by using advanced state tracking and prediction.
 */

import { Logger } from '../utils/logger.js';

export class NoPingPersistenceManager {
  constructor(env) {
    this.env = env;
    this.logger = new Logger(env.ENABLE_LOGGING === 'true');
    this.connections = new Map();
    this.sessionStore = env.SESSIONS;
    this.cache = env.CACHE;
    
    // Advanced no-ping configuration
    this.config = {
      // Maximum time to maintain connection state without activity
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      // Prediction window for preemptive connection management
      predictionWindow: 5 * 60 * 1000, // 5 minutes
      // Session persistence duration
      sessionTTL: 24 * 60 * 60 * 1000, // 24 hours
      // Connection health check interval (passive, no ping)
      healthCheckInterval: 60 * 1000, // 1 minute
      // Maximum connections per client
      maxConnectionsPerClient: 10
    };
  }

  /**
   * Initialize a no-ping connection session
   */
  async initializeSession(clientId, connectionParams) {
    try {
      const sessionId = this.generateSessionId(clientId);
      const timestamp = Date.now();
      
      const session = {
        sessionId,
        clientId,
        connectionParams,
        createdAt: timestamp,
        lastActivity: timestamp,
        state: 'active',
        messageQueue: [],
        connectionHistory: [],
        predictedNextActivity: timestamp + this.config.predictionWindow,
        noPingEnabled: true,
        persistenceLevel: 'advanced'
      };

      // Store session in KV for persistence across edge locations
      await this.sessionStore.put(sessionId, JSON.stringify(session), {
        expirationTtl: this.config.sessionTTL / 1000
      });

      // Cache session locally for immediate access
      this.connections.set(sessionId, session);

      this.logger.info('No-ping session initialized', {
        sessionId,
        clientId,
        noPingEnabled: true
      });

      return sessionId;
    } catch (error) {
      this.logger.error('Failed to initialize no-ping session', { error: error.message });
      throw error;
    }
  }

  /**
   * Maintain connection state without sending ping messages
   */
  async maintainConnection(sessionId, activity = null) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const now = Date.now();
      session.lastActivity = now;

      // Update prediction based on activity pattern
      if (activity) {
        session.connectionHistory.push({
          timestamp: now,
          type: activity.type,
          size: activity.size
        });

        // Keep only recent history for prediction
        session.connectionHistory = session.connectionHistory
          .filter(h => now - h.timestamp < this.config.predictionWindow)
          .slice(-100); // Keep last 100 activities

        // Predict next activity based on patterns
        session.predictedNextActivity = this.predictNextActivity(session.connectionHistory);
      }

      // Update session in storage
      await this.updateSession(session);

      this.logger.debug('Connection maintained without ping', {
        sessionId,
        lastActivity: session.lastActivity,
        predictedNext: session.predictedNextActivity
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to maintain connection', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Smart message queuing for no-ping connections
   */
  async queueMessage(sessionId, message) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const queuedMessage = {
        id: this.generateMessageId(),
        timestamp: Date.now(),
        data: message,
        priority: this.calculateMessagePriority(message),
        retryCount: 0,
        maxRetries: 3
      };

      session.messageQueue.push(queuedMessage);
      
      // Sort by priority and timestamp
      session.messageQueue.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.timestamp - b.timestamp;
      });

      // Limit queue size
      if (session.messageQueue.length > 1000) {
        session.messageQueue = session.messageQueue.slice(0, 1000);
      }

      await this.updateSession(session);

      this.logger.debug('Message queued for no-ping delivery', {
        sessionId,
        messageId: queuedMessage.id,
        queueSize: session.messageQueue.length
      });

      return queuedMessage.id;
    } catch (error) {
      this.logger.error('Failed to queue message', { sessionId, error: error.message });
      throw error;
    }
  }

  /**
   * Process queued messages without requiring ping responses
   */
  async processMessageQueue(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session || session.messageQueue.length === 0) {
        return [];
      }

      const processedMessages = [];
      const failedMessages = [];

      for (const message of session.messageQueue) {
        try {
          const processed = await this.processQueuedMessage(session, message);
          if (processed) {
            processedMessages.push(message);
          } else {
            message.retryCount++;
            if (message.retryCount >= message.maxRetries) {
              failedMessages.push(message);
            }
          }
        } catch (error) {
          this.logger.error('Failed to process queued message', {
            sessionId,
            messageId: message.id,
            error: error.message
          });
          failedMessages.push(message);
        }
      }

      // Remove processed and failed messages from queue
      session.messageQueue = session.messageQueue.filter(
        msg => !processedMessages.includes(msg) && !failedMessages.includes(msg)
      );

      await this.updateSession(session);

      this.logger.info('Message queue processed', {
        sessionId,
        processed: processedMessages.length,
        failed: failedMessages.length,
        remaining: session.messageQueue.length
      });

      return processedMessages;
    } catch (error) {
      this.logger.error('Failed to process message queue', { sessionId, error: error.message });
      return [];
    }
  }

  /**
   * Intelligent connection health monitoring without pings
   */
  async checkConnectionHealth(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return { healthy: false, reason: 'Session not found' };
      }

      const now = Date.now();
      const timeSinceActivity = now - session.lastActivity;
      const isPredictedActive = now < session.predictedNextActivity;

      // Determine health based on activity patterns, not pings
      const health = {
        healthy: timeSinceActivity < this.config.maxIdleTime || isPredictedActive,
        lastActivity: session.lastActivity,
        timeSinceActivity,
        isPredictedActive,
        queueSize: session.messageQueue.length,
        connectionAge: now - session.createdAt,
        noPingStatus: 'active'
      };

      if (!health.healthy) {
        health.reason = timeSinceActivity > this.config.maxIdleTime 
          ? 'Exceeded maximum idle time' 
          : 'No predicted activity';
      }

      this.logger.debug('Connection health checked without ping', {
        sessionId,
        healthy: health.healthy,
        timeSinceActivity,
        isPredictedActive
      });

      return health;
    } catch (error) {
      this.logger.error('Failed to check connection health', { sessionId, error: error.message });
      return { healthy: false, reason: error.message };
    }
  }

  /**
   * Cleanup inactive sessions without ping requirements
   */
  async cleanupInactiveSessions() {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [sessionId, session] of this.connections) {
        const health = await this.checkConnectionHealth(sessionId);
        
        if (!health.healthy) {
          await this.removeSession(sessionId);
          cleanedCount++;
        }
      }

      this.logger.info('Cleaned up inactive sessions', {
        cleanedCount,
        totalSessions: this.connections.size
      });

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup sessions', { error: error.message });
      return 0;
    }
  }

  // Helper methods

  async getSession(sessionId) {
    // Try local cache first
    if (this.connections.has(sessionId)) {
      return this.connections.get(sessionId);
    }

    // Fallback to KV storage
    try {
      const sessionData = await this.sessionStore.get(sessionId);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        this.connections.set(sessionId, session);
        return session;
      }
    } catch (error) {
      this.logger.error('Failed to retrieve session from KV', { sessionId, error: error.message });
    }

    return null;
  }

  async updateSession(session) {
    // Update local cache
    this.connections.set(session.sessionId, session);
    
    // Update KV storage
    await this.sessionStore.put(session.sessionId, JSON.stringify(session), {
      expirationTtl: this.config.sessionTTL / 1000
    });
  }

  async removeSession(sessionId) {
    this.connections.delete(sessionId);
    await this.sessionStore.delete(sessionId);
  }

  generateSessionId(clientId) {
    return `noping_${clientId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  predictNextActivity(history) {
    if (history.length < 2) {
      return Date.now() + this.config.predictionWindow;
    }

    // Simple prediction based on average interval
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i].timestamp - history[i-1].timestamp);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const lastActivity = history[history.length - 1].timestamp;
    
    return lastActivity + Math.min(avgInterval, this.config.predictionWindow);
  }

  calculateMessagePriority(message) {
    // Simple priority calculation based on message type
    if (message.type === 'auth') return 10;
    if (message.type === 'urgent') return 8;
    if (message.type === 'response') return 6;
    if (message.type === 'data') return 4;
    return 2;
  }

  async processQueuedMessage(session, message) {
    // Placeholder for actual message processing
    // In real implementation, this would send the message through MTProto
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate processing
    return true;
  }
}