# Examples and Use Cases

## 🌟 Real-World Usage Examples

### Example 1: Basic Telegram Proxy

```javascript
// Simple proxy setup for Telegram Desktop
const proxyUrl = 'https://your-mtproto-wizard.workers.dev';

// Configure in Telegram Desktop:
// Settings > Advanced > Connection type > Use custom proxy
// Server: your-mtproto-wizard.workers.dev
// Port: 443
// Protocol: HTTPS
```

### Example 2: Mobile App Integration

```javascript
// React Native / Mobile app integration
import { TelegramClient } from 'telegram-js';

const client = new TelegramClient({
  proxy: {
    server: 'your-mtproto-wizard.workers.dev',
    port: 443,
    protocol: 'https',
    // Optional: Add obfuscation parameters
    secret: 'optional-secret-key'
  }
});

await client.connect();
```

### Example 3: Bot Integration

```python
# Python bot with MTProto Wizard proxy
from telethon import TelegramClient
import asyncio

# Configure proxy
proxy_settings = {
    'proxy_type': 'http',
    'addr': 'your-mtproto-wizard.workers.dev',
    'port': 443,
    'username': None,
    'password': None,
    'rdns': True
}

client = TelegramClient(
    'session_name',
    api_id,
    api_hash,
    proxy=proxy_settings
)

async def main():
    await client.start()
    # Your bot logic here
    await client.send_message('me', 'Hello from MTProto Wizard!')

asyncio.run(main())
```

### Example 4: Advanced Configuration

```javascript
// Advanced configuration with anti-censorship
const advancedConfig = {
  endpoint: 'https://your-mtproto-wizard.workers.dev',
  features: {
    antiCensorship: true,
    domainFronting: true,
    trafficObfuscation: true
  },
  fallbacks: [
    'https://backup1.workers.dev',
    'https://backup2.workers.dev'
  ]
};
```

## 🔧 Configuration Examples

### Development Environment
```toml
# wrangler.toml for development
name = "mtproto-wizard-dev"
main = "src/index.js"
compatibility_date = "2023-12-01"

[env.development]
vars = { 
  MTPROTO_VERSION = "2.0"
  MAX_CONNECTIONS = "100"
  ENABLE_LOGGING = "true"
  ENABLE_METRICS = "true"
  SECURITY_LEVEL = "medium"
}
```

### Production Environment
```toml
# Production configuration
[env.production]
name = "mtproto-wizard-prod"
vars = {
  MTPROTO_VERSION = "2.0"
  MAX_CONNECTIONS = "5000"
  RATE_LIMIT_REQUESTS = "200"
  SECURITY_LEVEL = "high"
  ENABLE_IP_FILTERING = "true"
  ENABLE_ANTI_CENSORSHIP = "true"
}
```

## 🌍 Anti-Censorship Examples

### Geographic Bypass
```javascript
// Automatic censorship detection and bypass
class CensorshipBypass {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.fallbackMethods = [
      'domainFronting',
      'trafficObfuscation',
      'randomization'
    ];
  }
  
  async connect() {
    for (const method of this.fallbackMethods) {
      try {
        const connection = await this.tryConnection(method);
        if (connection.success) {
          return connection;
        }
      } catch (error) {
        console.log(`Method ${method} failed, trying next...`);
      }
    }
    throw new Error('All bypass methods failed');
  }
  
  async tryConnection(method) {
    const headers = {
      'X-Bypass-Method': method,
      'X-Client-Country': await this.detectCountry()
    };
    
    const response = await fetch(this.workerUrl, { headers });
    return { success: response.ok, method };
  }
}
```

### Domain Fronting Example
```javascript
// Using CDN domain fronting
const frontedRequest = {
  url: 'https://cloudflare.com/api/endpoint',  // Front domain
  headers: {
    'Host': 'your-mtproto-wizard.workers.dev',  // Real target
    'X-Forwarded-Host': 'your-mtproto-wizard.workers.dev'
  }
};
```

## 📊 Monitoring Examples

### Custom Dashboard
```javascript
// Create monitoring dashboard
class MTProtoMonitor {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.metrics = {};
  }
  
  async fetchMetrics() {
    const response = await fetch(`${this.workerUrl}/metrics`);
    this.metrics = await response.json();
    return this.metrics;
  }
  
  generateAlerts() {
    const alerts = [];
    
    if (this.metrics['requests.errors'] > 100) {
      alerts.push({
        level: 'critical',
        message: 'High error rate detected'
      });
    }
    
    if (this.metrics['ratelimit.exceeded'] > 50) {
      alerts.push({
        level: 'warning',
        message: 'Rate limiting frequently triggered'
      });
    }
    
    return alerts;
  }
}
```

