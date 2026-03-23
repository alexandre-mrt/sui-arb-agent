# Night Shift Plan — 2026-03-24

## Objective

Build a fully functional Sui DeFi arbitrage agent that detects price discrepancies between DeepBook v3 (CLOB) and Cetus (AMM) and executes atomic swaps to capture the spread. MVP on devnet with comprehensive mocked tests.

## Architecture

### On-chain (Move contracts — `contracts/`)

```
contracts/
├── Move.toml
├── sources/
│   ├── vault.move          — Shared vault holding agent funds, capability-gated
│   ├── strategy.move       — On-chain strategy config (min spread, max size, pairs)
│   ├── validator.move      — Arbitrage profitability validator
│   ├── events.move         — Trade event structs
│   └── mock_pool.move      — Test-only mock DEX pool for unit tests
└── tests/
    ├── vault_tests.move
    ├── strategy_tests.move
    ├── validator_tests.move
    └── integration_tests.move
```

**Key design decisions:**
- The Move modules do NOT directly import DeepBook/Cetus packages (too complex for dependency management)
- Instead, the **PTB (Programmable Transaction Block)** composes cross-protocol calls
- Move modules handle: vault management, strategy validation, profitability checks, event emission
- The keeper builds PTBs that: read prices → validate via Move → execute swaps on DEXs → log via Move events

### Off-chain (TypeScript keeper — `keeper/`)

```
keeper/
├── package.json
├── tsconfig.json
├── biome.json
├── src/
│   ├── index.ts            — Entry point, CLI setup
│   ├── config.ts           — Environment config, constants
│   ├── client.ts           — SuiClient setup
│   ├── prices/
│   │   ├── deepbook.ts     — DeepBook v3 price feed
│   │   ├── cetus.ts        — Cetus CLMM price feed
│   │   └── aggregator.ts   — Price aggregation + spread calculation
│   ├── executor/
│   │   ├── builder.ts      — PTB builder for arbitrage transactions
│   │   └── executor.ts     — Transaction signing + execution
│   ├── listener/
│   │   └── events.ts       — Event-driven listener for price changes
│   ├── strategy/
│   │   └── arbitrage.ts    — Arbitrage opportunity detection logic
│   └── types.ts            — Shared type definitions
├── tests/
│   ├── prices/
│   │   ├── deepbook.test.ts
│   │   ├── cetus.test.ts
│   │   └── aggregator.test.ts
│   ├── executor/
│   │   └── builder.test.ts
│   ├── strategy/
│   │   └── arbitrage.test.ts
│   └── mocks/
│       ├── sui-client.ts   — Mocked SuiClient
│       ├── deepbook.ts     — Mocked DeepBook responses
│       └── cetus.ts        — Mocked Cetus responses
└── vitest.config.ts
```

### Arbitrage Flow (PTB composition)

**Strategy 1: Direct Arbitrage (with capital)**
1. Listener detects price divergence between DeepBook and Cetus
2. Strategy module calculates if spread > threshold + gas
3. Keeper builds PTB:
   - Split coins from vault
   - Buy on cheaper DEX (e.g., DeepBook `swap_exact_base_for_quote`)
   - Sell on expensive DEX (e.g., Cetus swap)
   - Return profit to vault
   - Emit trade event via our Move module
4. Sign and execute

**Strategy 2: Flash Loan Arbitrage (capital-free)**
1. Same detection
2. PTB:
   - Borrow via DeepBook flash loan
   - Swap on Cetus
   - Repay flash loan + keep profit
   - Emit trade event

## Parallelizable Workstreams

### Workstream A: Move Contracts + Tests
- vault.move + vault_tests.move
- strategy.move + strategy_tests.move
- validator.move + validator_tests.move
- events.move
- mock_pool.move + integration_tests.move

### Workstream B: TypeScript Keeper + Tests
- Project setup (package.json, tsconfig, biome)
- types.ts, config.ts, client.ts
- prices/ (deepbook.ts, cetus.ts, aggregator.ts) + tests
- executor/ (builder.ts, executor.ts) + tests
- strategy/ (arbitrage.ts) + tests
- listener/ (events.ts)
- index.ts (CLI entry point)

