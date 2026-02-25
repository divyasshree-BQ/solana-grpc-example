/**
 * gRPC stream logging: uses parse.js for message formatting, handles buffered output and stats.
 */

const parse = require('./parse');

let logBuffer = [];
let logFlushInterval = null;
const LOG_FLUSH_INTERVAL_MS = 100;
const MAX_LOG_BUFFER_SIZE = 1000;
const STATS_INTERVAL_MS = 30000;
let statsInterval = null;

function bufferedLog(message) {
  logBuffer.push(message);
  if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) flushLogs();
  if (!logFlushInterval) {
    logFlushInterval = setInterval(() => {
      if (logBuffer.length > 0) {
        console.log(logBuffer.join('\n'));
        logBuffer = [];
      }
    }, LOG_FLUSH_INTERVAL_MS);
  }
}

function flushLogs() {
  if (logBuffer.length > 0) {
    console.log(logBuffer.join('\n'));
    logBuffer = [];
  }
}

function stopStatsInterval() {
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
  if (logFlushInterval) { clearInterval(logFlushInterval); logFlushInterval = null; }
}

function updateStats(stats, message) {
  if (!stats) return;
  stats.messageCount = (stats.messageCount || 0) + 1;
  stats.totalMessageSize = (stats.totalMessageSize || 0) + Buffer.byteLength(JSON.stringify(message), 'utf8');
  if (message.Trade) stats.tradeCount = (stats.tradeCount || 0) + 1;
  if (message.Order) stats.orderCount = (stats.orderCount || 0) + 1;
  if (message.PoolEvent) stats.poolEventCount = (stats.poolEventCount || 0) + 1;
  if (message.Transfer) stats.transferCount = (stats.transferCount || 0) + 1;
  if (message.BalanceUpdate) stats.balanceUpdateCount = (stats.balanceUpdateCount || 0) + 1;
  if (message.Transaction) stats.transactionCount = (stats.transactionCount || 0) + 1;
}

function logMessage(message, toBase58, stats) {
  const receivedTimestamp = new Date().toISOString();
  updateStats(stats || {}, message);
  const lines = parse.formatStreamMessage(message, receivedTimestamp, toBase58);
  bufferedLog(lines.join('\n'));
}

function startStatsInterval(stats, getCacheSize) {
  let lastStatsTime = Date.now();
  statsInterval = setInterval(() => {
    const now = Date.now();
    const messagesPerSecond = stats.messageCount > 0 ? (stats.messageCount * 1000) / (now - lastStatsTime) : 0;
    const avgMessageSize = stats.messageCount > 0 ? (stats.totalMessageSize / stats.messageCount).toFixed(2) : 0;
    const dataRateMBps = stats.messageCount > 0 ? (stats.totalMessageSize / (1024 * 1024)) / ((now - lastStatsTime) / 1000) : 0;
    bufferedLog([
      '\n=== Performance Stats ===',
      `Messages processed: ${stats.messageCount}`,
      `Rate: ${messagesPerSecond.toFixed(2)} msg/sec`,
      `Total data: ${(stats.totalMessageSize / 1024).toFixed(2)} KB`,
      `Data rate: ${dataRateMBps.toFixed(2)} MB/sec`,
      `Avg message size: ${avgMessageSize} bytes`,
      '', 'Message Types:',
      `  Transactions: ${stats.transactionCount || 0}`,
      `  Trades: ${stats.tradeCount || 0}`,
      `  Orders: ${stats.orderCount || 0}`,
      `  Pool Events: ${stats.poolEventCount || 0}`,
      `  Transfers: ${stats.transferCount || 0}`,
      `  Balance Updates: ${stats.balanceUpdateCount || 0}`,
      '', 'System:',
      `  Cache size: ${typeof getCacheSize === 'function' ? getCacheSize() : 0}`,
      `  Log buffer size: ${logBuffer.length}`,
      `  Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      `  Stream status: ${stats.messageCount === 0 ? 'No messages received' : 'Active'}`
    ].join('\n'));
    stats.messageCount = 0;
    stats.totalMessageSize = 0;
    stats.transactionCount = 0;
    stats.tradeCount = 0;
    stats.transferCount = 0;
    stats.orderCount = 0;
    stats.poolEventCount = 0;
    stats.balanceUpdateCount = 0;
    lastStatsTime = now;
  }, STATS_INTERVAL_MS);
}

function logStartup(config) {
  console.log('Connecting to CoreCast stream...');
  console.log('Server:', config.server.address);
  console.log('Stream type:', config.stream.type);
  console.log('Filters:', JSON.stringify(config.filters, null, 2));
}

function logStreamError(error, request) {
  flushLogs();
  console.error('Stream error:', error);
  console.error('Error details:', error.details);
  console.error('Error code:', error.code);
  console.error('Request sent:', JSON.stringify(request, null, 2));
}

function logStreamEnd() {
  flushLogs();
  console.log('Stream ended');
}

function logStatus(status) {
  bufferedLog(`Stream status: ${JSON.stringify(status)}`);
}

function logShutdown() {
  flushLogs();
  stopStatsInterval();
  console.log('\nShutting down gracefully...');
}

function logStartupError(error) {
  console.error('Failed to start stream:', error);
}

module.exports = {
  logMessage,
  flushLogs,
  startStatsInterval,
  stopStatsInterval,
  logStartup,
  logStreamError,
  logStreamEnd,
  logStatus,
  logShutdown,
  logStartupError,
};
