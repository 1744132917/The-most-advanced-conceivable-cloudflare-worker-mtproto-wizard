/**
 * MTProto Protocol Handler
 * Implements MTProto 2.0 with advanced features
 */

import { CryptoModule } from '../crypto/module.js';
import { MTProtoCodec } from './codec.js';
import { MessageHandler } from './messages.js';
import { AuthHandler } from './auth.js';

export class MTProtoHandler {
  constructor(env) {
    this.env = env;
    this.crypto = new CryptoModule();
    this.codec = new MTProtoCodec();
    this.messageHandler = new MessageHandler(env);
    this.authHandler = new AuthHandler(env);
    this.version = env.MTPROTO_VERSION || '2.0';
  }

  /**
   * Handle HTTP MTProto requests
   */
  async handleHTTP(request) {
    try {
      const body = await request.arrayBuffer();
      const data = new Uint8Array(body);

      // Parse MTProto message
      const message = await this.codec.decode(data);
      if (!message) {
        return new Response('Invalid MTProto message', { status: 400 });
      }

      // Process the message
      const response = await this.processMessage(message, request);

      // Encode response
      const encodedResponse = await this.codec.encode(response);

      return new Response(encodedResponse, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    } catch (error) {
      console.error('MTProto HTTP error:', error);
      return new Response('MTProto Error', { status: 500 });
    }
  }

  /**
   * Handle WebSocket MTProto messages
   */
  async handleWebSocket(data) {
    try {
      const message = await this.codec.decode(data);
      if (!message) {
        return null;
      }

      const response = await this.processMessage(message);
      return await this.codec.encode(response);
    } catch (error) {
      console.error('MTProto WebSocket error:', error);
      return null;
    }
  }

  /**
   * Process MTProto message based on type
   */
  async processMessage(message, request = null) {
    const { authKeyId, messageId, seqNo, body } = message;

    // Handle unencrypted messages (initial handshake)
    if (authKeyId === 0n) {
      return await this.handleUnencryptedMessage(body);
    }

    // Handle encrypted messages
    return await this.handleEncryptedMessage(message, request);
  }

  /**
   * Handle unencrypted messages (key exchange, auth)
   */
  async handleUnencryptedMessage(body) {
    try {
      const constructor = this.readInt32(body, 0);

      switch (constructor) {
      case 0x60469778: // req_pq
        return await this.authHandler.handleReqPq(body);

      case 0xd712e4be: // req_DH_params
        return await this.authHandler.handleReqDHParams(body);

      case 0xf5045f1f: // set_client_DH_params
        return await this.authHandler.handleSetClientDHParams(body);

      default:
        throw new Error(`Unknown unencrypted constructor: ${constructor.toString(16)}`);
      }
    } catch (error) {
      console.error('Unencrypted message error:', error);
      throw error;
    }
  }

  /**
   * Handle encrypted messages
   */
  async handleEncryptedMessage(message, request) {
    try {
      // Decrypt message if needed
      const decryptedBody = await this.crypto.decryptMessage(message);

      // Parse inner message
      const innerMessage = await this.codec.parseInnerMessage(decryptedBody);

      // Route to appropriate handler
      return await this.messageHandler.handle(innerMessage, request);
    } catch (error) {
      console.error('Encrypted message error:', error);
      throw error;
    }
  }

  /**
   * Create MTProto proxy connection
   */
  async createProxyConnection(targetUrl, authData) {
    try {
      // Validate target URL (should be Telegram DC)
      if (!this.isValidTelegramDC(targetUrl)) {
        throw new Error('Invalid Telegram DC URL');
      }

      // Create connection with MTProto wrapper
      const connection = {
        url: targetUrl,
        authData: authData,
        created: Date.now(),
        lastActivity: Date.now()
      };

      return connection;
    } catch (error) {
      console.error('Proxy connection error:', error);
      throw error;
    }
  }

  /**
   * Proxy MTProto data to Telegram servers
   */
  async proxyToTelegram(data, connection) {
    try {
      const response = await fetch(connection.url, {
        method: 'POST',
        body: data,
        headers: {
          'Content-Type': 'application/octet-stream',
          'User-Agent': 'Mozilla/5.0 (compatible; MTProtoWizard/1.0)'
        }
      });

      if (!response.ok) {
        throw new Error(`Telegram server error: ${response.status}`);
      }

      const responseData = await response.arrayBuffer();
      return new Uint8Array(responseData);
    } catch (error) {
      console.error('Telegram proxy error:', error);
      throw error;
    }
  }

  /**
   * Validate if URL is a legitimate Telegram DC
   */
  isValidTelegramDC(url) {
    const telegramDCs = [
      'https://149.154.175.50', // DC1
      'https://149.154.167.51', // DC2
      'https://149.154.175.100', // DC3
      'https://149.154.167.91', // DC4
      'https://91.108.56.130' // DC5
      // Add more DCs as needed
    ];

    return telegramDCs.some(dc => url.startsWith(dc));
  }

  /**
   * Utility function to read 32-bit integer from buffer
   */
  readInt32(buffer, offset) {
    const view = new DataView(buffer);
    return view.getInt32(offset, true); // little-endian
  }

  /**
   * Generate secure random bytes
   */
  generateRandomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Calculate message hash for integrity verification
   */
  async calculateMessageHash(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Advanced anti-censorship message obfuscation
   */
  async obfuscateMessage(data, key) {
    // Implement advanced obfuscation techniques
    // This could include domain fronting, traffic shaping, etc.
    const obfuscated = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      obfuscated[i] = data[i] ^ key[i % key.length];
    }

    return obfuscated;
  }

  /**
   * Deobfuscate message
   */
  async deobfuscateMessage(data, key) {
    // Reverse the obfuscation
    return await this.obfuscateMessage(data, key); // XOR is its own inverse
  }
}
