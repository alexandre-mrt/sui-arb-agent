import type { SuiClient } from "@mysten/sui/client";
import { describe, expect, it, vi } from "vitest";
import { PRICE_SCALE } from "../../src/config.js";
import {
	bigIntSqrt,
	extractSqrtPrice,
	fetchCetusPrice,
	priceToSqrtPriceX64,
	sqrtPriceToPrice,
} from "../../src/prices/cetus.js";
import { createMockCetusPool, createMockCetusPoolNested } from "../mocks/cetus.js";
import { createMockSuiClient } from "../mocks/sui-client.js";

const MOCK_POOL_ID = "0xcetus_pool";
const MOCK_BASE = "0x2::sui::SUI";
const MOCK_QUOTE = "0x2::usdc::USDC";

describe("bigIntSqrt", () => {
	it("should compute sqrt(0) = 0", () => {
		expect(bigIntSqrt(0n)).toBe(0n);
	});

	it("should compute sqrt(1) = 1", () => {
		expect(bigIntSqrt(1n)).toBe(1n);
	});

	it("should compute sqrt(4) = 2", () => {
		expect(bigIntSqrt(4n)).toBe(2n);
	});

	it("should compute sqrt(100) = 10", () => {
		expect(bigIntSqrt(100n)).toBe(10n);
	});

	it("should floor non-perfect squares", () => {
		// sqrt(5) ~ 2.236, should return 2
		expect(bigIntSqrt(5n)).toBe(2n);
	});

	it("should handle very large numbers", () => {
		const x = 1n << 128n;
		expect(bigIntSqrt(x)).toBe(1n << 64n);
	});

	it("should throw for negative input", () => {
		expect(() => bigIntSqrt(-1n)).toThrow("sqrt of negative bigint");
	});
});

describe("sqrtPriceToPrice", () => {
	it("should convert identity case (same decimals)", () => {
		// sqrtPrice = 1 * 2^64 means price = 1.0
		const x64 = 1n << 64n;
		const price = sqrtPriceToPrice(x64, 9, 9);
		expect(price).toBe(PRICE_SCALE); // 1.0 * 1e9
	});

	it("should handle zero sqrt price", () => {
		expect(sqrtPriceToPrice(0n, 9, 6)).toBe(0n);
	});

	it("should handle decimal difference (9 vs 6)", () => {
		// For SUI(9) / USDC(6), decimalDiff = 3
		// sqrtPrice = sqrt(price * 2^128 / 10^3 / PRICE_SCALE)
		// If price = 2.0 SUI/USDC = 2_000_000_000 scaled
		const targetPrice = 2_000_000_000n;
		const sqrtPrice = priceToSqrtPriceX64(targetPrice, 9, 6);
		const recovered = sqrtPriceToPrice(sqrtPrice, 9, 6);

		// Allow small rounding error (< 0.01%)
		const diff = targetPrice > recovered ? targetPrice - recovered : recovered - targetPrice;
		const tolerance = targetPrice / 10000n; // 0.01%
		expect(diff).toBeLessThanOrEqual(tolerance);
	});

	it("should handle high price (100 SUI/USDC)", () => {
		const targetPrice = 100_000_000_000n; // 100.0
		const sqrtPrice = priceToSqrtPriceX64(targetPrice, 9, 6);
		const recovered = sqrtPriceToPrice(sqrtPrice, 9, 6);

		const diff = targetPrice > recovered ? targetPrice - recovered : recovered - targetPrice;
		expect(diff).toBeLessThanOrEqual(targetPrice / 10000n);
	});

	it("should handle low price (0.001)", () => {
		const targetPrice = 1_000_000n; // 0.001
		const sqrtPrice = priceToSqrtPriceX64(targetPrice, 9, 9);
		const recovered = sqrtPriceToPrice(sqrtPrice, 9, 9);

		const diff = targetPrice > recovered ? targetPrice - recovered : recovered - targetPrice;
		// Larger tolerance for very small prices
		expect(diff).toBeLessThanOrEqual(targetPrice / 100n);
	});
});