### Health Check Integration
```bash
#!/bin/bash
# Health check script for monitoring systems

WORKER_URL="https://your-mtproto-wizard.workers.dev"
HEALTH_ENDPOINT="$WORKER_URL/health"

# Check health status
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT")

if [ "$RESPONSE" -eq 200 ]; then
    echo "✅ MTProto Wizard is healthy"
    exit 0
else
    echo "❌ MTProto Wizard health check failed (HTTP $RESPONSE)"
    exit 1
fi
```

## 🔒 Security Examples

### IP Allowlist Configuration
```javascript
// Configure IP allowlist for sensitive deployments
const securityConfig = {
  ipAllowlist: [
    '192.168.1.0/24',    // Office network
    '10.0.0.0/8',        // Internal network
    '203.0.113.0/24'     // Specific client range
  ],
  blockTorExits: true,
  enableGeoBlocking: true,
  blockedCountries: ['CN', 'IR', 'RU']  // Example
};
```

### Rate Limiting Tiers
```javascript
// Different rate limits for user tiers
const rateLimitTiers = {
  free: {
    requests: 10,
    window: 60,
    burstLimit: 2
  },
  premium: {
    requests: 100,
    window: 60,
    burstLimit: 10
  },
  enterprise: {
    requests: 1000,
    window: 60,
    burstLimit: 50
  }
};
```

## 🚀 Performance Examples

### Connection Pooling
```javascript
// Optimize for high-throughput scenarios
const poolConfig = {
  maxConnections: 1000,
  connectionTimeout: 30000,
  keepAliveTimeout: 60000,
  maxRequestsPerConnection: 500,
  healthCheckInterval: 10000
};
```

### Caching Strategy
```javascript
// Implement smart caching
const cacheConfig = {
  sessionCache: {
    ttl: 3600,      // 1 hour
    maxSize: 10000  // 10k sessions
  },
  responseCache: {
    ttl: 300,       // 5 minutes
    maxSize: 1000   // 1k responses
  },
  geoCache: {
    ttl: 86400,     // 24 hours
    maxSize: 100    // Country configs
  }
};
```

## 🔄 Integration Examples

### Load Balancer Integration
```javascript
// Multi-worker load balancing
const workers = [
  'https://mtproto-1.workers.dev',
  'https://mtproto-2.workers.dev',
  'https://mtproto-3.workers.dev'
];

class LoadBalancer {
  constructor(workers) {
    this.workers = workers;
    this.currentIndex = 0;
  }
  
  getNextWorker() {
    const worker = this.workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.workers.length;
    return worker;
  }
  
  async healthyWorkers() {
    const checks = await Promise.allSettled(
      this.workers.map(worker => 
        fetch(`${worker}/health`).then(r => ({ worker, healthy: r.ok }))
      )
    );
    
    return checks
      .filter(result => result.status === 'fulfilled' && result.value.healthy)
      .map(result => result.value.worker);
  }
}
```

### Telegram Bot Framework Integration
```javascript
// Integrate with popular bot frameworks
const { Telegraf } = require('telegraf');

const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    agent: {
      // Use MTProto Wizard as SOCKS proxy
      hostname: 'your-mtproto-wizard.workers.dev',
      port: 443,
      protocol: 'https:'
    }
  }
});

bot.start((ctx) => ctx.reply('Bot is using MTProto Wizard!'));
bot.launch();
```

## 📱 Client Libraries

### JavaScript/TypeScript
```typescript
// TypeScript client library example
interface MTProtoWizardConfig {
  endpoint: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
}

class MTProtoWizardClient {
  constructor(private config: MTProtoWizardConfig) {}
  
  async sendMessage(data: Uint8Array): Promise<Uint8Array> {
    const response = await fetch(`${this.config.endpoint}/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: data
    });
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
```

## 🔧 Debugging Examples

### Debug Mode Setup
```javascript
// Enable comprehensive debugging
const debugConfig = {
  logLevel: 'debug',
  enableTracing: true,
  logRequests: true,
  logResponses: true,
  performanceMetrics: true
};

// Debug client
class DebugClient {
  async sendRequest(data) {
    const startTime = performance.now();
    
    console.log('🔧 Sending request:', {
      size: data.length,
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await this.client.sendMessage(data);
      const endTime = performance.now();
      
      console.log('✅ Request successful:', {
        responseSize: response.length,
        duration: `${(endTime - startTime).toFixed(2)}ms`
      });
      
      return response;
    } catch (error) {
      console.error('❌ Request failed:', error);
      throw error;
    }
  }
}
```

---

These examples demonstrate the versatility and power of the MTProto Wizard implementation, showing how it can be integrated into various scenarios while maintaining security, performance, and anti-censorship capabilities. 🚀