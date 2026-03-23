/**
 * CLI entry point for the Sui arbitrage keeper.
 * Usage: bun run src/index.ts [start|status|config]
 */

import { createSuiClient, loadKeypairFromEnv } from "./client.js";
import { loadNetworkConfig, loadPoolConfig, loadStrategyConfig } from "./config.js";
import { buildDirectArbitrageTx } from "./executor/builder.js";
import { executeArbitrage } from "./executor/executor.js";
import { startEventListener } from "./listener/events.js";
import type { AgentState, ArbitrageOpportunity } from "./types.js";

function createInitialState(): AgentState {
	return {
		isRunning: false,
		totalTrades: 0,
		totalProfit: 0n,
		lastCheck: 0,
	};
}

function printBanner(): void {
	console.log("=".repeat(50));
	console.log("  Sui Arbitrage Keeper");
	console.log("  DeepBook v3 <-> Cetus CLMM");
	console.log("=".repeat(50));
}

function printConfig(
	network: ReturnType<typeof loadNetworkConfig>,
	pool: ReturnType<typeof loadPoolConfig>,
	strategy: ReturnType<typeof loadStrategyConfig>,
): void {
	console.log(`Network:      ${network.network}`);
	console.log(`RPC:          ${network.rpcUrl}`);
	console.log(`Package:      ${network.packageId}`);
	console.log(`DeepBook:     ${pool.deepbookPoolId}`);
	console.log(`Cetus:        ${pool.cetusPoolId}`);
	console.log(`Min Spread:   ${strategy.minSpreadBps} bps`);
	console.log(`Max Trade:    ${strategy.maxTradeSizeSui} base units`);
	console.log(`Poll:         ${strategy.pollIntervalMs}ms`);
	console.log(`Slippage:     ${strategy.slippageBps} bps`);
}

function printStatus(state: AgentState): void {
	console.log(`Running:      ${state.isRunning}`);
	console.log(`Total Trades: ${state.totalTrades}`);
	console.log(`Total Profit: ${state.totalProfit}`);
	console.log(
		`Last Check:   ${state.lastCheck ? new Date(state.lastCheck).toISOString() : "never"}`,
	);
	if (state.lastTrade) {
		console.log(
			`Last Trade:   ${state.lastTrade.success ? "success" : "failed"} (${state.lastTrade.digest ?? "no digest"})`,
		);
	}
}

async function startAgent(): Promise<void> {
	const networkConfig = loadNetworkConfig();
	const poolConfig = loadPoolConfig();
	const strategyConfig = loadStrategyConfig();
	const client = createSuiClient(networkConfig);
	const signer = loadKeypairFromEnv();
	const state = createInitialState();

	printBanner();
	printConfig(networkConfig, poolConfig, strategyConfig);
	console.log("-".repeat(50));

	state.isRunning = true;

	const onOpportunity = async (opportunity: ArbitrageOpportunity) => {
		state.lastCheck = Date.now();

		console.log(`[AGENT] Executing ${opportunity.direction} | spread=${opportunity.spreadBps}bps`);

		const tx = buildDirectArbitrageTx(opportunity, {
			network: networkConfig,
			pool: poolConfig,
			slippageBps: strategyConfig.slippageBps,
		});

		const result = await executeArbitrage(client, signer, tx);

		state.lastTrade = result;
		if (result.success) {
			state.totalTrades += 1;
			state.totalProfit += result.profit ?? 0n;
			console.log(
				`[AGENT] Trade #${state.totalTrades} | profit=${result.profit} | total=${state.totalProfit}`,
			);
		} else {
			console.log(`[AGENT] Trade failed: ${result.error}`);
		}
	};

	const listener = startEventListener(
		client,
		networkConfig,
		poolConfig,
		strategyConfig,
		onOpportunity,
	);

	console.log("[AGENT] Started. Press Ctrl+C to stop.");

	// Graceful shutdown
	const shutdown = () => {
		console.log("\n[AGENT] Shutting down...");
		state.isRunning = false;
		listener.stop();
		printStatus(state);
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

// CLI command dispatch
const command = process.argv[2] ?? "start";

switch (command) {
	case "start":
		startAgent().catch((error) => {
			console.error(`[FATAL] ${error}`);
			process.exit(1);
		});
		break;

	case "config": {
		try {
			const networkConfig = loadNetworkConfig();
			const poolConfig = loadPoolConfig();
			const strategyConfig = loadStrategyConfig();
			printBanner();
			printConfig(networkConfig, poolConfig, strategyConfig);
		} catch (error) {
			console.error(`[ERROR] ${error}`);
			process.exit(1);
		}
		break;
	}

	case "status":
		console.log("Status requires a running agent. Use 'start' to begin.");
		break;

	default:
		console.log("Usage: bun run src/index.ts [start|config|status]");
		process.exit(1);
}