describe("priceToSqrtPriceX64", () => {
	it("should return 0 for zero price", () => {
		expect(priceToSqrtPriceX64(0n, 9, 6)).toBe(0n);
	});

	it("should be inverse of sqrtPriceToPrice", () => {
		const original = 3_500_000_000n; // 3.5
		const sqrtPrice = priceToSqrtPriceX64(original, 9, 6);
		const recovered = sqrtPriceToPrice(sqrtPrice, 9, 6);

		const diff = original > recovered ? original - recovered : recovered - original;
		expect(diff).toBeLessThanOrEqual(original / 10000n);
	});
});

describe("extractSqrtPrice", () => {
	it("should extract from flat fields", () => {
		const fields = { current_sqrt_price: "12345678901234567890" };
		expect(extractSqrtPrice(fields)).toBe(12345678901234567890n);
	});

	it("should extract from nested fields", () => {
		const fields = {
			current_sqrt_price: {
				fields: { value: "12345678901234567890" },
			},
		};
		expect(extractSqrtPrice(fields as Record<string, unknown>)).toBe(12345678901234567890n);
	});

	it("should throw when field is missing", () => {
		expect(() => extractSqrtPrice({})).toThrow("Could not extract");
	});
});

describe("fetchCetusPrice", () => {
	it("should return a PriceFeed from pool data", async () => {
		const targetPrice = 5_000_000_000n;
		const sqrtPrice = priceToSqrtPriceX64(targetPrice, 9, 6);
		const mockPool = createMockCetusPool(sqrtPrice);

		const mockClient = createMockSuiClient({
			getObject: vi.fn().mockResolvedValue(mockPool),
		});

		const result = await fetchCetusPrice(
			mockClient as unknown as SuiClient,
			MOCK_POOL_ID,
			MOCK_BASE,
			MOCK_QUOTE,
			9,
			6,
		);

		expect(result.source).toBe("cetus");
		expect(result.baseAsset).toBe(MOCK_BASE);
		expect(result.quoteAsset).toBe(MOCK_QUOTE);
		// Mid price should be close to target
		const diff =
			result.midPrice > targetPrice ? result.midPrice - targetPrice : targetPrice - result.midPrice;
		expect(diff).toBeLessThanOrEqual(targetPrice / 10000n);
		expect(result.bidPrice).toBeLessThan(result.midPrice);
		expect(result.askPrice).toBeGreaterThan(result.midPrice);
	});

	it("should throw when pool is not found", async () => {
		const mockClient = createMockSuiClient({
			getObject: vi.fn().mockResolvedValue({ data: null }),
		});

		await expect(
			fetchCetusPrice(
				mockClient as unknown as SuiClient,
				MOCK_POOL_ID,
				MOCK_BASE,
				MOCK_QUOTE,
				9,
				6,
			),
		).rejects.toThrow("pool not found");
	});

	it("should throw on RPC error", async () => {
		const mockClient = createMockSuiClient({
			getObject: vi.fn().mockRejectedValue(new Error("connection refused")),
		});

		await expect(
			fetchCetusPrice(
				mockClient as unknown as SuiClient,
				MOCK_POOL_ID,
				MOCK_BASE,
				MOCK_QUOTE,
				9,
				6,
			),
		).rejects.toThrow("Failed to fetch Cetus price");
	});

	it("should handle nested sqrt_price fields", async () => {
		const targetPrice = 3_000_000_000n;
		const sqrtPrice = priceToSqrtPriceX64(targetPrice, 9, 6);
		const mockPool = createMockCetusPoolNested(sqrtPrice);

		const mockClient = createMockSuiClient({
			getObject: vi.fn().mockResolvedValue(mockPool),
		});

		const result = await fetchCetusPrice(
			mockClient as unknown as SuiClient,
			MOCK_POOL_ID,
			MOCK_BASE,
			MOCK_QUOTE,
			9,
			6,
		);

		expect(result.source).toBe("cetus");
		const diff =
			result.midPrice > targetPrice ? result.midPrice - targetPrice : targetPrice - result.midPrice;
		expect(diff).toBeLessThanOrEqual(targetPrice / 10000n);
	});
});
