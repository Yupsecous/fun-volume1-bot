# fun-volume-bot

A Telegram bot that generates trading **volume** for [pump.fun](https://pump.fun) tokens on Solana. It works by rapidly buying and selling a target token across many throwaway wallets, so the token's chart shows high trading activity.

> ⚠️ **Disclaimer.** This is a "volume bot" — it produces *artificial* trading volume (a form of wash trading) and **spends real SOL** to do so (Jito tips, swap fees, bonding-curve spread). It creates no real value and may be considered deceptive/market-manipulative. Use only on tokens you control, at your own risk, and in line with the laws of your jurisdiction.

---

## What it does

- Telegram UI: register a pump.fun token, configure a target, start/stop a run.
- Per user it generates a **deposit wallet**; you fund it with SOL.
- On start it creates an on-chain **Address Lookup Table**, spins up batches of temporary wallets, and **buys + sells** the token through pump.fun's bonding curve.
- Trades are submitted as **Jito bundles** for speed/atomicity.
- It tracks accumulated volume and **stops automatically** when your target is reached.
- Leftover SOL is gathered back to the deposit wallet; you can **withdraw** or **export the key** at any time.

## Tech stack

- Node.js + TypeScript (run via `ts-node`)
- `@solana/web3.js`, `@project-serum/anchor` (pump.fun program calls)
- `jito-ts` (bundle submission)
- `node-telegram-bot-api` (Telegram UI)
- MongoDB via `mongoose` (users, tokens, wallets)

## Prerequisites

- **Node.js** 18+ (tested on 22)
- **MongoDB** running locally on `mongodb://localhost:27017`
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather)
- A **Solana mainnet RPC** URL (pump.fun is mainnet-only)

## Setup

```bash
cd bot
npm install --legacy-peer-deps
cp .env.example .env   # then fill in the values below
```

> `--legacy-peer-deps` is required: this legacy Solana stack has inconsistent peer ranges. See [Dependency notes](#dependency-notes).

### Configure `bot/.env`

| Variable | Required | Notes |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `BOT_USERNAME` | ✅ | Your bot's @username (no `@`) |
| `MAINNET_RPC` | ✅ | Solana mainnet RPC (HTTP). Public RPC works but rate-limits |
| `MAINNET_RPC_WSS` | ✅ | Solana mainnet RPC (WSS) |
| `NET_MODE` | ✅ | `101` for mainnet (pump.fun is mainnet-only) |
| `DB_NAME` | ✅ | e.g. `AutoVolumeBot` |
| `TAX_WALLET1` | ✅ | Solana address that collects the service fee on stop |
| `JITO_BLOCK_ENGINE_URL` | ✅ | e.g. `tokyo.mainnet.block-engine.jito.wtf` |
| `BOT_TITLE` | – | Display name shown in the bot |

## Running

### Dev
```bash
cd bot
npm start          # ts-node-dev, auto-reloads on file changes
```

### Production (pm2)
```bash
cd bot
pm2 start ecosystem.config.js
pm2 save
pm2 logs fun-volume-bot
```

Common pm2 commands: `pm2 status`, `pm2 restart fun-volume-bot`, `pm2 stop fun-volume-bot`, `pm2 monit`.
After editing `.env` or `src/`, run `pm2 restart fun-volume-bot`.

## Using the bot (Telegram)

1. Open your bot → `/start`.
2. Send a **pump.fun token address** (must still be on the bonding curve — not graduated to Raydium).
3. Copy the **Deposit Wallet** shown and **send it SOL** (~0.5–1 SOL minimum to function). Press **🔄 Refresh** until the balance updates.
4. Set **Target Volume**, **Delay**, and **Buy Amount**.
5. Press **🚀 Start**. Monitor via **🔄 Refresh**; **⚓ Stop** anytime.
6. **💵 Withdraw** SOL or **📤 Export Key** when done.

## Dependency notes

This repo targets a legacy Solana toolchain; a few pins are required for it to run:

- **`@solana/web3.js` pinned to `1.91.0`** + **`rpc-websockets` overridden to `7.5.1`** — `jito-ts@3.0.1` bundles an old web3 that `require`s `rpc-websockets/dist/lib/client`, which newer versions removed.
- **`@project-serum/anchor@0.26.0`** and **`bn.js`** are explicit deps (imported by the swap code but were missing).
- Install with **`--legacy-peer-deps`** (`@solana/spl-token` peer-demands a newer web3).
- `tsconfig.json` runs ts-node in transpile-only mode with `skipLibCheck`.
- Token info comes from pump.fun's current API host: `frontend-api-v3.pump.fun`.

## Project layout

```
bot/
  src/
    index.ts                  entrypoint (Connection + bot init)
    bot.ts                    Telegram menus / command routing
    bot_private.ts            private-chat message handling
    bot_auto_volume_logic.ts  start/stop/run, buy-sell cycles
    pumpfun_swap.ts           pump.fun bonding-curve buy/sell instructions
    jitoAPI.ts / jito_bundler.ts   Jito bundle submission
    db.ts                     mongoose models + helpers
    utils.ts                  wallets, balances, token info, SOL price
    global.ts / uniconst.ts   config + constants
  ecosystem.config.js         pm2 process config
  .env.example                env template
```

## Security

- **Never commit `bot/.env`** (Telegram token) or **`bot/logs/`** (the bot logs deposit-wallet private keys in plaintext). Both are git-ignored.
- Anyone with a deposit wallet's exported key controls that wallet's funds.
