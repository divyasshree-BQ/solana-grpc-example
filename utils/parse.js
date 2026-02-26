const bs58 = require('bs58');

const DEFAULT_DECIMALS = 9;

// -----------------------------------------------------------------------------
// Conversion funs
// -----------------------------------------------------------------------------

/**
 * Convert bytes to base58 or hex.
 * @param {Buffer|Uint8Array} buffer
 * @param {"base58"|"hex"} encoding
 * @returns {string}
 */
function convertBytes(buffer, encoding = 'base58') {
  if (buffer == null || buffer.length === 0) return '';
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (encoding === 'base58') return bs58.encode(buf);
  return buf.toString('hex');
}

/**
 * Create a bytes converter (e.g. with cache). Use as customConvertBytes in parseMessage.
 * @param {function} toBase58 - (bytes) => string
 * @returns {function}
 */
function makeConvertBytes(toBase58) {
  return (buffer) => {
    if (buffer == null || buffer.length === 0) return '';
    return toBase58(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  };
}

// -----------------------------------------------------------------------------
// Decimal fn
// -----------------------------------------------------------------------------

/** Field names that are numeric amounts and should use Currency decimals when present */
const AMOUNT_FIELD_NAMES = new Set([
  'Amount', 'Fee', 'Royalty', 'LimitPrice', 'LimitAmount',
  'PreBalance', 'PostBalance', 'ChangeAmount', 'PostAmount'
]);

/**
 * Raw amount → decimal string. Preserves precision for large integers.
 * @param {string|number|bigint} rawAmount
 * @param {number} decimals
 * @returns {string}
 */
function toDecimalAmount(rawAmount, decimals = DEFAULT_DECIMALS) {
  if (rawAmount === undefined || rawAmount === null) return '0';
  const d = Math.max(0, Number(decimals) || 0);
  const n = typeof rawAmount === 'string' ? BigInt(rawAmount) : BigInt(Number(rawAmount));
  if (n === 0n) return '0';
  const div = 10n ** BigInt(d);
  const intPart = n / div;
  const fracPart = n % div;
  if (fracPart === 0n) return intPart.toString();
  const fracStr = fracPart.toString().padStart(d, '0').replace(/0+$/, '');
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

/**
 * Get decimals from a Currency object.
 * @param {object} currency - object with optional Decimals
 * @returns {number}
 */
function getDecimals(currency) {
  if (!currency || currency.Decimals === undefined) return DEFAULT_DECIMALS;
  const d = Number(currency.Decimals);
  return Number.isFinite(d) && d >= 0 ? d : DEFAULT_DECIMALS;
}

/**
 * Resolve decimals for an amount-like field from its parent object (sibling Currency, etc.).
 * @param {object} parent - current object containing the field (e.g. Buy, Sell, Trade, PoolSide)
 * @param {string} key - field name (e.g. 'Amount', 'Fee')
 * @returns {number|undefined} decimals to use, or undefined to show raw
 */
function getDecimalsForField(parent, key) {
  if (!parent || !AMOUNT_FIELD_NAMES.has(key)) return undefined;
  // Same-level Currency (e.g. Buy.Currency, Sell.Currency)
  if (parent.Currency != null) return getDecimals(parent.Currency);
  // Trade-level Fee/Royalty → quote (Sell) decimals
  if (key === 'Fee' || key === 'Royalty') {
    if (parent.Sell?.Currency != null) return getDecimals(parent.Sell.Currency);
  }
  // Market-level: BaseCurrency/QuoteCurrency for PoolSide context (parent might be PoolSide; decimals from market passed by caller or default)
  if (parent.BaseCurrency != null && (key === 'ChangeAmount' || key === 'PostAmount')) return getDecimals(parent.BaseCurrency);
  if (parent.QuoteCurrency != null && (key === 'ChangeAmount' || key === 'PostAmount')) return getDecimals(parent.QuoteCurrency);
  return DEFAULT_DECIMALS;
}

/**
 * If value is numeric and key is amount-like and we have decimals in parent, return decimal string; else return undefined (caller shows raw).
 * @param {*} value - field value
 * @param {object} parent - parent object
 * @param {string} key - field name
 * @returns {string|undefined} decimal string or undefined
 */
function formatFieldWithDecimals(value, parent, key) {
  const decimals = getDecimalsForField(parent, key);
  if (decimals === undefined) return undefined;
  if (value === undefined || value === null) return '0';
  const n = typeof value === 'string' ? BigInt(value) : BigInt(Number(value));
  return toDecimalAmount(n, decimals);
}

// -----------------------------------------------------------------------------
// Main nested parser
// -----------------------------------------------------------------------------

/**
 * Recursively format a protobuf message into log lines.
 * - Bytes → convertBytes (base58/hex or custom)
 * - If field name is amount-like and parent has decimals context → use decimal fn for value
 * @param {object} msg - protobuf message (plain object)
 * @param {object} options
 * @param {number} [options.indent=0]
 * @param {"base58"|"hex"} [options.encoding='base58']
 * @param {function} [options.convertBytes] - (buffer) => string; overrides encoding for bytes
 * @param {boolean} [options.useDecimals=true] - apply decimals to amount-like fields when context has decimals
 * @param {object} [options.parent=null] - parent object (used for decimals context; set internally)
 * @returns {string[]} log lines
 */
function parseMessage(msg, options = {}) {
  const {
    indent = 0,
    encoding = 'base58',
    convertBytes: customConvertBytes,
    useDecimals = true,
    parent = null
  } = options;

  const prefix = ' '.repeat(indent);
  const lines = [];
  const convert = customConvertBytes || (b => convertBytes(b, encoding));

  if (msg === undefined || msg === null) {
    lines.push(prefix + String(msg));
    return lines;
  }

  if (Buffer.isBuffer(msg) || (typeof Uint8Array !== 'undefined' && msg instanceof Uint8Array)) {
    lines.push(prefix + convert(msg));
    return lines;
  }

  if (typeof msg !== 'object') {
    lines.push(prefix + String(msg));
    return lines;
  }

  for (const [key, value] of Object.entries(msg)) {
    if (value === undefined || value === null) {
      lines.push(prefix + key + ':');
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(prefix + key + ' (repeated):');
      value.forEach((item, idx) => {
        if (item != null && typeof item === 'object' && !Buffer.isBuffer(item) && (typeof Uint8Array === 'undefined' || !(item instanceof Uint8Array))) {
          lines.push(prefix + '  [' + idx + ']:');
          lines.push(...parseMessage(item, { ...options, indent: indent + 6, parent: null }));
        } else if (Buffer.isBuffer(item) || (typeof Uint8Array !== 'undefined' && item instanceof Uint8Array)) {
          lines.push(prefix + '  [' + idx + ']: ' + convert(item));
        } else {
          lines.push(prefix + '  [' + idx + ']: ' + item);
        }
      });
      continue;
    }

    if (Buffer.isBuffer(value) || (typeof Uint8Array !== 'undefined' && value instanceof Uint8Array)) {
      lines.push(prefix + key + ': ' + convert(value));
      continue;
    }

    if (typeof value === 'object') {
      lines.push(prefix + key + ':');
      const subLines = parseMessage(value, { ...options, indent: indent + 2, parent: value });
      lines.push(...subLines.map(l => (l.trimStart() === l ? ' '.repeat(indent + 2) + l : l)));
      continue;
    }

    // Primitive: if amount-like and useDecimals and we have decimals in parent, show decimal
    if (useDecimals && (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) {
      const decimalStr = formatFieldWithDecimals(value, parent || msg, key);
      if (decimalStr !== undefined) {
        lines.push(prefix + key + ': ' + decimalStr );
        continue;
      }
    }
    lines.push(prefix + key + ': ' + value);
  }

  return lines;
}

/**
 * Format a full stream message with header. Uses main nested parser.
 * @param {object} message - raw gRPC stream message
 * @param {string} receivedTimestamp - ISO timestamp
 * @param {function} [toBase58] - optional (bytes) => base58 (e.g. cached)
 * @param {object} [opts] - passed to parseMessage (encoding, useDecimals, etc.)
 * @returns {string[]} log lines
 */
function formatStreamMessage(message, receivedTimestamp, toBase58, opts = {}) {
  const convert = typeof toBase58 === 'function' ? makeConvertBytes(toBase58) : null;
  const lines = [
    '\n=== New Message ===',
    'Block Slot: ' + (message.Block?.Slot ?? ''),
    'Received Timestamp: ' + receivedTimestamp,
    '---'
  ];
  lines.push(...parseMessage(message, {
    encoding: 'base58',
    convertBytes: convert,
    useDecimals: true,
    parent: null,
    ...opts
  }));
  return lines;
}

/** Min column widths; full addresses shown. Separator between columns prevents mashing. */
const DEX_TRADE_COL_WIDTHS = { timestamp: 28, side: 6, buyer: 44, seller: 44, amount: 24, protocol: 20 };
const DEX_TRADE_COL_SEP = ' | ';

/**
 * Format a single DEX trade as a table row object (timestamp, side, buyer, seller, amount, protocol).
 * Determines BUY/SELL based on which side holds the filtered token.
 * @param {object} message - DexTradeStreamMessage with Trade (DexTradeEvent)
 * @param {string} receivedTimestamp - ISO timestamp
 * @param {function} toBase58 - (bytes) => base58 string
 * @param {string[]} [filterTokens] - token mint addresses from config filters
 * @returns {{ timestamp: string, side: string, buyer: string, seller: string, amount: string, protocol: string } | null}
 */
function formatDexTradeTableRow(message, receivedTimestamp, toBase58, filterTokens = []) {
  const trade = message?.Trade;
  if (!trade?.Buy?.Account?.Address || !trade?.Sell?.Account?.Address) return null;
  const makeAddr = (buf) => (buf && toBase58(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))) || '';
  const buyer = makeAddr(trade.Buy.Account.Address);
  const seller = makeAddr(trade.Sell.Account.Address);

  const buyMint  = makeAddr(trade.Buy?.Currency?.MintAddress);
  const sellMint = makeAddr(trade.Sell?.Currency?.MintAddress);

  // Determine side: if the filtered token appears on the Sell side, the user's token is being sold
  let side, decimals, rawAmount;
  const tokenSet = new Set(filterTokens);
  if (tokenSet.size > 0 && tokenSet.has(sellMint)) {
    side      = 'SELL';
    decimals  = getDecimals(trade.Sell?.Currency);
    rawAmount = trade.Sell?.Amount;
  } else {
    // Buy side match, or no filter — default to BUY
    side      = 'BUY';
    decimals  = getDecimals(trade.Buy?.Currency);
    rawAmount = trade.Buy?.Amount;
  }

  const amount   = rawAmount != null ? toDecimalAmount(rawAmount, decimals) : '0';
  const protocol = (trade.Dex && trade.Dex.ProtocolName != null) ? String(trade.Dex.ProtocolName) : '';
  return {
    timestamp: receivedTimestamp || '',
    side,
    buyer,
    seller,
    amount,
    protocol
  };
}


/**
 * Min-width column: pad to minWidth, never truncate (full addresses). Separator used between columns.
 */
function padCol(s, minWidth) {
  return String(s).padEnd(minWidth);
}

/**
 * Format a dex trade row as a single table line. Fixed-width columns for alignment.
 * @param {{ timestamp: string, side: string, buyer: string, seller: string, amount: string, protocol: string }} row
 * @param {object} [colWidths]
 * @returns {string}
 */
function formatDexTradeTableRowLine(row, colWidths = DEX_TRADE_COL_WIDTHS) {
  const w = colWidths;
  const sep = DEX_TRADE_COL_SEP;
  return padCol(row.timestamp, w.timestamp) + sep + padCol(row.side, w.side) + sep + padCol(row.buyer, w.buyer) + sep + padCol(row.seller, w.seller) + sep + padCol(row.amount, w.amount) + sep + padCol(row.protocol || '', w.protocol);
}

module.exports = {
  formatStreamMessage,
  formatDexTradeTableRow,
  formatDexTradeTableRowLine,
};
