/**
 * MTProto Message Handler
 * Handles various MTProto message types and routing
 */

export class MessageHandler {
  constructor(env) {
    this.env = env;
    this.messageHandlers = new Map();
    this.initializeHandlers();
  }

  /**
   * Initialize message handlers for different constructors
   */
  initializeHandlers() {
    // Core message handlers
    this.messageHandlers.set(0x7abe77ec, this.handlePing.bind(this));
    this.messageHandlers.set(0x347773c5, this.handlePong.bind(this));
    this.messageHandlers.set(0x62d6b459, this.handleMsgsAck.bind(this));
    this.messageHandlers.set(0x73f1f8dc, this.handleMsgContainer.bind(this));

    // API method handlers
    this.messageHandlers.set(0xf35c6d58, this.handleGetConfig.bind(this));
    this.messageHandlers.set(0x9389b275, this.handleGetNearestDc.bind(this));
    this.messageHandlers.set(0x1b3f5e13, this.handleInitConnection.bind(this));

    // User and authentication handlers
    this.messageHandlers.set(0x8e1a1775, this.handleGetUsers.bind(this));
    this.messageHandlers.set(0x6fe51dfb, this.handleGetFullUser.bind(this));

    // Updates and long polling
    this.messageHandlers.set(0x9299359f, this.handleGetUpdates.bind(this));
    this.messageHandlers.set(0xedd42c4e, this.handleGetDifference.bind(this));
  }

  /**
   * Main message handler router
   */
  async handle(message, _request = null) {
    try {
      const { constructor, data } = message;
      const handler = this.messageHandlers.get(constructor);

      if (handler) {
        return await handler(message, _request);
      } else {
        // Handle unknown methods by proxying to Telegram
        return await this.handleUnknownMethod(message, _request);
      }
    } catch (error) {
      console.error('Message handler error:', error);
      return this.createErrorResponse(message, error);
    }
  }

  /**
   * Handle ping messages
   */
  async handlePing(message, _request) {
    const pingId = this.readInt64(message.data, 0);

    return this.createResponse(message, 0x347773c5, writer => {
      writer.writeInt64(message.messageId);
      writer.writeInt64(pingId);
    });
  }

  /**
   * Handle pong messages
   */
  async handlePong(message, _request) {
    // Pong is usually a response, not something we handle
    // But we can log it for monitoring
    console.log('Received pong:', message);
    return null;
  }

  /**
   * Handle message acknowledgments
   */
  async handleMsgsAck(message, _request) {
    // Read vector of message IDs
    const count = this.readInt32(message.data, 4); // Skip vector constructor
    const messageIds = [];

    for (let i = 0; i < count; i++) {
      const msgId = this.readInt64(message.data, 8 + i * 8);
      messageIds.push(msgId);
    }

    console.log('Acknowledged messages:', messageIds);
    return null; // No response needed
  }

  /**
   * Handle message containers
   */
  async handleMsgContainer(message, _request) {
    const count = this.readInt32(message.data, 0);
    const responses = [];
    let offset = 4;

    for (let i = 0; i < count; i++) {
      // Read message from container
      const msgId = this.readInt64(message.data, offset);
      offset += 8;
      const seqNo = this.readInt32(message.data, offset);
      offset += 4;
      const length = this.readInt32(message.data, offset);
      offset += 4;
      const body = message.data.slice(offset, offset + length);
      offset += length;

      // Create inner message
      const innerMessage = {
        messageId: msgId,
        seqNo,
        constructor: this.readInt32(body, 0),
        data: body.slice(4)
      };

      // Handle inner message
      const response = await this.handle(innerMessage, _request);
      if (response) {
        responses.push(response);
      }
    }

    // Return container with responses if any
    if (responses.length > 0) {
      return this.createMsgContainer(message, responses);
    }

    return null;
  }

  /**
   * Handle getConfig API call
   */
  async handleGetConfig(message, _request) {
    // Return a basic config response
    const config = {
      date: Math.floor(Date.now() / 1000),
      expires: Math.floor(Date.now() / 1000) + 3600,
      test_mode: false,
      this_dc: 1,
      dc_options: [
        { id: 1, ip_address: '149.154.175.50', port: 443 },
        { id: 2, ip_address: '149.154.167.51', port: 443 },
        { id: 3, ip_address: '149.154.175.100', port: 443 },
        { id: 4, ip_address: '149.154.167.91', port: 443 },
        { id: 5, ip_address: '91.108.56.130', port: 443 }
      ]
    };

    return this.createResponse(message, 0x330b4067, writer => {
      // Simplified config serialization
      writer.writeInt32(config.date);
      writer.writeInt32(config.expires);
      writer.writeInt32(config.test_mode ? 1 : 0);
      writer.writeInt32(config.this_dc);

      // DC options vector
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(config.dc_options.length);

      for (const dc of config.dc_options) {
        writer.writeInt32(0x05d8c6cc); // dcOption constructor
        writer.writeInt32(dc.id);
        writer.writeString(dc.ip_address);
        writer.writeInt32(dc.port);
      }
    });
  }

  /**
   * Handle getNearestDc API call
   */
  async handleGetNearestDc(message, _request) {
    // Determine nearest DC based on request origin
    let nearestDc = 1;

    if (request && request.cf && request.cf.country) {
      const country = request.cf.country;

      // Simple geographic mapping
      if (['US', 'CA', 'MX'].includes(country)) {
        nearestDc = 2;
      } else if (['GB', 'DE', 'FR', 'IT', 'ES'].includes(country)) {
        nearestDc = 1;
      } else if (['RU', 'UA', 'BY', 'KZ'].includes(country)) {
        nearestDc = 3;
      } else if (['IN', 'SG', 'JP', 'KR'].includes(country)) {
        nearestDc = 4;
      } else {
        nearestDc = 5;
      }
    }

    return this.createResponse(message, 0x8e1a1775, writer => {
      writer.writeInt32(nearestDc);
      writer.writeInt32(nearestDc); // this_dc
    });
  }

