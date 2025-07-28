/**
 * MTProto Message Codec
 * Handles encoding and decoding of MTProto messages
 */

export class MTProtoCodec {
  constructor() {
    this.constructors = new Map();
    this.initializeConstructors();
  }

  /**
   * Initialize known MTProto constructors
   */
  initializeConstructors() {
    // Core MTProto constructors
    this.constructors.set(0x60469778, 'req_pq');
    this.constructors.set(0x05162463, 'resPQ');
    this.constructors.set(0xd712e4be, 'req_DH_params');
    this.constructors.set(0xd0e8075c, 'server_DH_params_ok');
    this.constructors.set(0xf5045f1f, 'set_client_DH_params');
    this.constructors.set(0x3bcbf734, 'dh_gen_ok');
    this.constructors.set(0x46dc1fb9, 'dh_gen_retry');
    this.constructors.set(0xa69dae02, 'dh_gen_fail');

    // Message containers and wrappers
    this.constructors.set(0x73f1f8dc, 'msg_container');
    this.constructors.set(0xa7eff811, 'msg_copy');
    this.constructors.set(0x276d3ec6, 'msg_detailed_info');
    this.constructors.set(0x809db6df, 'msg_new_detailed_info');

    // Service messages
    this.constructors.set(0x62d6b459, 'msgs_ack');
    this.constructors.set(0xedab447b, 'bad_msg_notification');
    this.constructors.set(0xa7eff811, 'bad_server_salt');
    this.constructors.set(0x347773c5, 'pong');
    this.constructors.set(0x7abe77ec, 'ping');

    // RPC-related
    this.constructors.set(0x44f9b43d, 'rpc_drop_answer');
    this.constructors.set(0x58e4a740, 'rpc_answer_unknown');
    this.constructors.set(0x5e2ad36e, 'rpc_answer_dropped_running');
    this.constructors.set(0xcd78e586, 'rpc_answer_dropped');
  }

  /**
   * Decode MTProto message from binary data
   */
  async decode(data) {
    try {
      if (data.length < 20) {
        throw new Error('Message too short');
      }

      const reader = new DataReader(data);

      // Read auth_key_id (8 bytes)
      const authKeyId = reader.readInt64();

      // Read message_id (8 bytes)
      const messageId = reader.readInt64();

      // Read message_length (4 bytes)
      const messageLength = reader.readInt32();

      // Validate message length
      if (messageLength > data.length - 16 || messageLength < 0) {
        throw new Error('Invalid message length');
      }

      // Read message body
      const body = reader.readBytes(messageLength);

      return {
        authKeyId,
        messageId,
        messageLength,
        body,
        isEncrypted: authKeyId !== 0n
      };
    } catch (error) {
      console.error('Decode error:', error);
      return null;
    }
  }

  /**
   * Encode MTProto message to binary data
   */
  async encode(message) {
    try {
      const writer = new DataWriter();

      // Write auth_key_id
      writer.writeInt64(message.authKeyId || 0n);

      // Write message_id
      writer.writeInt64(message.messageId || this.generateMessageId());

      // Write message_length
      const bodyData = message.body;
      writer.writeInt32(bodyData.length);

      // Write message body
      writer.writeBytes(bodyData);

      return writer.getData();
    } catch (error) {
      console.error('Encode error:', error);
      throw error;
    }
  }

  /**
   * Parse inner message from decrypted data
   */
  async parseInnerMessage(data) {
    const reader = new DataReader(data);

    // Read salt (8 bytes)
    const salt = reader.readInt64();

    // Read session_id (8 bytes)
    const sessionId = reader.readInt64();

    // Read message_id (8 bytes)
    const messageId = reader.readInt64();

    // Read seq_no (4 bytes)
    const seqNo = reader.readInt32();

    // Read message_length (4 bytes)
    const messageLength = reader.readInt32();

    // Read constructor (4 bytes)
    const constructor = reader.readInt32();

    // Read remaining data
    const remainingData = reader.readBytes(messageLength - 4);

    return {
      salt,
      sessionId,
      messageId,
      seqNo,
      messageLength,
      constructor,
      constructorName: this.constructors.get(constructor) || 'unknown',
      data: remainingData
    };
  }

  /**
   * Encode inner message
   */
  async encodeInnerMessage(message) {
    const writer = new DataWriter();

    // Write salt
    writer.writeInt64(message.salt || 0n);

    // Write session_id
    writer.writeInt64(message.sessionId || 0n);

    // Write message_id
    writer.writeInt64(message.messageId || this.generateMessageId());

    // Write seq_no
    writer.writeInt32(message.seqNo || 0);

    // Calculate and write message_length
    const bodyLength = 4 + (message.data ? message.data.length : 0);
    writer.writeInt32(bodyLength);

    // Write constructor
    writer.writeInt32(message.constructor || 0);

    // Write data
    if (message.data) {
      writer.writeBytes(message.data);
    }

    return writer.getData();
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    // MTProto message ID: time in seconds * 2^32 + incremental counter
    const now = Math.floor(Date.now() / 1000);
    const counter = Math.floor(Math.random() * 0xffffffff);
    return BigInt(now) * 2n ** 32n + BigInt(counter);
  }

