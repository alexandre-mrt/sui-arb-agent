# Sui DeFi Arbitrage Agent — Spec

## Overview

Autonomous DeFi arbitrage agent on Sui that detects price discrepancies between DEXs and executes atomic swaps to capture the spread. The agent's decision logic lives **on-chain** in Move modules, triggered by an event-driven off-chain keeper.

## Architecture

### On-chain (Sui Move)
- **Arbitrage Engine**: Move modules containing the core arbitrage logic (price comparison, profitability check, execution)
- **Strategy Config**: On-chain object storing strategy parameters (min spread threshold, max trade size, allowed token pairs)
- **Vault**: Shared object holding the agent's funds, with capability-gated access
- **Trade History**: On-chain log of executed trades for transparency

### Off-chain (TypeScript/Bun)
- **Event Listener**: Subscribes to on-chain events (price updates, pool state changes) from DeepBook and Cetus
- **Price Feed Aggregator**: Collects and normalizes prices from multiple DEXs
- **Keeper/Executor**: When conditions are met, builds and submits the arbitrage transaction
- **CLI Dashboard**: Real-time logs showing detected opportunities, executed trades, P&L

### Flow
1. Event listener detects price change on DeepBook or Cetus
2. Price feed aggregator computes spread between the two DEXs
3. If spread > threshold, keeper builds a PTB (Programmable Transaction Block) that:
   a. Reads prices from both DEXs
   b. Calls the on-chain arbitrage engine to validate profitability
   c. Executes atomic swap: buy on cheap DEX, sell on expensive DEX
4. On-chain module validates all parameters and executes (or rejects if unprofitable after gas)
5. Trade result emitted as event, logged by the CLI

## Target DEX Integrations

### Primary
- **DeepBook v3**: Sui's native CLOB. Use for limit order placement and order book price discovery.
- **Cetus**: Leading AMM on Sui. Use concentrated liquidity pools for swap execution.

### Backup
- **Navi Protocol**: If Cetus lacks needed features (e.g., specific token pairs), use Navi as alternative liquidity source.

## Token Pairs
- SUI/USDC (primary)
- Additional pairs configurable via on-chain strategy config

## Testing Strategy (CRITICAL)

### Move Tests (`sui move test`)
- Mock price feeds to simulate different spread scenarios
- Test arbitrage logic with various spread sizes (profitable, unprofitable, edge cases)
- Test vault access control (only authorized keeper can execute)
- Test with mocked tokens (create test coins if needed)
- Test gas estimation and profitability calculations
- Test edge cases: zero liquidity, extreme spreads, concurrent executions

### TypeScript Tests (Vitest)
- Mock DEX API responses for price feeds
- Test price aggregation and spread calculation logic
- Test event listener with mocked WebSocket events
- Test keeper decision logic (when to execute, when to skip)
- Test transaction building with mocked Sui SDK
- Integration tests simulating full flow with mocked on-chain state

### Key Testing Principle
**Everything must be testable without devnet/testnet dependency.** Mock all external dependencies (price feeds, on-chain state, token contracts) so tests run reliably and fast. Tomorrow we'll test on testnet/mainnet with real tokens.

## Stack

- **Smart Contracts**: Sui Move
- **Off-chain**: TypeScript with Bun runtime
- **Sui SDK**: `@mysten/sui` (latest)
- **Testing**: `sui move test` (Move) + Vitest (TypeScript)
- **Linting**: Biome
- **CLI**: Custom with structured logging

## Deliverables

1. Move modules: arbitrage engine, vault, strategy config, trade history
2. TypeScript keeper: event listener, price aggregator, executor, CLI
3. Comprehensive tests (Move + TypeScript) with mocked prices and tokens
4. Working MVP on devnet (but not dependent on devnet for tests)
5. Push to GitHub with clean commit history
6. PR ready for review

## Constraints

- 6-8 hours of autonomous work
- No secrets in code — use .env
- Strict typing, no `any`
- Immutability by default
- Files < 400 lines
- Functions < 50 lines
- Conventional commits: `night-shift: <description>`
- All documentation and code in English
