/**
 * Arbitrage opportunity detection and validation.
 */

import { PRICE_SCALE } from "../config.js";
import { calculateSpreadBps } from "../prices/aggregator.js";
import type { ArbitrageOpportunity, PriceFeed, StrategyConfig } from "../types.js";

// Estimated gas cost for a typical PTB arbitrage (in SUI base units)
const DEFAULT_GAS_ESTIMATE = 10_000_000n; // 0.01 SUI

/**
 * Detect if there is a profitable arbitrage opportunity between DeepBook and Cetus.
 * Returns null if no profitable opportunity exists.
 */
export function detectArbitrage(
	deepbookPrice: PriceFeed,
	cetusPrice: PriceFeed,
	config: StrategyConfig,
): ArbitrageOpportunity | null {
	// Determine direction based on mid prices
	if (deepbookPrice.midPrice === 0n || cetusPrice.midPrice === 0n) return null;

	const midSpreadBps = calculateSpreadBps(deepbookPrice.midPrice, cetusPrice.midPrice);

	// Quick check on mid prices before going deeper
	if (midSpreadBps < config.minSpreadBps) return null;

	// Use actual bid/ask for execution prices
	const isDeepBookCheaper = deepbookPrice.midPrice < cetusPrice.midPrice;
	const buyPrice = isDeepBookCheaper ? deepbookPrice.askPrice : cetusPrice.askPrice;
	const sellPrice = isDeepBookCheaper ? cetusPrice.bidPrice : deepbookPrice.bidPrice;

	// Verify sell > buy (after accounting for bid/ask spread)
	if (sellPrice <= buyPrice) return null;

	const actualSpreadBps = calculateSpreadBps(buyPrice, sellPrice);
	if (actualSpreadBps < config.minSpreadBps) return null;

	const direction: ArbitrageOpportunity["direction"] = isDeepBookCheaper
		? "deepbook_to_cetus"
		: "cetus_to_deepbook";

	const optimalSize = calculateOptimalSize(buyPrice, sellPrice, config.maxTradeSizeSui);

	const estimatedProfit = calculateExpectedProfit(buyPrice, sellPrice, optimalSize);

	return {
		direction,
		buyPrice,
		sellPrice,
		spreadBps: actualSpreadBps,
		estimatedProfit,
		maxTradeSize: optimalSize,
	};
}

/**
 * Check if an opportunity is profitable after accounting for gas costs.
 */
export function isOpportunityProfitable(
	opportunity: ArbitrageOpportunity,
	gasEstimate: bigint = DEFAULT_GAS_ESTIMATE,
): boolean {
	return opportunity.estimatedProfit > gasEstimate;
}

/**
 * Calculate the optimal trade size given opportunity and constraints.
 * For now, uses a simple approach: min(maxSize, available liquidity estimate).
 * A more sophisticated approach would use Kelly criterion or similar.
 */
export function calculateOptimalSize(
	buyPrice: bigint,
	sellPrice: bigint,
	maxSize: bigint,
	availableLiquidity?: bigint,
): bigint {
	if (sellPrice <= buyPrice) return 0n;

	let size = maxSize;

	// Cap at available liquidity if provided
	if (availableLiquidity !== undefined && availableLiquidity < size) {
		size = availableLiquidity;
	}

	// Apply conservative sizing: use at most 80% of max to account for slippage
	const conservativeSize = (size * 80n) / 100n;

	return conservativeSize > 0n ? conservativeSize : 0n;
}

/**
 * Calculate expected profit for a trade.
 * profit = (sellPrice - buyPrice) * amount / PRICE_SCALE
 */
export function calculateExpectedProfit(
	buyPrice: bigint,
	sellPrice: bigint,
	amount: bigint,
): bigint {
	if (sellPrice <= buyPrice || amount === 0n) return 0n;

	const priceDiff = sellPrice - buyPrice;
	return (priceDiff * amount) / PRICE_SCALE;
}
