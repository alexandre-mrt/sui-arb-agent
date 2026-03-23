/**
 * Price aggregation and spread calculation.
 * Compares DeepBook and Cetus prices to find arbitrage opportunities.
 */

import { BPS_SCALE, PRICE_SCALE } from "../config.js";
import type { ArbitrageOpportunity, PriceFeed, StrategyConfig } from "../types.js";

export interface AggregatedPrices {
	readonly deepbook: PriceFeed;
	readonly cetus: PriceFeed;
	readonly spreadBps: number;
	readonly direction: ArbitrageOpportunity["direction"] | null;
	readonly opportunity: ArbitrageOpportunity | null;
}

/**
 * Aggregate prices from DeepBook and Cetus, detecting arbitrage opportunities.
 */
export function aggregatePrices(
	deepbookPrice: PriceFeed,
	cetusPrice: PriceFeed,
	config: StrategyConfig,
): AggregatedPrices {
	const spreadBps = calculateSpreadBps(deepbookPrice.midPrice, cetusPrice.midPrice);

	// Determine direction: buy on cheaper DEX, sell on more expensive
	const direction = determineDirection(deepbookPrice, cetusPrice);

	let opportunity: ArbitrageOpportunity | null = null;

	if (direction && spreadBps >= config.minSpreadBps) {
		const { buyPrice, sellPrice } =
			direction === "deepbook_to_cetus"
				? { buyPrice: deepbookPrice.askPrice, sellPrice: cetusPrice.bidPrice }
				: { buyPrice: cetusPrice.askPrice, sellPrice: deepbookPrice.bidPrice };

		// Verify actual spread with bid/ask (not mid prices)
		const actualSpreadBps = calculateSpreadBps(buyPrice, sellPrice);
		if (actualSpreadBps >= config.minSpreadBps && sellPrice > buyPrice) {
			const estimatedProfit = estimateProfit(buyPrice, sellPrice, config.maxTradeSizeSui);

			opportunity = {
				direction,
				buyPrice,
				sellPrice,
				spreadBps: actualSpreadBps,
				estimatedProfit,
				maxTradeSize: config.maxTradeSizeSui,
			};
		}
	}

	return {
		deepbook: deepbookPrice,
		cetus: cetusPrice,
		spreadBps,
		direction,
		opportunity,
	};
}

/**
 * Calculate spread in basis points between two prices.
 * spread_bps = |priceA - priceB| * BPS_SCALE / min(priceA, priceB)
 */
export function calculateSpreadBps(priceA: bigint, priceB: bigint): number {
	if (priceA === 0n || priceB === 0n) return 0;

	const diff = priceA > priceB ? priceA - priceB : priceB - priceA;
	const minPrice = priceA < priceB ? priceA : priceB;

	const spreadBps = (diff * BigInt(BPS_SCALE)) / minPrice;
	return Number(spreadBps);
}

/**
 * Determine trade direction based on mid prices.
 * Returns null if prices are equal.
 */
export function determineDirection(
	deepbook: PriceFeed,
	cetus: PriceFeed,
): ArbitrageOpportunity["direction"] | null {
	if (deepbook.midPrice === cetus.midPrice) return null;

	// Buy on cheaper DEX, sell on more expensive
	return deepbook.midPrice < cetus.midPrice ? "deepbook_to_cetus" : "cetus_to_deepbook";
}

/**
 * Estimate gross profit for a given trade size.
 * profit = (sellPrice - buyPrice) * amount / PRICE_SCALE
 */
export function estimateProfit(buyPrice: bigint, sellPrice: bigint, amount: bigint): bigint {
	if (sellPrice <= buyPrice) return 0n;
	if (amount === 0n) return 0n;

	const priceDiff = sellPrice - buyPrice;
	return (priceDiff * amount) / PRICE_SCALE;
}

/**
 * Normalize a price from arbitrary decimals to PRICE_SCALE (1e9).
 */
export function normalizePrice(price: bigint, sourceDecimals: number): bigint {
	const targetDecimals = 9; // PRICE_SCALE = 1e9
	if (sourceDecimals === targetDecimals) return price;
	if (sourceDecimals < targetDecimals) {
		return price * 10n ** BigInt(targetDecimals - sourceDecimals);
	}
	return price / 10n ** BigInt(sourceDecimals - targetDecimals);
}
