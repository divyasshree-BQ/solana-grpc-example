const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const yaml = require('js-yaml');
const bs58 = require('bs58');
const grpcParse = require('./utils/grpcParse');

// Performance optimization: Cache for base58 conversions
const base58Cache = new Map();
const MAX_CACHE_SIZE = 10000;

// Load configuration
const config = yaml.load(fs.readFileSync('./config.yaml', 'utf8'));

// Optimized helper function to convert bytes to base58 with caching
function toBase58(bytes) {
  if (!bytes || bytes.length === 0) return 'undefined';
  
  // Create cache key from bytes
  const cacheKey = Buffer.from(bytes).toString('hex');
  
  // Check cache first
  if (base58Cache.has(cacheKey)) {
    return base58Cache.get(cacheKey);
  }
  
  try {
    const result = bs58.encode(bytes);
    
    // Cache the result (with size limit)
    if (base58Cache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entries (simple LRU approximation)
      const firstKey = base58Cache.keys().next().value;
      base58Cache.delete(firstKey);
    }
    base58Cache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    return 'invalid_address';
  }
}

// Load proto files with optimized options
const packageDefinition = protoLoader.loadSync([
  './solana/corecast/corecast.proto',
  './solana/corecast/request.proto',
  './solana/corecast/stream_message.proto',
  './solana/dex_block_message.proto',
  './solana/block_message.proto',
  './solana/token_block_message.proto',
  './solana/parsed_idl_block_message.proto'
], {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: ['.'],
  // Performance optimizations
  bytes: Buffer,
  arrays: true,
  objects: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const solanaCorecast = protoDescriptor.solana_corecast;

// Create gRPC client with optimized options
const client = new solanaCorecast.CoreCast(
  config.server.address,
  config.server.insecure ? grpc.credentials.createInsecure() : grpc.credentials.createSsl(),
  {
    // Performance optimizations
    'grpc.keepalive_time_ms': 30000,
    'grpc.keepalive_timeout_ms': 5000,
    'grpc.keepalive_permit_without_calls': true,
    'grpc.http2.max_pings_without_data': 0,
    'grpc.http2.min_time_between_pings_ms': 10000,
    'grpc.http2.min_ping_interval_without_data_ms': 300000,
    // Buffer optimizations
    'grpc.max_receive_message_length': 4 * 1024 * 1024, // 4MB
    'grpc.max_send_message_length': 4 * 1024 * 1024,    // 4MB
    // Connection optimizations
    'grpc.enable_retries': 1,
    'grpc.max_connection_idle_ms': 30000,
    'grpc.max_connection_age_ms': 300000,
    'grpc.max_connection_age_grace_ms': 5000
  }
);

// Create metadata with authorization
const metadata = new grpc.Metadata();
metadata.add('authorization', config.server.authorization);

// Create request based on configuration
function createRequest() {
  const request = {};
  
  if (config.filters.programs && config.filters.programs.length > 0) {
    request.program = {
      addresses: config.filters.programs
    };
  }
  
  if (config.filters.pool && config.filters.pool.length > 0) {
    request.pool = {
      addresses: config.filters.pool
    };
  }
  
  if (config.filters.traders && config.filters.traders.length > 0) {
    request.trader = {
      addresses: config.filters.traders
    };
  }
  
  if (config.filters.signers && config.filters.signers.length > 0) {
    request.signer = {
      addresses: config.filters.signers
    };
  }
  
  return request;
}

// Stream listener function
function listenToStream() {
  grpcParse.logStartup(config);

  const request = createRequest();

  const stream = client.DexTrades(request, metadata);

  stream.on('data', (message) => {
    grpcParse.logMessage(message, toBase58, config);
  });

  stream.on('error', (error) => {
    grpcParse.logStreamError(error, request);
  });
  
  stream.on('end', () => {
    grpcParse.logStreamEnd();
  });
  
  stream.on('status', (status) => {
    grpcParse.logStatus(status);
  });
}

// Handle process termination
process.on('SIGINT', () => {
  grpcParse.logShutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  grpcParse.logShutdown();
  process.exit(0);
});

// Start listening
try {
  listenToStream();
} catch (error) {
  grpcParse.logStartupError(error);
  process.exit(1);
}
