# Deployment Guide for MTProto Wizard

## 🚀 Quick Deployment

### Prerequisites
1. **Cloudflare Account** with Workers enabled
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **KV Namespaces** created in Cloudflare dashboard

### Step 1: Setup KV Namespaces
```bash
# Create KV namespaces
wrangler kv:namespace create "CACHE"
wrangler kv:namespace create "SESSIONS"

# For preview (development)
wrangler kv:namespace create "CACHE" --preview
wrangler kv:namespace create "SESSIONS" --preview
```

### Step 2: Configure wrangler.toml
Update the KV namespace IDs in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your_cache_namespace_id"
preview_id = "your_cache_preview_id"

[[kv_namespaces]]
binding = "SESSIONS"
id = "your_sessions_namespace_id"
preview_id = "your_sessions_preview_id"
```

### Step 3: Deploy
```bash
# Development deployment
npm run dev

# Production deployment
npm run deploy
```

## 🧪 Testing Deployment

### Health Check
```bash
curl https://your-worker.your-subdomain.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "uptime": 12345,
  "version": "1.0.0",
  "environment": "production"
}
```

### Service Information
```bash
curl https://your-worker.your-subdomain.workers.dev/
```

### Metrics
```bash
curl https://your-worker.your-subdomain.workers.dev/metrics
```

## 📱 Client Usage Examples

### HTTP MTProto Proxy
```javascript
// Example client code for HTTP proxy
const mtprotoData = new Uint8Array([/* MTProto binary data */]);

const response = await fetch('https://your-worker.workers.dev/proxy', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream'
  },
  body: mtprotoData
});

const responseData = await response.arrayBuffer();
```

### WebSocket Connection
```javascript
// Example WebSocket client
const ws = new WebSocket('wss://your-worker.workers.dev/');

ws.onopen = () => {
  console.log('Connected to MTProto proxy');
  // Send MTProto binary data
  ws.send(mtprotoMessage);
};

ws.onmessage = (event) => {
  const responseData = new Uint8Array(event.data);
  // Process MTProto response
};
```

### Telegram Client Integration
```javascript
// Example integration with Telegram client libraries
const proxyConfig = {
  server: 'your-worker.workers.dev',
  port: 443,
  secret: '', // Optional obfuscation secret
  protocol: 'https'
};

// Configure your Telegram client to use the proxy
```

## 🔧 Configuration Options

### Environment Variables
```toml
[vars]
# MTProto Configuration
MTPROTO_VERSION = "2.0"
MAX_CONNECTIONS = "1000"
CACHE_TTL = "3600"

# Rate Limiting
RATE_LIMIT_REQUESTS = "100"
RATE_LIMIT_WINDOW = "60"

# Feature Toggles
ENABLE_LOGGING = "true"
ENABLE_METRICS = "true"
ENABLE_ANTI_CENSORSHIP = "true"

# Security
SECURITY_LEVEL = "high"
ALLOWED_COUNTRIES = "US,EU,CA"
```

### Custom Domains
```toml
[env.production]
routes = [
  { pattern = "mtproto.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## 📊 Monitoring Setup

### Cloudflare Analytics
The worker automatically reports metrics to Cloudflare Analytics.

### External Monitoring
Export metrics in Prometheus format:
```bash
curl https://your-worker.workers.dev/metrics
```

### Custom Alerts
Set up alerts based on metrics:
- High error rates
- Rate limit exceeded
- Security events
- Connection failures

## 🛡️ Security Considerations

### Production Checklist
- [ ] Enable HTTPS only
- [ ] Configure rate limiting
- [ ] Set up IP allowlists if needed
- [ ] Enable security headers
- [ ] Monitor for attacks
- [ ] Regular security updates

### Recommended Settings
```toml
[vars]
SECURITY_LEVEL = "high"
RATE_LIMIT_REQUESTS = "50"  # Conservative for production
ENABLE_IP_FILTERING = "true"
BLOCK_TOR_EXITS = "true"    # Optional
```

## 🌍 Geographic Deployment

### Multi-Region Setup
```toml
[env.us]
name = "mtproto-wizard-us"
vars = { PREFERRED_DC = "2" }

[env.eu]
name = "mtproto-wizard-eu"
vars = { PREFERRED_DC = "1" }

[env.asia]
name = "mtproto-wizard-asia"
vars = { PREFERRED_DC = "4" }
```

## 🔄 Updates and Maintenance

### Updating the Worker
```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm update

# Deploy update
npm run deploy
```

### Rollback Strategy
```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback [deployment-id]
```

## 📈 Performance Optimization

### Recommended Optimizations
1. **Enable KV caching** for session data
2. **Use Durable Objects** for connection state
3. **Implement connection pooling**
4. **Configure appropriate TTLs**
5. **Monitor cold start times**

### Performance Metrics
- Cold start: < 50ms
- Request latency: < 10ms
- Throughput: 10,000+ req/sec
- Memory usage: < 128MB

## 🆘 Troubleshooting

### Common Issues

#### "Module not found" errors
```bash
# Ensure all dependencies are installed
npm install
```

#### KV namespace errors
```bash
# Check KV namespace configuration
wrangler kv:namespace list
```

#### Rate limiting issues
```bash
# Check rate limit configuration
curl -v https://your-worker.workers.dev/metrics | grep ratelimit
```

#### Connection timeouts
- Verify Telegram DC endpoints
- Check network connectivity
- Monitor error logs

### Debug Mode
```bash
# Enable debug logging
wrangler dev --debug
```

### Log Analysis
```bash
# View worker logs
wrangler tail
```

## 📞 Support Resources

- **Documentation**: See README.md
- **Issues**: GitHub Issues
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **MTProto Specification**: https://core.telegram.org/mtproto

---

🎉 **Congratulations!** Your MTProto Wizard is now deployed and ready to handle Telegram traffic with advanced features like anti-censorship, security, and monitoring.