  /**
   * Parse TL (Type Language) object
   */
  parseTLObject(data, offset = 0) {
    const reader = new DataReader(data, offset);
    const constructor = reader.readInt32();

    // Handle known constructors
    switch (constructor) {
    case 0x05162463: // resPQ
      return this.parseResPQ(reader);

    case 0xd0e8075c: // server_DH_params_ok
      return this.parseServerDHParamsOk(reader);

    case 0x3bcbf734: // dh_gen_ok
      return this.parseDHGenOk(reader);

    default:
      return {
        constructor,
        constructorName: this.constructors.get(constructor) || 'unknown',
        data: reader.readRemaining()
      };
    }
  }

  /**
   * Parse resPQ response
   */
  parseResPQ(reader) {
    const nonce = reader.readBytes(16);
    const serverNonce = reader.readBytes(16);
    const pq = reader.readString();
    const serverPublicKeyFingerprints = reader.readVector('long');

    return {
      constructor: 0x05162463,
      constructorName: 'resPQ',
      nonce,
      serverNonce,
      pq,
      serverPublicKeyFingerprints
    };
  }

  /**
   * Parse server_DH_params_ok
   */
  parseServerDHParamsOk(reader) {
    const nonce = reader.readBytes(16);
    const serverNonce = reader.readBytes(16);
    const encryptedAnswer = reader.readString();

    return {
      constructor: 0xd0e8075c,
      constructorName: 'server_DH_params_ok',
      nonce,
      serverNonce,
      encryptedAnswer
    };
  }

  /**
   * Parse dh_gen_ok
   */
  parseDHGenOk(reader) {
    const nonce = reader.readBytes(16);
    const serverNonce = reader.readBytes(16);
    const newNonceHash1 = reader.readBytes(16);

    return {
      constructor: 0x3bcbf734,
      constructorName: 'dh_gen_ok',
      nonce,
      serverNonce,
      newNonceHash1
    };
  }

  /**
   * Create TL object for req_pq
   */
  createReqPQ(nonce) {
    const writer = new DataWriter();
    writer.writeInt32(0x60469778); // req_pq constructor
    writer.writeBytes(nonce);
    return writer.getData();
  }

  /**
   * Create TL object for req_DH_params
   */
  createReqDHParams(nonce, serverNonce, p, q, publicKeyFingerprint, encryptedData) {
    const writer = new DataWriter();
    writer.writeInt32(0xd712e4be); // req_DH_params constructor
    writer.writeBytes(nonce);
    writer.writeBytes(serverNonce);
    writer.writeString(p);
    writer.writeString(q);
    writer.writeInt64(publicKeyFingerprint);
    writer.writeString(encryptedData);
    return writer.getData();
  }

  /**
   * Validate message integrity
   */
  validateMessage(message) {
    // Check basic structure
    if (!message || !message.messageId || !message.body) {
      return false;
    }

    // Check message ID format (should be reasonable timestamp)
    const msgId = Number(message.messageId);
    const now = Date.now() / 1000;
    const msgTime = msgId / 2 ** 32;

    // Message should be within reasonable time bounds (±300 seconds)
    if (Math.abs(msgTime - now) > 300) {
      return false;
    }

    return true;
  }
}

/**
 * Data reader utility for binary MTProto data
 */
class DataReader {
  constructor(data, offset = 0) {
    this.data = data;
    this.offset = offset;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  readInt32() {
    const value = this.view.getInt32(this.offset, true); // little-endian
    this.offset += 4;
    return value;
  }

  readInt64() {
    const low = this.view.getUint32(this.offset, true);
    const high = this.view.getUint32(this.offset + 4, true);
    this.offset += 8;
    return BigInt(high) * 2n ** 32n + BigInt(low);
  }

  readBytes(length) {
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  readString() {
    const length = this.readInt32();
    const padding = (4 - (length % 4)) % 4;
    const data = this.readBytes(length);
    this.offset += padding; // Skip padding
    return data;
  }

  readVector(type) {
    const count = this.readInt32();
    const items = [];

    for (let i = 0; i < count; i++) {
      switch (type) {
      case 'int':
        items.push(this.readInt32());
        break;
      case 'long':
        items.push(this.readInt64());
        break;
      default:
        throw new Error(`Unknown vector type: ${type}`);
      }
    }

    return items;
  }

  readRemaining() {
    const remaining = this.data.slice(this.offset);
    this.offset = this.data.length;
    return remaining;
  }

  hasMore() {
    return this.offset < this.data.length;
  }
}

/**
 * Data writer utility for binary MTProto data
 */
class DataWriter {
  constructor() {
    this.buffers = [];
    this.length = 0;
  }

  writeInt32(value) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, value, true); // little-endian
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

    // Add padding to align to 4 bytes
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
