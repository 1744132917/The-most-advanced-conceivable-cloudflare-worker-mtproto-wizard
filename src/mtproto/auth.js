/**
 * MTProto Authentication Handler
 * Handles key exchange and authentication process
 */

import { CryptoModule } from '../crypto/module.js';

export class AuthHandler {
  constructor(env) {
    this.env = env;
    this.crypto = new CryptoModule();
    this.publicKeys = new Map();
    this.tempSessions = new Map();
    this.initializePublicKeys();
  }

  /**
   * Initialize Telegram public keys for authentication
   */
  initializePublicKeys() {
    // These are example RSA public keys - in production, use real Telegram keys
    const telegramPublicKey = {
      n: BigInt(
        '0x' +
          'C150023E2F70DB7985DED064759CFECF0AF328E69A41DAF4D6F01B538135A6F9' +
          '1F8F8B2A0EC9BA9720CE352EFCF6C5680FFC424BD634864902DE0B4BD6D49F4E' +
          '580230E3AE97D95C8B19442B3C0A10D8F5633FECEDD6926A7F6DAB0DDB7D457F' +
          '9EA81B8465FCD6FFFEED114011DF91C059CAEDAF97625F6C96ECC74725556934' +
          'EF781D866B34F011FCE4D835A090196E9A5F0E4449AF7EB697DDB9076494CA5F' +
          '81104A305B6DD27665722C46B60E5DF680FB16B210607EF217652E60236C255F' +
          '6A28315F4083A96791D7214BF64C1DF4FD0DB1944FB26A2A5581016A1AF00FA' +
          'B15469B36F73306307B9AC5A73D3C0B0E14AA9E52D1'
      ),
      e: 65537n,
      fingerprint: BigInt('0x216be86c022bb4c3')
    };

    this.publicKeys.set(telegramPublicKey.fingerprint, telegramPublicKey);
  }

  /**
   * Handle req_pq request
   */
  async handleReqPq(body) {
    try {
      // Parse request
      const nonce = body.slice(4, 20); // Skip constructor, read 16-byte nonce

      // Generate server nonce
      const serverNonce = this.crypto.generateRandomBytes(16);

      // Generate PQ (product of two primes)
      const { p, q, pq } = this.generatePQ();

      // Get server public key fingerprints
      const fingerprints = Array.from(this.publicKeys.keys());

      // Create response
      const response = await this.createResPQ(nonce, serverNonce, pq, fingerprints);

      // Store session data
      const sessionKey = this.bytesToHex(nonce);
      this.tempSessions.set(sessionKey, {
        nonce,
        serverNonce,
        p,
        q,
        pq,
        created: Date.now()
      });

      return response;
    } catch (error) {
      console.error('req_pq error:', error);
      throw error;
    }
  }

  /**
   * Handle req_DH_params request
   */
  async handleReqDHParams(body) {
    try {
      // Parse request
      let offset = 4; // Skip constructor
      const nonce = body.slice(offset, offset + 16);
      offset += 16;
      const serverNonce = body.slice(offset, offset + 16);
      offset += 16;

      // Read P and Q strings
      const pLength = new DataView(body.buffer, body.byteOffset + offset).getUint32(offset, true);
      offset += 4;
      const p = body.slice(offset, offset + pLength);
      offset += pLength + ((4 - (pLength % 4)) % 4); // padding

      const qLength = new DataView(body.buffer, body.byteOffset + offset).getUint32(offset, true);
      offset += 4;
      const q = body.slice(offset, offset + qLength);
      offset += qLength + ((4 - (qLength % 4)) % 4); // padding

      // Read public key fingerprint
      const fingerprint = new DataView(body.buffer, body.byteOffset + offset).getBigUint64(
        offset,
        true
      );
      offset += 8;

      // Read encrypted data
      const encDataLength = new DataView(body.buffer, body.byteOffset + offset).getUint32(
        offset,
        true
      );
      offset += 4;
      const encryptedData = body.slice(offset, offset + encDataLength);

      // Validate session
      const sessionKey = this.bytesToHex(nonce);
      const session = this.tempSessions.get(sessionKey);
      if (!session) {
        throw new Error('Session not found');
      }

      // Validate nonces and PQ values
      if (
        !this.arraysEqual(nonce, session.nonce) ||
        !this.arraysEqual(serverNonce, session.serverNonce)
      ) {
        throw new Error('Nonce mismatch');
      }

      // Decrypt the encrypted data
      const publicKey = this.publicKeys.get(fingerprint);
      if (!publicKey) {
        throw new Error('Unknown public key fingerprint');
      }

      // In a real implementation, decrypt with private key
      // For this demo, we'll simulate the process
      const dhParams = await this.generateDHParams();

      // Update session
      session.dhParams = dhParams;
      session.publicKeyFingerprint = fingerprint;

      // Create server_DH_params_ok response
      const response = await this.createServerDHParamsOk(nonce, serverNonce, dhParams);

      return response;
    } catch (error) {
      console.error('req_DH_params error:', error);
      throw error;
    }
  }

