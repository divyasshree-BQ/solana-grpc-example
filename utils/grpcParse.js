/**
 * gRPC stream logging: uses parse.js for message formatting, buffered output.
 */

const parse = require('./parse');

let logBuffer = [];
let logFlushInterval = null;
const LOG_FLUSH_INTERVAL_MS = 100;
const MAX_LOG_BUFFER_SIZE = 1000;
let dexTradeTableHeaderPrinted = false;

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

function stopIntervals() {
  if (logFlushInterval) {
    clearInterval(logFlushInterval);
    logFlushInterval = null;
  }
}

function logMessage(message, toBase58, config) {
  const receivedTimestamp = new Date().toISOString();
  const isDexTrades = config?.stream?.type === 'dex_trades';
  const hasTrade = message.Trade != null;
  if (isDexTrades && hasTrade) {
    const tokenFilter = config?.filters?.token_address;
    if (!parse.dexTradeMatchesTokenFilter(message, toBase58, tokenFilter)) return;
    const row = parse.formatDexTradeTableRow(message, receivedTimestamp, toBase58);
    if (row) {
      if (!dexTradeTableHeaderPrinted) {
        bufferedLog(parse.getDexTradeTableHeader());
        bufferedLog(parse.getDexTradeTableSeparator());
        dexTradeTableHeaderPrinted = true;
      }
      bufferedLog(parse.formatDexTradeTableRowLine(row));
    }
    return;
  }
  const lines = parse.formatStreamMessage(message, receivedTimestamp, toBase58);
  bufferedLog(lines.join('\n'));
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
  stopIntervals();
  console.log('\nShutting down gracefully...');
}

function logStartupError(error) {
  console.error('Failed to start stream:', error);
}

module.exports = {
  logMessage,
  flushLogs,
  logStartup,
  logStreamError,
  logStreamEnd,
  logStatus,
  logShutdown,
  logStartupError,
};
