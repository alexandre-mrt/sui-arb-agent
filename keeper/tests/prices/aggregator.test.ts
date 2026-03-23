import { describe, expect, it } from "vitest";
import { PRICE_SCALE } from "../../src/config.js";
import {
	aggregatePrices,
	calculateSpreadBps,
	determineDirection,
	estimateProfit,
	normalizePrice,
} from "../../src/prices/aggregator.js";
import type { PriceFeed, StrategyConfig } from "../../src/types.js";

function makePriceFeed(source: PriceFeed["source"], mid: bigint, spread = 100_000n): PriceFeed {
	return {
		source,
		baseAsset: "0x2::sui::SUI",
		quoteAsset: "0x2::usdc::USDC",
		bidPrice: mid - spread,
		askPrice: mid + spread,
		midPrice: mid,
		timestamp: Date.now(),
	};
}

const defaultConfig: StrategyConfig = {
	minSpreadBps: 30,
	maxTradeSizeSui: 100_000_000_000n,
	pollIntervalMs: 2000,
	slippageBps: 50,
};

describe("calculateSpreadBps", () => {
	it("should return 0 for equal prices", () => {
		const price = 5_000_000_000n;
		expect(calculateSpreadBps(price, price)).toBe(0);
	});

	it("should return 0 if either price is 0", () => {
		expect(calculateSpreadBps(0n, 5_000_000_000n)).toBe(0);
		expect(calculateSpreadBps(5_000_000_000n, 0n)).toBe(0);
	});

	it("should calculate 1% spread (100 bps)", () => {
		const priceA = 1_000_000_000n; // 1.0
		const priceB = 1_010_000_000n; // 1.01
		const spread = calculateSpreadBps(priceA, priceB);
		expect(spread).toBe(100); // 1% = 100 bps
	});

	it("should calculate 0.5% spread (50 bps)", () => {
		const priceA = 10_000_000_000n; // 10.0
		const priceB = 10_050_000_000n; // 10.05
		expect(calculateSpreadBps(priceA, priceB)).toBe(50);
	});

	it("should be symmetric", () => {
		const priceA = 5_000_000_000n;
		const priceB = 5_100_000_000n;
		expect(calculateSpreadBps(priceA, priceB)).toBe(calculateSpreadBps(priceB, priceA));
	});

	it("should handle extreme spread", () => {
		const priceA = 1_000_000_000n;
		const priceB = 2_000_000_000n;
		expect(calculateSpreadBps(priceA, priceB)).toBe(10000); // 100%
	});
});

describe("determineDirection", () => {
	it("should return deepbook_to_cetus when DeepBook is cheaper", () => {
		const db = makePriceFeed("deepbook", 4_900_000_000n);
		const cetus = makePriceFeed("cetus", 5_000_000_000n);
		expect(determineDirection(db, cetus)).toBe("deepbook_to_cetus");
	});

	it("should return cetus_to_deepbook when Cetus is cheaper", () => {
		const db = makePriceFeed("deepbook", 5_100_000_000n);
		const cetus = makePriceFeed("cetus", 5_000_000_000n);
		expect(determineDirection(db, cetus)).toBe("cetus_to_deepbook");
	});

	it("should return null when prices are equal", () => {
		const db = makePriceFeed("deepbook", 5_000_000_000n);
		const cetus = makePriceFeed("cetus", 5_000_000_000n);
		expect(determineDirection(db, cetus)).toBeNull();
	});
});

describe("estimateProfit", () => {
	it("should return 0 when sell <= buy", () => {
		expect(estimateProfit(100n, 100n, 1000n)).toBe(0n);
		expect(estimateProfit(200n, 100n, 1000n)).toBe(0n);
	});

	it("should return 0 for zero amount", () => {
		expect(estimateProfit(100n, 200n, 0n)).toBe(0n);
	});

	it("should calculate profit correctly", () => {
		const buyPrice = 5_000_000_000n; // 5.0
		const sellPrice = 5_050_000_000n; // 5.05
		const amount = 100_000_000_000n; // 100 SUI
		// profit = (5.05 - 5.0) * 100 / 1e9 * 1e9 = 5_000_000_000
		const profit = estimateProfit(buyPrice, sellPrice, amount);
		expect(profit).toBe(5_000_000_000n);
	});
});

describe("normalizePrice", () => {
	it("should return as-is for 9 decimals", () => {
		expect(normalizePrice(1_000_000_000n, 9)).toBe(1_000_000_000n);
	});

	it("should scale up from 6 decimals", () => {
		expect(normalizePrice(1_000_000n, 6)).toBe(1_000_000_000n);
	});

	it("should scale down from 18 decimals", () => {
		expect(normalizePrice(1_000_000_000_000_000_000n, 18)).toBe(1_000_000_000n);
	});
});

describe("aggregatePrices", () => {
	it("should detect opportunity when spread is above threshold", () => {
		// DeepBook ask < Cetus bid = profitable
		const db = makePriceFeed("deepbook", 4_900_000_000n, 50_000_000n);
		const cetus = makePriceFeed("cetus", 5_100_000_000n, 50_000_000n);

		const result = aggregatePrices(db, cetus, defaultConfig);

		expect(result.direction).toBe("deepbook_to_cetus");
		expect(result.opportunity).not.toBeNull();
		expect(result.opportunity?.direction).toBe("deepbook_to_cetus");
		expect(result.opportunity?.spreadBps).toBeGreaterThan(0);
	});

	it("should return null opportunity when spread is below threshold", () => {
		const db = makePriceFeed("deepbook", 5_000_000_000n, 50_000n);
		const cetus = makePriceFeed("cetus", 5_000_100_000n, 50_000n);

		const result = aggregatePrices(db, cetus, { ...defaultConfig, minSpreadBps: 100 });

		expect(result.opportunity).toBeNull();
	});

	it("should return null opportunity when prices are equal", () => {
		const price = 5_000_000_000n;
		const db = makePriceFeed("deepbook", price);
		const cetus = makePriceFeed("cetus", price);

		const result = aggregatePrices(db, cetus, defaultConfig);

		expect(result.direction).toBeNull();
		expect(result.opportunity).toBeNull();
	});

	it("should handle cetus_to_deepbook direction", () => {
		const db = makePriceFeed("deepbook", 5_200_000_000n, 50_000_000n);
		const cetus = makePriceFeed("cetus", 5_000_000_000n, 50_000_000n);

		const result = aggregatePrices(db, cetus, defaultConfig);

		expect(result.direction).toBe("cetus_to_deepbook");
		if (result.opportunity) {
			expect(result.opportunity.direction).toBe("cetus_to_deepbook");
		}
	});
});
