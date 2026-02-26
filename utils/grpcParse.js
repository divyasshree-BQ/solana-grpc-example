/**
 * gRPC stream logging: uses parse.js for message formatting.
 */

const parse = require('./parse');

function logMessage(message, toBase58, config) {
  const receivedTimestamp = new Date().toISOString();
  const isDexTrades = config?.stream?.type === 'dex_trades';
  const hasTrade = message.Trade != null;
  if (isDexTrades && hasTrade) {
    const filterTokens = config?.filters?.tokens || [];
    const row = parse.formatDexTradeTableRow(message, receivedTimestamp, toBase58, filterTokens);
    if (row) console.log(parse.formatDexTradeTableRowLine(row));
    return;
  }
  const lines = parse.formatStreamMessage(message, receivedTimestamp, toBase58);
  console.log(lines.join('\n'));
}

function logStartup(config) {
  console.log('Connecting to CoreCast stream...');
  console.log('Server:', config.server.address);
  console.log('Stream type:', config.stream.type);
  console.log('Filters:', JSON.stringify(config.filters, null, 2));
}

function logStreamError(error, request) {
  console.error('Stream error:', error);
  console.error('Error details:', error.details);
  console.error('Error code:', error.code);
  console.error('Request sent:', JSON.stringify(request, null, 2));
}

function logStreamEnd() {
  console.log('Stream ended');
}

function logStatus(status) {
  console.log(`Stream status: ${JSON.stringify(status)}`);
}

function logShutdown() {
  console.log('\nShutting down gracefully...');
}

function logStartupError(error) {
  console.error('Failed to start stream:', error);
}

module.exports = {
  logMessage,
  logStartup,
  logStreamError,
  logStreamEnd,
  logStatus,
  logShutdown,
  logStartupError,
};