  /**
   * Handle set_client_DH_params request
   */
  async handleSetClientDHParams(body) {
    try {
      // Parse request
      let offset = 4; // Skip constructor
      const nonce = body.slice(offset, offset + 16);
      offset += 16;
      const serverNonce = body.slice(offset, offset + 16);
      offset += 16;

      // Read encrypted data
      const encDataLength = new DataView(body.buffer, body.byteOffset + offset).getUint32(
        offset,
        true
      );
      offset += 4;
      const encryptedData = body.slice(offset, offset + encDataLength);

      // Validate session
      const sessionKey = this.bytesToHex(nonce);
      const session = this.tempSessions.get(sessionKey);
      if (!session) {
        throw new Error('Session not found');
      }

      // In real implementation, decrypt and validate client DH params
      // Generate auth key
      const authKey = this.crypto.generateRandomBytes(256); // 2048-bit key

      // Calculate auth key hash
      const authKeyHash = await this.crypto.sha1(authKey);
      const authKeyId = authKeyHash.slice(-8); // Last 8 bytes

      // Store auth key
      session.authKey = authKey;
      session.authKeyId = authKeyId;

      // Generate new nonce hash
      const newNonceHash1 = authKeyHash.slice(0, 16);

      // Create dh_gen_ok response
      const response = await this.createDHGenOk(nonce, serverNonce, newNonceHash1);

      return response;
    } catch (error) {
      console.error('set_client_DH_params error:', error);
      throw error;
    }
  }

  /**
   * Generate PQ (product of two primes)
   */
  generatePQ() {
    // For demo purposes, use small primes
    // In production, use cryptographically secure large primes
    const p = 17n;
    const q = 19n;
    const pq = p * q;

    return {
      p: this.bigIntToBytes(p),
      q: this.bigIntToBytes(q),
      pq: this.bigIntToBytes(pq)
    };
  }

  /**
   * Generate Diffie-Hellman parameters
   */
  async generateDHParams() {
    const dhKeyPair = await this.crypto.generateDHKeyPair();

    return {
      g: dhKeyPair.generator,
      dhPrime: dhKeyPair.prime,
      ga: dhKeyPair.publicKey
    };
  }

  /**
   * Create resPQ response
   */
  async createResPQ(nonce, serverNonce, pq, fingerprints) {
    const writer = new DataWriter();

    // Constructor
    writer.writeInt32(0x05162463);

    // Nonce
    writer.writeBytes(nonce);

    // Server nonce
    writer.writeBytes(serverNonce);

    // PQ
    writer.writeString(pq);

    // Server public key fingerprints vector
    writer.writeInt32(0x1cb5c415); // Vector constructor
    writer.writeInt32(fingerprints.length);
    for (const fp of fingerprints) {
      writer.writeInt64(fp);
    }

    return writer.getData();
  }

  /**
   * Create server_DH_params_ok response
   */
  async createServerDHParamsOk(nonce, serverNonce, dhParams) {
    const writer = new DataWriter();

    // Constructor
    writer.writeInt32(0xd0e8075c);

    // Nonce
    writer.writeBytes(nonce);

    // Server nonce
    writer.writeBytes(serverNonce);

    // Encrypted answer (would contain DH params in real implementation)
    const encryptedAnswer = this.crypto.generateRandomBytes(256);
    writer.writeString(encryptedAnswer);

    return writer.getData();
  }

  /**
   * Create dh_gen_ok response
   */
  async createDHGenOk(nonce, serverNonce, newNonceHash1) {
    const writer = new DataWriter();

    // Constructor
    writer.writeInt32(0x3bcbf734);

    // Nonce
    writer.writeBytes(nonce);

    // Server nonce
    writer.writeBytes(serverNonce);

    // New nonce hash
    writer.writeBytes(newNonceHash1);

    return writer.getData();
  }

  /**
   * Convert BigInt to byte array
   */
  bigIntToBytes(bigint) {
    const hex = bigint.toString(16);
    const paddedHex = hex.length % 2 ? '0' + hex : hex;
    const bytes = new Uint8Array(paddedHex.length / 2);

    for (let i = 0; i < paddedHex.length; i += 2) {
      bytes[i / 2] = parseInt(paddedHex.substr(i, 2), 16);
    }

    return bytes;
  }

  /**
   * Convert bytes to hex string
   */
  bytesToHex(bytes) {
    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Check if two arrays are equal
   */
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, session] of this.tempSessions) {
      if (now - session.created > maxAge) {
        this.tempSessions.delete(key);
      }
    }
  }

  /**
   * Get auth key for session
   */
  getAuthKey(sessionKey) {
    const session = this.tempSessions.get(sessionKey);
    return session ? session.authKey : null;
  }

  /**
   * Validate auth key
   */
  async validateAuthKey(authKey, authKeyId) {
    const calculatedHash = await this.crypto.sha1(authKey);
    const calculatedId = calculatedHash.slice(-8);

    return this.arraysEqual(authKeyId, calculatedId);
  }
}

/**
 * Data writer utility (simplified version)
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

  writeString(data) {
    const bytes = new Uint8Array(data);
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