  /**
   * Handle initConnection API call
   */
  async handleInitConnection(message, _request) {
    // Parse init connection parameters
    // This is a complex TL object, simplified for demo

    return this.createResponse(message, 0x8cc0d131, writer => {
      // Return success response
      writer.writeInt32(1); // Success flag
    });
  }

  /**
   * Handle getUsers API call
   */
  async handleGetUsers(message, _request) {
    // This would typically query a user database
    // For demo, return empty vector

    return this.createResponse(message, 0x1cb5c415, writer => {
      writer.writeInt32(0); // Empty vector
    });
  }

  /**
   * Handle getFullUser API call
   */
  async handleGetFullUser(message, _request) {
    // Return a basic user object
    return this.createResponse(message, 0x8ea4a881, writer => {
      // Simplified userFull object
      writer.writeInt32(0x8ea4a881); // userFull constructor
      // Would contain user data in real implementation
    });
  }

  /**
   * Handle getUpdates API call
   */
  async handleGetUpdates(message, _request) {
    // Return empty updates for demo
    return this.createResponse(message, 0x74ae4240, writer => {
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty updates vector
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty users vector
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty chats vector
      writer.writeInt32(Math.floor(Date.now() / 1000)); // date
      writer.writeInt32(0); // seq
    });
  }

  /**
   * Handle getDifference API call
   */
  async handleGetDifference(message, _request) {
    // Return empty difference for demo
    return this.createResponse(message, 0x00f49ca0, writer => {
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty new_messages
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty new_encrypted_messages
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty other_updates
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty chats
      writer.writeInt32(0x1cb5c415); // Vector constructor
      writer.writeInt32(0); // Empty users
      writer.writeInt32(Math.floor(Date.now() / 1000)); // date
      writer.writeInt32(0); // seq
    });
  }

  /**
   * Handle unknown methods by proxying to Telegram
   */
  async handleUnknownMethod(message, _request) {
    try {
      // In a real proxy, this would forward the message to Telegram servers
      // For demo, return a generic error

      console.log('Unknown method, would proxy to Telegram:', {
        constructor: message.constructor.toString(16),
        messageId: message.messageId
      });

      return this.createErrorResponse(message, new Error('Method not implemented'));
    } catch (error) {
      console.error('Proxy error:', error);
      return this.createErrorResponse(message, error);
    }
  }

  /**
   * Create response message
   */
  createResponse(originalMessage, constructor, writeBody) {
    const writer = new DataWriter();

    // Write constructor
    writer.writeInt32(constructor);

    // Write body using provided function
    if (writeBody) {
      writeBody(writer);
    }

    return {
      authKeyId: originalMessage.authKeyId || 0n,
      messageId: this.generateMessageId(),
      body: writer.getData()
    };
  }

  /**
   * Create error response
   */
  createErrorResponse(originalMessage, error) {
    return this.createResponse(originalMessage, 0x2144ca19, writer => {
      writer.writeInt32(500); // Error code
      writer.writeString(error.message || 'Internal error');
    });
  }

  /**
   * Create message container response
   */
  createMsgContainer(originalMessage, responses) {
    return this.createResponse(originalMessage, 0x73f1f8dc, writer => {
      writer.writeInt32(responses.length);

      for (const response of responses) {
        writer.writeInt64(response.messageId);
        writer.writeInt32(0); // seqNo
        writer.writeInt32(response.body.length);
        writer.writeBytes(response.body);
      }
    });
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    const now = Math.floor(Date.now() / 1000);
    const counter = Math.floor(Math.random() * 0xffffffff);
    return BigInt(now) * 2n ** 32n + BigInt(counter);
  }

  /**
   * Read 32-bit integer from buffer
   */
  readInt32(buffer, offset) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
    return view.getInt32(0, true);
  }

  /**
   * Read 64-bit integer from buffer
   */
  readInt64(buffer, offset) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
    const low = view.getUint32(0, true);
    const high = view.getUint32(4, true);
    return BigInt(high) * 2n ** 32n + BigInt(low);
  }
}

/**
 * Simple data writer for responses
 */
class DataWriter {
  constructor() {
    this.buffers = [];
    this.length = 0;
  }

  writeInt32(value) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, value, true);
    this.buffers.push(new Uint8Array(buffer));
    this.length += 4;
  }

  writeInt64(value) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const bigintValue = BigInt(value);
    const low = Number(bigintValue & 0xffffffffn);
    const high = Number(bigintValue >> 32n);
    view.setUint32(0, low, true);
    view.setUint32(4, high, true);
    this.buffers.push(new Uint8Array(buffer));
    this.length += 8;
  }

  writeBytes(bytes) {
    this.buffers.push(new Uint8Array(bytes));
    this.length += bytes.length;
  }

  writeString(str) {
    const bytes = new TextEncoder().encode(str);
    this.writeInt32(bytes.length);
    this.writeBytes(bytes);

    const padding = (4 - (bytes.length % 4)) % 4;
    if (padding > 0) {
      this.writeBytes(new Uint8Array(padding));
    }
  }

  getData() {
    const result = new Uint8Array(this.length);
    let offset = 0;

    for (const buffer of this.buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }

    return result;
  }
}
