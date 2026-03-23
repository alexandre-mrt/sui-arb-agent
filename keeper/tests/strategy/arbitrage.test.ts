import { describe, expect, it } from "vitest";
import {
	calculateExpectedProfit,
	calculateOptimalSize,
	detectArbitrage,
	isOpportunityProfitable,
} from "../../src/strategy/arbitrage.js";
import type { ArbitrageOpportunity, PriceFeed, StrategyConfig } from "../../src/types.js";

function makePriceFeed(source: PriceFeed["source"], mid: bigint, spread = 50_000_000n): PriceFeed {
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

describe("detectArbitrage", () => {
	it("should detect profitable opportunity (DeepBook cheaper)", () => {
		const db = makePriceFeed("deepbook", 4_900_000_000n, 20_000_000n);
		const cetus = makePriceFeed("cetus", 5_100_000_000n, 20_000_000n);

		const result = detectArbitrage(db, cetus, defaultConfig);

		expect(result).not.toBeNull();
		expect(result?.direction).toBe("deepbook_to_cetus");
		expect(result?.buyPrice).toBe(db.askPrice);
		expect(result?.sellPrice).toBe(cetus.bidPrice);
		expect(result?.estimatedProfit).toBeGreaterThan(0n);
	});

	it("should detect profitable opportunity (Cetus cheaper)", () => {
		const db = makePriceFeed("deepbook", 5_200_000_000n, 20_000_000n);
		const cetus = makePriceFeed("cetus", 5_000_000_000n, 20_000_000n);

		const result = detectArbitrage(db, cetus, defaultConfig);

		expect(result).not.toBeNull();
		expect(result?.direction).toBe("cetus_to_deepbook");
	});

	it("should return null when spread is below minimum", () => {
		const db = makePriceFeed("deepbook", 5_000_000_000n, 100_000n);
		const cetus = makePriceFeed("cetus", 5_001_000_000n, 100_000n);

		const result = detectArbitrage(db, cetus, {
			...defaultConfig,
			minSpreadBps: 100,
		});

		expect(result).toBeNull();
	});

	it("should return null when either price is zero", () => {
		const db = makePriceFeed("deepbook", 0n);
		const cetus = makePriceFeed("cetus", 5_000_000_000n);

		expect(detectArbitrage(db, cetus, defaultConfig)).toBeNull();
	});

	it("should return null when bid/ask spread eliminates opportunity", () => {
		// Mid prices differ but large bid/ask spread closes the gap
		const db = makePriceFeed("deepbook", 5_000_000_000n, 200_000_000n);
		const cetus = makePriceFeed("cetus", 5_050_000_000n, 200_000_000n);

		// DB ask = 5.2, Cetus bid = 4.85 -> sell < buy -> no arb
		const result = detectArbitrage(db, cetus, defaultConfig);
		expect(result).toBeNull();
	});

	it("should return null when prices are equal", () => {
		const price = 5_000_000_000n;
		const db = makePriceFeed("deepbook", price);
		const cetus = makePriceFeed("cetus", price);

		expect(detectArbitrage(db, cetus, defaultConfig)).toBeNull();
	});
});

describe("isOpportunityProfitable", () => {
	it("should return true when profit exceeds gas", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "deepbook_to_cetus",
			buyPrice: 5_000_000_000n,
			sellPrice: 5_100_000_000n,
			spreadBps: 200,
			estimatedProfit: 50_000_000n, // 0.05 SUI
			maxTradeSize: 100_000_000_000n,
		};

		expect(isOpportunityProfitable(opportunity, 10_000_000n)).toBe(true);
	});

	it("should return false when gas exceeds profit", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "deepbook_to_cetus",
			buyPrice: 5_000_000_000n,
			sellPrice: 5_001_000_000n,
			spreadBps: 2,
			estimatedProfit: 1_000_000n, // 0.001 SUI
			maxTradeSize: 100_000_000_000n,
		};

		expect(isOpportunityProfitable(opportunity, 10_000_000n)).toBe(false);
	});

	it("should use default gas estimate when not provided", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "deepbook_to_cetus",
			buyPrice: 5_000_000_000n,
			sellPrice: 5_100_000_000n,
			spreadBps: 200,
			estimatedProfit: 100_000_000n, // 0.1 SUI
			maxTradeSize: 100_000_000_000n,
		};

		// Default gas = 10_000_000 (0.01 SUI), profit = 0.1 SUI -> profitable
		expect(isOpportunityProfitable(opportunity)).toBe(true);
	});
});

describe("calculateOptimalSize", () => {
	it("should return 80% of max size (conservative)", () => {
		const result = calculateOptimalSize(5_000_000_000n, 5_100_000_000n, 100_000_000_000n);
		expect(result).toBe(80_000_000_000n);
	});

	it("should cap at available liquidity", () => {
		const result = calculateOptimalSize(
			5_000_000_000n,
			5_100_000_000n,
			100_000_000_000n,
			50_000_000_000n,
		);
		// 80% of 50 = 40
		expect(result).toBe(40_000_000_000n);
	});

	it("should return 0 when sell <= buy", () => {
		expect(calculateOptimalSize(100n, 100n, 1000n)).toBe(0n);
		expect(calculateOptimalSize(200n, 100n, 1000n)).toBe(0n);
	});
});

describe("calculateExpectedProfit", () => {
	it("should compute profit correctly", () => {
		const buyPrice = 5_000_000_000n;
		const sellPrice = 5_050_000_000n;
		const amount = 100_000_000_000n; // 100 SUI
		// diff = 0.05, profit = 0.05 * 100 = 5 SUI = 5_000_000_000
		expect(calculateExpectedProfit(buyPrice, sellPrice, amount)).toBe(5_000_000_000n);
	});

	it("should return 0 for zero amount", () => {
		expect(calculateExpectedProfit(100n, 200n, 0n)).toBe(0n);
	});

	it("should return 0 when sell <= buy", () => {
		expect(calculateExpectedProfit(200n, 100n, 1000n)).toBe(0n);
	});
});