### Sequential (after A + B)
- Integration testing
- Final validation (build + test + lint)
- GitHub push + PR

## Steps (ordered by dependency)

1. Scaffold project structure (Move + TS) — **sequential (foundation)**
2. Move contracts: vault, strategy, validator, events — **workstream A**
3. Move tests with mocked prices — **workstream A**
4. TS keeper: types, config, client, price feeds — **workstream B**
5. TS keeper: executor, strategy, listener, CLI — **workstream B**
6. TS tests with mocked APIs — **workstream B**
7. Integration testing — **sequential (depends on A + B)**
8. Final validation + GitHub push + PR — **sequential**

## Pre-made Decisions

### Decision: PTB-based cross-DEX composition (not Move imports)
**Choice:** Use PTBs to compose DeepBook + Cetus calls, not direct Move imports
**Reason:** Importing DeepBook/Cetus Move packages requires exact version pinning and complex dependency management. PTBs are the idiomatic Sui way to compose cross-protocol calls.
**Alternative:** Direct Move imports of DEX packages

### Decision: Mock pools for Move testing
**Choice:** Create a `mock_pool` Move module that simulates DEX behavior for unit tests
**Reason:** Cannot depend on devnet state for tests. Mock pools allow deterministic price testing.
**Alternative:** Deploy to devnet and test against live pools (flaky, slow)

### Decision: DeepBook flash loans for capital-free arbitrage
**Choice:** Support both funded and flash loan arbitrage strategies
**Reason:** Flash loans enable capital-free arb, which is the killer feature. DeepBook v3 natively supports them.
**Alternative:** Only funded arbitrage

### Decision: Cetus SDK for swap execution
**Choice:** Use `@cetusprotocol/cetus-sui-clmm-sdk` for Cetus integration
**Reason:** Well-documented SDK with preswap estimation and slippage calculation
**Alternative:** Raw Move calls to Cetus contracts

### Decision: Event-driven with polling fallback
**Choice:** WebSocket event subscription + periodic polling as fallback
**Reason:** WebSocket gives real-time price updates, polling ensures no missed opportunities
**Alternative:** Pure polling (slower detection)

## Estimate

- Move files: ~8 source files + ~4 test files
- TypeScript files: ~15 source files + ~8 test files + ~3 mock files
- Config files: ~6 (Move.toml, package.json, tsconfig, biome, vitest, .env.example)
- Total: ~44 files

---

## Night Shift Summary — 2026-03-24

### Completed
- [x] Project scaffold (Move + TypeScript structure, configs, CLAUDE.md)
- [x] Move contracts: vault (Bag-based generic storage), strategy config, arbitrage validator, trade events
- [x] Move mock_pool for deterministic testing
- [x] Move tests: 36 tests covering vault, strategy, validator, integration (all passing)
- [x] TypeScript keeper: price feeds (DeepBook + Cetus), aggregator, strategy, PTB builder, executor, event listener, CLI
- [x] TypeScript tests: 76 tests with fully mocked DEX APIs (all passing)
- [x] Biome lint: 0 errors across 23 files
- [x] Final validation: all builds, tests, and lint pass

### Decisions made
- PTB composition over direct Move imports: idiomatic Sui, avoids dependency hell
- Bag-based vault for generic multi-coin storage
- Flash loan + direct arbitrage dual strategy support
- Mock pools in Move + mocked APIs in TS for devnet-independent testing
- Event-driven listener with polling fallback for resilience

### Not completed / Needs review
- Navi Protocol integration (backup DEX) not implemented yet
- Deployment to devnet/testnet (deferred to manual testing phase)
- Real token pair configuration for mainnet
- Gas optimization for PTB construction
- Rate limiting / backoff for RPC calls

### Issues encountered
- None blocking. Clean implementation on both workstreams.

### Final validation
- Build: PASS (Move + TS)
- Tests: 112 pass / 0 fail (36 Move + 76 TypeScript)
- Lint: PASS (Biome, 0 errors)
- Visual: N/A (CLI only)

### Stats
- Files created: 30 (9 Move source/test + 18 TS source/test + 3 config)
- Files modified: 0
- Tests: 112 pass / 0 fail
- Commits: 4
