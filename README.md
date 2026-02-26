# Solana gRPC Example — Bitquery CoreCast

A Node.js gRPC client for streaming real-time Solana blockchain data via [Bitquery CoreCast](https://docs.bitquery.io/docs/streams/core-concepts/).

---

## Overview

This example demonstrates how to connect to Bitquery's **CoreCast** gRPC endpoint and subscribe to live Solana data streams including DEX trades, orders, pools, transactions, transfers, and balances. It uses Protocol Buffers (protobuf) for efficient binary serialization and `@grpc/grpc-js` for the gRPC transport layer.

> **Note for new users:** When people hear "gRPC" they sometimes assume you need a separate custom integration for each exchange. That is **not** the case here. CoreCast is a single, unified gRPC stream that normalizes data from **all** Solana DEXes into one consistent schema — you connect once and get trades, orders, and pools from every exchange automatically.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v16+
- A Bitquery API token — get one at [bitquery.io](https://bitquery.io)
- (Optional) `protoc` compiler if you need to regenerate proto bindings — see [Protocol Buffers](https://grpc.io/docs/protoc-installation/)

---

## Installation

```bash
git clone https://github.com/bitquery/solana-grpc-example.git
cd solana-grpc-example
npm install
```

---

## Configuration

Edit `config.yaml` before running:

```yaml
server:
  address: "corecast.bitquery.io"
  authorization: "ory_at_YOUR_TOKEN_HERE" # Bitquery OAuth token
  insecure: false # Set true for local/dev without TLS

stream:
  type:
    "dex_trades" # One of: dex_trades, dex_orders, dex_pools,
    #         transactions, transfers, balances

filters:
  tokens:
    - "BhFhSiozXfoRCxq2DsCH55QaJ4kyY4ia3epfSPFEpump"
  # programs:
  #   - "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  # pool:
  #   - "<pool_address>"
  # traders:
  #   - "<trader_address>"
  # signers:
  #   - "<signer_address>"
```

### Obtaining Your Authorization Token

1. Log in at [bitquery.io](https://bitquery.io)
2. Go to **My Account → API Keys**
3. Copy your OAuth token and paste it as the `authorization` value in `config.yaml`

---

## Running

```bash
npm start
# or
node index.js
```

The client will connect to CoreCast and print incoming stream messages to stdout. Press `Ctrl+C` to stop gracefully.

---

## Stream Types

| Stream Type    | gRPC Method    | Description                               |
| -------------- | -------------- | ----------------------------------------- |
| `dex_trades`   | `DexTrades`    | Real-time DEX swap/trade events           |
| `dex_orders`   | `DexOrders`    | Limit order placements and cancellations  |
| `dex_pools`    | `DexPools`     | Liquidity pool creation and update events |
| `transactions` | `Transactions` | Raw Solana transactions                   |
| `transfers`    | `Transfers`    | SPL token and SOL transfers               |
| `balances`     | `Balances`     | Token account balance changes             |

---

## Project Structure

```
solana-grpc-example/
├── index.js              # Entry point — gRPC client setup and stream handling
├── config.yaml           # Server connection and filter configuration
├── package.json
├── utils/
│   ├── grpcParse.js      # Stream logging helpers
│   └── parse.js          # Message formatting and table rendering
└── solana/
    ├── corecast/
    │   ├── corecast.proto         # CoreCast service definition
    │   ├── request.proto          # Subscription request types
    │   └── stream_message.proto   # Stream message envelope
    ├── block_message.proto
    ├── dex_block_message.proto
    ├── token_block_message.proto
    └── parsed_idl_block_message.proto
```

---

## Regenerating Protobuf Bindings

If you modify the `.proto` files, regenerate the JS bindings with:

```bash
npm run generate
```

This requires `protoc` and `protoc-gen-grpc-web` to be installed. See [gRPC Tools](https://grpc.io/docs/languages/node/quickstart/).

## License

MIT
