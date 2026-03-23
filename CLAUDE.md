# Sui DeFi Arbitrage Agent

## Overview
Autonomous DeFi arbitrage agent on Sui detecting price discrepancies between DeepBook v3 (CLOB) and Cetus (AMM), executing atomic swaps via PTBs.

## Structure
```
contracts/       — Sui Move smart contracts (vault, strategy, validator, events)
keeper/          — TypeScript/Bun off-chain keeper (event listener, price aggregator, executor)
```

## Stack
- **Smart Contracts**: Sui Move (edition 2024.beta)
- **Off-chain**: TypeScript + Bun
- **DEXs**: DeepBook v3 + Cetus CLMM
- **Testing**: `sui move test` (Move) + Vitest (TypeScript)
- **Linting**: Biome

## Dev Commands
```bash
# Move
cd contracts && sui move build
cd contracts && sui move test

# TypeScript
cd keeper && bun install
cd keeper && bun run dev
cd keeper && bun test
cd keeper && bunx biome check --write .
```

## Key Architecture
- Move modules handle vault management, strategy config, profitability validation, trade events
- PTBs compose cross-protocol calls (DeepBook + Cetus) — no direct Move imports of DEX packages
- Event-driven keeper subscribes to price changes and executes arb when profitable
- Flash loan support for capital-free arbitrage via DeepBook v3

## Relevant Skills
- `/sui-move` — Sui Move smart contract development
- `/test-ts` — TypeScript tests with Vitest
- `/security-reviewer` — Security audit for contracts
