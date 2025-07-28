/**
 * Basic functionality test for MTProto Wizard
 */

// Simple test to validate basic module loading and functionality
async function testBasicFunctionality() {
  console.log('Testing MTProto Wizard basic functionality...');
  
  try {
    // Test crypto module
    console.log('✓ Testing crypto module...');
    const { CryptoModule } = await import('./src/crypto/module.js');
    const crypto = new CryptoModule();
    const randomBytes = crypto.generateRandomBytes(32);
    console.log(`✓ Generated ${randomBytes.length} random bytes`);
    
    // Test MTProto codec
    console.log('✓ Testing MTProto codec...');
    const { MTProtoCodec } = await import('./src/mtproto/codec.js');
    const codec = new MTProtoCodec();
    const messageId = codec.generateMessageId();
    console.log(`✓ Generated message ID: ${messageId}`);
    
    // Test utilities
    console.log('✓ Testing utilities...');
    const { Logger } = await import('./src/utils/logger.js');
    const logger = new Logger(true);
    logger.info('Test log message', { test: true });
    console.log('✓ Logger working');
    
    const { MetricsCollector } = await import('./src/utils/metrics.js');
    const metrics = new MetricsCollector(true);
    metrics.increment('test.counter', 1);
    console.log('✓ Metrics collector working');
    
    console.log('\n🎉 All basic functionality tests passed!');
    console.log('\nMTProto Wizard is ready for deployment to Cloudflare Workers!');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testBasicFunctionality().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { testBasicFunctionality };