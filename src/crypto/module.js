/**
 * Advanced Cryptographic Module for MTProto
 * Implements AES-256-IGE, RSA, DH key exchange, and more
 */

export class CryptoModule {
  constructor() {
    this.algorithmCache = new Map();
  }

  /**
   * Generate RSA key pair for MTProto authentication
   */
  async generateRSAKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    return keyPair;
  }

  /**
   * Diffie-Hellman key exchange implementation
   */
  async generateDHKeyPair() {
    // Use a safe prime for DH (2048-bit)
    const p = this.getSafePrime2048();
    const g = 2n;

    // Generate private key (random number)
    const privateKey = this.generateRandomBigInt(256);

    // Calculate public key: g^a mod p
    const publicKey = this.modPow(g, privateKey, p);

    return {
      privateKey,
      publicKey,
      prime: p,
      generator: g
    };
  }

  /**
   * Calculate shared secret from DH exchange
   */
  calculateDHSharedSecret(theirPublicKey, ourPrivateKey, prime) {
    return this.modPow(theirPublicKey, ourPrivateKey, prime);
  }

  /**
   * AES-256-IGE encryption (MTProto standard)
   */
  async encryptAES_IGE(data, key, iv) {
    // IGE mode requires two IVs
    const iv1 = iv.slice(0, 16);
    const iv2 = iv.slice(16, 32);

    const encrypted = new Uint8Array(data.length);
    let prevCipherBlock = iv1;
    let prevPlainBlock = iv2;

    // Process in 16-byte blocks
    for (let i = 0; i < data.length; i += 16) {
      const plainBlock = data.slice(i, i + 16);

      // XOR with previous cipher block
      const xorBlock = this.xorBytes(plainBlock, prevCipherBlock);

      // Encrypt with AES
      const cipherBlock = await this.encryptAESBlock(xorBlock, key);

      // XOR with previous plain block
      const resultBlock = this.xorBytes(cipherBlock, prevPlainBlock);

      encrypted.set(resultBlock, i);

      prevCipherBlock = resultBlock;
      prevPlainBlock = plainBlock;
    }

    return encrypted;
  }

  /**
   * AES-256-IGE decryption
   */
  async decryptAES_IGE(data, key, iv) {
    const iv1 = iv.slice(0, 16);
    const iv2 = iv.slice(16, 32);

    const decrypted = new Uint8Array(data.length);
    let prevCipherBlock = iv1;
    let prevPlainBlock = iv2;

    for (let i = 0; i < data.length; i += 16) {
      const cipherBlock = data.slice(i, i + 16);

      // XOR with previous plain block
      const xorBlock = this.xorBytes(cipherBlock, prevPlainBlock);

      // Decrypt with AES
      const plainBlock = await this.decryptAESBlock(xorBlock, key);

      // XOR with previous cipher block
      const resultBlock = this.xorBytes(plainBlock, prevCipherBlock);

      decrypted.set(resultBlock, i);

      prevCipherBlock = cipherBlock;
      prevPlainBlock = resultBlock;
    }

    return decrypted;
  }

  /**
   * Encrypt single AES block
   */
  async encryptAESBlock(block, key) {
    const algorithm = { name: 'AES-ECB' };
    const cryptoKey = await crypto.subtle.importKey('raw', key, algorithm, false, ['encrypt']);

    const encrypted = await crypto.subtle.encrypt(algorithm, cryptoKey, block);
    return new Uint8Array(encrypted);
  }

  /**
   * Decrypt single AES block
   */
  async decryptAESBlock(block, key) {
    const algorithm = { name: 'AES-ECB' };
    const cryptoKey = await crypto.subtle.importKey('raw', key, algorithm, false, ['decrypt']);

    const decrypted = await crypto.subtle.decrypt(algorithm, cryptoKey, block);
    return new Uint8Array(decrypted);
  }

  /**
   * RSA encryption with OAEP padding
   */
  async encryptRSA(data, publicKey) {
    const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data);
    return new Uint8Array(encrypted);
  }

  /**
   * RSA decryption with OAEP padding
   */
  async decryptRSA(data, privateKey) {
    const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, data);
    return new Uint8Array(decrypted);
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
   * Generate random big integer
   */
  generateRandomBigInt(bits) {
    const bytes = Math.ceil(bits / 8);
    const randomBytes = this.generateRandomBytes(bytes);

    let result = 0n;
    for (let i = 0; i < randomBytes.length; i++) {
      result = (result << 8n) | BigInt(randomBytes[i]);
    }

    return result;
  }

  /**
   * Modular exponentiation: base^exp mod mod
   */
  modPow(base, exp, mod) {
    if (mod === 1n) return 0n;

    let result = 1n;
    base = base % mod;

    while (exp > 0n) {
      if (exp % 2n === 1n) {
        result = (result * base) % mod;
      }
      exp = exp >> 1n;
      base = (base * base) % mod;
    }

    return result;
  }

  /**
   * XOR two byte arrays
   */
  xorBytes(a, b) {
    const result = new Uint8Array(Math.max(a.length, b.length));
    for (let i = 0; i < result.length; i++) {
      result[i] = (a[i] || 0) ^ (b[i] || 0);
    }
    return result;
  }

  /**
   * SHA-256 hash
   */
  async sha256(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * SHA-1 hash (for MTProto compatibility)
   */
  async sha1(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * HMAC-SHA256
   */
  async hmacSHA256(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(signature);
  }

  /**
   * PBKDF2 key derivation
   */
  async deriveKey(password, salt, iterations = 100000, keyLength = 32) {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      keyLength * 8
    );

    return new Uint8Array(derivedBits);
  }

  /**
   * Get 2048-bit safe prime for DH
   */
  getSafePrime2048() {
    // This is a well-known 2048-bit safe prime used in cryptography
    return BigInt(
      '0x' +
        'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
        '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
        'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
        'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
        'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
        'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
        '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
        '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
        'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' +
        'DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
        '15728E5A8AACAA68FFFFFFFFFFFFFFFF'
    );
  }

  /**
   * Encrypt MTProto message
   */
  async encryptMessage(message, authKey, _serverSalt) {
    // Generate message key
    const msgKeyLarge = await this.sha256(this.concatBytes(authKey.slice(88, 120), message));
    const msgKey = msgKeyLarge.slice(8, 24);

    // Derive AES key and IV
    const { aesKey, aesIV } = await this.deriveKeysFromAuthKey(authKey, msgKey, true);

    // Encrypt with AES-IGE
    const encrypted = await this.encryptAES_IGE(message, aesKey, aesIV);

    return {
      msgKey,
      encrypted
    };
  }

  /**
   * Decrypt MTProto message
   */
  async decryptMessage(encryptedData, authKey, msgKey) {
    // Derive AES key and IV
    const { aesKey, aesIV } = await this.deriveKeysFromAuthKey(authKey, msgKey, false);

    // Decrypt with AES-IGE
    const decrypted = await this.decryptAES_IGE(encryptedData, aesKey, aesIV);

    return decrypted;
  }

  /**
   * Derive encryption keys from auth key and message key
   */
  async deriveKeysFromAuthKey(authKey, msgKey, isOutgoing) {
    const x = isOutgoing ? 0 : 8;

    const sha256a = await this.sha256(this.concatBytes(msgKey, authKey.slice(x, x + 36)));
    const sha256b = await this.sha256(this.concatBytes(authKey.slice(x + 40, x + 76), msgKey));

    const aesKey = this.concatBytes(
      sha256a.slice(0, 8),
      sha256b.slice(8, 24),
      sha256a.slice(24, 32)
    );

    const aesIV = this.concatBytes(
      sha256b.slice(0, 8),
      sha256a.slice(8, 24),
      sha256b.slice(24, 32)
    );

    return { aesKey, aesIV };
  }

  /**
   * Concatenate byte arrays
   */
  concatBytes(...arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  }
}
