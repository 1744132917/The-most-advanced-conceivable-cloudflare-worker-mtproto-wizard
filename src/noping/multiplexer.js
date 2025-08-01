/**
 * No-Ping Connection Multiplexer
 * 
 * Implements advanced connection multiplexing that efficiently manages
 * multiple virtual connections over a single physical connection without
 * requiring ping messages to maintain state.
 */

import { Logger } from '../utils/logger.js';

export class NoPingMultiplexer {
  constructor(env) {
    this.env = env;
    this.logger = new Logger(env.ENABLE_LOGGING === 'true');
    this.virtualConnections = new Map();
    this.physicalConnections = new Map();
    this.connectionMapping = new Map();
    this.messageStreams = new Map();
    
    this.config = {
      maxVirtualConnectionsPerPhysical: 100,
      connectionPoolSize: 10,
      streamBufferSize: 1000,
      multiplexingEnabled: true,
      loadBalancing: 'round_robin', // round_robin, least_used, adaptive
      reconnectionStrategy: 'smart', // smart, immediate, delayed
      compressionEnabled: true
    };
  }

  /**
   * Create a new virtual connection without ping requirements
   */
  async createVirtualConnection(clientId, targetDC) {
    try {
      const virtualId = this.generateVirtualConnectionId(clientId);
      const physicalConnection = await this.getOptimalPhysicalConnection(targetDC);
      
      const virtualConnection = {
        id: virtualId,
        clientId,
        targetDC,
        physicalConnectionId: physicalConnection.id,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        state: 'active',
        messageStream: [],
        compressionState: this.initCompressionState(),
        statistics: {
          messagesSent: 0,
          messagesReceived: 0,
          bytesTransferred: 0,
          lastThroughput: 0,
          averageLatency: 0
        },
        noPingConfig: {
          enabled: true,
          keepAliveStrategy: 'activity_based',
          predictionEnabled: true,
          smartReconnection: true
        }
      };

      this.virtualConnections.set(virtualId, virtualConnection);
      this.connectionMapping.set(virtualId, physicalConnection.id);
      
      // Initialize message stream for this virtual connection
      this.messageStreams.set(virtualId, {
        inbound: [],
        outbound: [],
        pending: new Map()
      });

      // Update physical connection usage
      physicalConnection.virtualConnections.add(virtualId);
      physicalConnection.lastActivity = Date.now();

      this.logger.info('Virtual connection created without ping', {
        virtualId,
        clientId,
        targetDC,
        physicalConnectionId: physicalConnection.id,
        noPingEnabled: true
      });

      return virtualConnection;
    } catch (error) {
      this.logger.error('Failed to create virtual connection', { 
        clientId, 
        targetDC, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Multiplex message sending without ping overhead
   */
  async sendMultiplexedMessage(virtualConnectionId, message) {
    try {
      const virtualConnection = this.virtualConnections.get(virtualConnectionId);
      if (!virtualConnection) {
        throw new Error('Virtual connection not found');
      }

      const physicalConnectionId = this.connectionMapping.get(virtualConnectionId);
      const physicalConnection = this.physicalConnections.get(physicalConnectionId);
      
      if (!physicalConnection || physicalConnection.state !== 'connected') {
        // Attempt smart reconnection without ping
        await this.smartReconnect(virtualConnectionId);
        return await this.sendMultiplexedMessage(virtualConnectionId, message);
      }

      // Prepare multiplexed message with virtual connection context
      const multiplexedMessage = {
        virtualConnectionId,
        timestamp: Date.now(),
        sequence: virtualConnection.statistics.messagesSent++,
        data: this.config.compressionEnabled 
          ? await this.compressMessage(message, virtualConnection.compressionState)
          : message,
        priority: this.calculateMessagePriority(message),
        noPingFrame: true // Mark as no-ping compatible
      };

      // Add to outbound stream
      const stream = this.messageStreams.get(virtualConnectionId);
      stream.outbound.push(multiplexedMessage);

      // Send through physical connection
      const sent = await this.sendThroughPhysicalConnection(physicalConnection, multiplexedMessage);
      
      if (sent) {
        // Update activity tracking (no ping required)
        virtualConnection.lastActivity = Date.now();
        virtualConnection.statistics.bytesTransferred += multiplexedMessage.data.length;
        
        this.logger.debug('Multiplexed message sent without ping', {
          virtualConnectionId,
          physicalConnectionId,
          sequence: multiplexedMessage.sequence,
          size: multiplexedMessage.data.length
        });
      }

      return sent;
    } catch (error) {
      this.logger.error('Failed to send multiplexed message', { 
        virtualConnectionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Receive and demultiplex messages without ping requirements
   */
  async receiveMultiplexedMessage(physicalConnectionId, rawMessage) {
    try {
      const physicalConnection = this.physicalConnections.get(physicalConnectionId);
      if (!physicalConnection) {
        throw new Error('Physical connection not found');
      }

      // Parse multiplexed message
      const message = await this.parseMultiplexedMessage(rawMessage);
      const virtualConnectionId = message.virtualConnectionId;
      
      const virtualConnection = this.virtualConnections.get(virtualConnectionId);
      if (!virtualConnection) {
        this.logger.warn('Received message for unknown virtual connection', { 
          virtualConnectionId,
          physicalConnectionId 
        });
        return null;
      }

      // Decompress if needed
      const decompressedData = this.config.compressionEnabled 
        ? await this.decompressMessage(message.data, virtualConnection.compressionState)
        : message.data;

      // Add to inbound stream
      const stream = this.messageStreams.get(virtualConnectionId);
      stream.inbound.push({
        ...message,
        data: decompressedData,
        receivedAt: Date.now()
      });

      // Update activity tracking (no ping required)
      virtualConnection.lastActivity = Date.now();
      virtualConnection.statistics.messagesReceived++;
      virtualConnection.statistics.bytesTransferred += decompressedData.length;

      // Update latency statistics
      if (message.responseToSequence !== undefined) {
        const originalMessage = stream.pending.get(message.responseToSequence);
        if (originalMessage) {
          const latency = Date.now() - originalMessage.timestamp;
          virtualConnection.statistics.averageLatency = 
            (virtualConnection.statistics.averageLatency + latency) / 2;
          stream.pending.delete(message.responseToSequence);
        }
      }

      this.logger.debug('Multiplexed message received without ping', {
        virtualConnectionId,
        physicalConnectionId,
        sequence: message.sequence,
        size: decompressedData.length
      });

      return {
        virtualConnectionId,
        data: decompressedData,
        metadata: {
          sequence: message.sequence,
          timestamp: message.timestamp,
          receivedAt: Date.now()
        }
      };
    } catch (error) {
      this.logger.error('Failed to receive multiplexed message', { 
        physicalConnectionId, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Smart reconnection without ping dependency
   */
  async smartReconnect(virtualConnectionId) {
    try {
      const virtualConnection = this.virtualConnections.get(virtualConnectionId);
      if (!virtualConnection) {
        throw new Error('Virtual connection not found');
      }

      this.logger.info('Initiating smart reconnection without ping', { virtualConnectionId });

      // Get optimal physical connection for reconnection
      const newPhysicalConnection = await this.getOptimalPhysicalConnection(
        virtualConnection.targetDC, 
        virtualConnection.physicalConnectionId // Exclude current failed connection
      );

      // Update connection mapping
      const oldPhysicalConnectionId = this.connectionMapping.get(virtualConnectionId);
      this.connectionMapping.set(virtualConnectionId, newPhysicalConnection.id);
      
      // Remove from old physical connection
      if (oldPhysicalConnectionId) {
        const oldPhysicalConnection = this.physicalConnections.get(oldPhysicalConnectionId);
        if (oldPhysicalConnection) {
          oldPhysicalConnection.virtualConnections.delete(virtualConnectionId);
        }
      }

      // Add to new physical connection
      newPhysicalConnection.virtualConnections.add(virtualConnectionId);
      virtualConnection.physicalConnectionId = newPhysicalConnection.id;
      virtualConnection.lastActivity = Date.now();

      // Replay pending messages if any
      const stream = this.messageStreams.get(virtualConnectionId);
      const pendingMessages = Array.from(stream.pending.values());
      
      for (const message of pendingMessages) {
        await this.sendThroughPhysicalConnection(newPhysicalConnection, message);
      }

      this.logger.info('Smart reconnection completed without ping', {
        virtualConnectionId,
        oldPhysicalConnectionId,
        newPhysicalConnectionId: newPhysicalConnection.id,
        pendingMessagesReplayed: pendingMessages.length
      });

      return true;
    } catch (error) {
      this.logger.error('Smart reconnection failed', { virtualConnectionId, error: error.message });
      return false;
    }
  }

  /**
   * Optimize connection pool without ping overhead
   */
  async optimizeConnectionPool() {
    try {
      const optimizations = {
        rebalanced: 0,
        consolidated: 0,
        created: 0,
        removed: 0
      };

      // Analyze current connection distribution
      const connectionStats = this.analyzeConnectionDistribution();
      
      // Rebalance overloaded connections
      for (const [physicalId, connection] of this.physicalConnections) {
        if (connection.virtualConnections.size > this.config.maxVirtualConnectionsPerPhysical) {
          const excess = connection.virtualConnections.size - this.config.maxVirtualConnectionsPerPhysical;
          await this.rebalanceVirtualConnections(physicalId, excess);
          optimizations.rebalanced += excess;
        }
      }

      // Remove underutilized physical connections
      for (const [physicalId, connection] of this.physicalConnections) {
        if (connection.virtualConnections.size === 0 && 
            Date.now() - connection.lastActivity > 5 * 60 * 1000) { // 5 minutes
          await this.removePhysicalConnection(physicalId);
          optimizations.removed++;
        }
      }

      // Create new connections if needed
      if (connectionStats.averageLoad > 0.8) {
        const newConnections = Math.ceil(connectionStats.totalVirtualConnections / this.config.maxVirtualConnectionsPerPhysical) - 
                              connectionStats.totalPhysicalConnections;
        
        for (let i = 0; i < newConnections; i++) {
          await this.createPhysicalConnection();
          optimizations.created++;
        }
      }

      this.logger.info('Connection pool optimized without ping overhead', optimizations);
      return optimizations;
    } catch (error) {
      this.logger.error('Failed to optimize connection pool', { error: error.message });
      return null;
    }
  }

  // Helper methods

  async getOptimalPhysicalConnection(targetDC, excludeConnectionId = null) {
    const availableConnections = Array.from(this.physicalConnections.values())
      .filter(conn => 
        conn.targetDC === targetDC && 
        conn.state === 'connected' &&
        conn.id !== excludeConnectionId &&
        conn.virtualConnections.size < this.config.maxVirtualConnectionsPerPhysical
      );

    if (availableConnections.length === 0) {
      // Create new physical connection
      return await this.createPhysicalConnection(targetDC);
    }

    // Apply load balancing strategy
    switch (this.config.loadBalancing) {
    case 'least_used':
      return availableConnections.reduce((best, current) => 
        current.virtualConnections.size < best.virtualConnections.size ? current : best
      );
    
    case 'adaptive':
      return availableConnections.reduce((best, current) => {
        const currentScore = this.calculateConnectionScore(current);
        const bestScore = this.calculateConnectionScore(best);
        return currentScore > bestScore ? current : best;
      });
    
    default: // round_robin
      const connectionArray = availableConnections.sort((a, b) => a.lastUsed - b.lastUsed);
      return connectionArray[0];
    }
  }

  async createPhysicalConnection(targetDC) {
    const connectionId = this.generatePhysicalConnectionId();
    
    const physicalConnection = {
      id: connectionId,
      targetDC,
      state: 'connected', // Simulate successful connection
      virtualConnections: new Set(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastUsed: 0,
      statistics: {
        totalMessages: 0,
        totalBytes: 0,
        averageLatency: 0,
        errorRate: 0
      }
    };

    this.physicalConnections.set(connectionId, physicalConnection);
    
    this.logger.info('Physical connection created', { connectionId, targetDC });
    return physicalConnection;
  }

  generateVirtualConnectionId(clientId) {
    return `vc_${clientId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generatePhysicalConnectionId() {
    return `pc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  calculateConnectionScore(connection) {
    const loadFactor = connection.virtualConnections.size / this.config.maxVirtualConnectionsPerPhysical;
    const latencyFactor = Math.min(connection.statistics.averageLatency / 1000, 1); // Normalize to 0-1
    const errorFactor = connection.statistics.errorRate;
    
    return (1 - loadFactor) * 0.5 + (1 - latencyFactor) * 0.3 + (1 - errorFactor) * 0.2;
  }

  calculateMessagePriority(message) {
    if (message.type === 'auth') return 10;
    if (message.type === 'control') return 8;
    if (message.type === 'urgent') return 6;
    if (message.type === 'data') return 4;
    return 2;
  }

  initCompressionState() {
    return {
      algorithm: 'gzip',
      dictionary: new Map(),
      enabled: this.config.compressionEnabled
    };
  }

  async compressMessage(message, compressionState) {
    // Placeholder for compression logic
    return message;
  }

  async decompressMessage(compressedMessage, compressionState) {
    // Placeholder for decompression logic
    return compressedMessage;
  }

  async parseMultiplexedMessage(rawMessage) {
    // Placeholder for message parsing logic
    return {
      virtualConnectionId: 'placeholder',
      sequence: 1,
      timestamp: Date.now(),
      data: rawMessage
    };
  }

  async sendThroughPhysicalConnection(physicalConnection, message) {
    // Placeholder for actual sending logic
    physicalConnection.lastActivity = Date.now();
    physicalConnection.statistics.totalMessages++;
    return true;
  }

  analyzeConnectionDistribution() {
    const totalVirtualConnections = this.virtualConnections.size;
    const totalPhysicalConnections = this.physicalConnections.size;
    const averageLoad = totalPhysicalConnections > 0 ? 
      totalVirtualConnections / (totalPhysicalConnections * this.config.maxVirtualConnectionsPerPhysical) : 0;

    return {
      totalVirtualConnections,
      totalPhysicalConnections,
      averageLoad
    };
  }

  async rebalanceVirtualConnections(physicalConnectionId, excessCount) {
    // Placeholder for rebalancing logic
    this.logger.debug('Rebalancing virtual connections', { physicalConnectionId, excessCount });
  }

  async removePhysicalConnection(connectionId) {
    this.physicalConnections.delete(connectionId);
    this.logger.info('Physical connection removed', { connectionId });
  }
}