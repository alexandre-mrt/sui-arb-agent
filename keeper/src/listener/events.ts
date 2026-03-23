/**
 * Event-driven price monitoring.
 * Subscribes to on-chain events and polls as fallback.
 */

import type { SuiClient } from "@mysten/sui/client";
import { aggregatePrices } from "../prices/aggregator.js";
import { fetchCetusPrice } from "../prices/cetus.js";
import { fetchDeepBookPrice } from "../prices/deepbook.js";
import type { ArbitrageOpportunity, NetworkConfig, PoolConfig, StrategyConfig } from "../types.js";

type OpportunityCallback = (opportunity: ArbitrageOpportunity) => void;

interface ListenerHandle {
	readonly stop: () => void;
}

/**
 * Start event-based price monitoring with polling fallback.
 * Calls onOpportunity whenever a profitable arb is detected.
 */
export function startEventListener(
	client: SuiClient,
	networkConfig: NetworkConfig,
	poolConfig: PoolConfig,
	strategyConfig: StrategyConfig,
	onOpportunity: OpportunityCallback,
): ListenerHandle {
	let isRunning = true;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let unsubscribes: Array<() => void> = [];

	// Start WebSocket subscription for real-time events
	startSubscriptions(
		client,
		networkConfig,
		poolConfig,
		strategyConfig,
		onOpportunity,
		unsubscribes,
	).catch((error) => {
		console.warn(`[LISTENER] WebSocket subscription failed, using polling only: ${error}`);
	});

	// Always run polling as a fallback/complement
	pollTimer = setInterval(() => {
		if (!isRunning) return;
		pollPrices(client, networkConfig, poolConfig, strategyConfig, onOpportunity).catch((error) => {
			console.error(`[LISTENER] Poll error: ${error}`);
		});
	}, strategyConfig.pollIntervalMs);

	return {
		stop: () => {
			isRunning = false;
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			for (const unsub of unsubscribes) {
				unsub();
			}
			unsubscribes = [];
			console.log("[LISTENER] Stopped");
		},
	};
}

/**
 * Subscribe to DeepBook and Cetus trade events via WebSocket.
 */
async function startSubscriptions(
	client: SuiClient,
	networkConfig: NetworkConfig,
	poolConfig: PoolConfig,
	strategyConfig: StrategyConfig,
	onOpportunity: OpportunityCallback,
	unsubscribes: Array<() => void>,
): Promise<void> {
	// Debounce: track last check time
	let lastCheckMs = 0;
	const minIntervalMs = Math.max(strategyConfig.pollIntervalMs / 2, 500);

	const handleEvent = async () => {
		const now = Date.now();
		if (now - lastCheckMs < minIntervalMs) return;
		lastCheckMs = now;

		await pollPrices(client, networkConfig, poolConfig, strategyConfig, onOpportunity);
	};

	// Subscribe to DeepBook trade events
	try {
		const deepbookUnsub = await client.subscribeEvent({
			filter: {
				Package: networkConfig.deepbookPackageId,
			},
			onMessage: () => {
				handleEvent().catch(console.error);
			},
		});
		unsubscribes.push(() => deepbookUnsub());
	} catch {
		console.warn("[LISTENER] Could not subscribe to DeepBook events");
	}

	// Subscribe to our own trade events
	try {
		const arbUnsub = await client.subscribeEvent({
			filter: {
				MoveEventType: `${networkConfig.packageId}::events::TradeExecuted`,
			},
			onMessage: (event) => {
				console.log(`[EVENT] TradeExecuted: ${JSON.stringify(event.parsedJson)}`);
			},
		});
		unsubscribes.push(() => arbUnsub());
	} catch {
		console.warn("[LISTENER] Could not subscribe to arb events");
	}
}

/**
 * Poll both DEXs for current prices and check for opportunities.
 */
export async function pollPrices(
	client: SuiClient,
	networkConfig: NetworkConfig,
	poolConfig: PoolConfig,
	strategyConfig: StrategyConfig,
	onOpportunity: OpportunityCallback,
): Promise<void> {
	const [deepbookPrice, cetusPrice] = await Promise.all([
		fetchDeepBookPrice(
			client,
			poolConfig.deepbookPoolId,
			networkConfig.deepbookPackageId,
			poolConfig.baseAsset,
			poolConfig.quoteAsset,
		),
		fetchCetusPrice(
			client,
			poolConfig.cetusPoolId,
			poolConfig.baseAsset,
			poolConfig.quoteAsset,
			poolConfig.baseDecimals,
			poolConfig.quoteDecimals,
		),
	]);

	const result = aggregatePrices(deepbookPrice, cetusPrice, strategyConfig);

	if (result.opportunity) {
		console.log(
			`[LISTENER] Opportunity found: ${result.opportunity.direction} | spread=${result.opportunity.spreadBps}bps | profit=${result.opportunity.estimatedProfit}`,
		);
		onOpportunity(result.opportunity);
	}
}
