import type { SuiClient } from "@mysten/sui/client";
import { describe, expect, it, vi } from "vitest";
import {
	fetchDeepBookPrice,
	fetchMidPrice,
	parseBcsU64,
	parseBcsVecU64,
} from "../../src/prices/deepbook.js";
import {
	createMockDeepBookResponses,
	createMockLevel2Response,
	createMockMidPriceResponse,
	u64ToLeBytes,
	vecU64ToBytes,
} from "../mocks/deepbook.js";
import { createDevInspectFailure, createMockSuiClient } from "../mocks/sui-client.js";

const MOCK_POOL_ID = "0xpool";
const MOCK_PACKAGE_ID = "0xdeepbook";
const MOCK_BASE = "0x2::sui::SUI";
const MOCK_QUOTE = "0x2::usdc::USDC";

describe("parseBcsU64", () => {
	it("should parse zero", () => {
		const bytes = u64ToLeBytes(0n);
		expect(parseBcsU64(bytes)).toBe(0n);
	});

	it("should parse small value", () => {
		const bytes = u64ToLeBytes(42n);
		expect(parseBcsU64(bytes)).toBe(42n);
	});

	it("should parse large value (1e9)", () => {
		const value = 1_000_000_000n;
		const bytes = u64ToLeBytes(value);
		expect(parseBcsU64(bytes)).toBe(value);
	});

	it("should parse max u64", () => {
		const value = 18_446_744_073_709_551_615n;
		const bytes = u64ToLeBytes(value);
		expect(parseBcsU64(bytes)).toBe(value);
	});

	it("should throw on insufficient bytes", () => {
		expect(() => parseBcsU64([1, 2, 3])).toThrow("insufficient bytes");
	});
});

describe("parseBcsVecU64", () => {
	it("should parse empty vector", () => {
		const bytes = vecU64ToBytes([]);
		expect(parseBcsVecU64(bytes)).toEqual([]);
	});

	it("should parse single element", () => {
		const values = [1_000_000_000n];
		const bytes = vecU64ToBytes(values);
		expect(parseBcsVecU64(bytes)).toEqual(values);
	});

	it("should parse multiple elements", () => {
		const values = [100n, 200n, 300n];
		const bytes = vecU64ToBytes(values);
		expect(parseBcsVecU64(bytes)).toEqual(values);
	});

	it("should return empty for empty bytes", () => {
		expect(parseBcsVecU64([])).toEqual([]);
	});
});

describe("fetchMidPrice", () => {
	it("should fetch and parse mid price", async () => {
		const expectedPrice = 5_000_000_000n; // 5.0
		const mockClient = createMockSuiClient({
			devInspectTransactionBlock: vi
				.fn()
				.mockResolvedValue(createMockMidPriceResponse(expectedPrice)),
		});

		const result = await fetchMidPrice(
			mockClient as unknown as SuiClient,
			MOCK_POOL_ID,
			MOCK_PACKAGE_ID,
		);

		expect(result).toBe(expectedPrice);
		expect(mockClient.devInspectTransactionBlock).toHaveBeenCalledOnce();
	});

	it("should throw on devInspect failure", async () => {
		const mockClient = createMockSuiClient({
			devInspectTransactionBlock: vi
				.fn()
				.mockResolvedValue(createDevInspectFailure("pool not found")),
		});

		await expect(
			fetchMidPrice(mockClient as unknown as SuiClient, MOCK_POOL_ID, MOCK_PACKAGE_ID),
		).rejects.toThrow("devInspect failed");
	});
});

describe("fetchDeepBookPrice", () => {
	it("should return a complete PriceFeed", async () => {
		const midPrice = 5_000_000_000n;
		const bestBid = 4_999_000_000n;
		const bestAsk = 5_001_000_000n;

		const mockResponder = createMockDeepBookResponses(midPrice, bestBid, bestAsk);
		const mockClient = createMockSuiClient({
			devInspectTransactionBlock: vi.fn().mockImplementation(mockResponder),
		});

		const result = await fetchDeepBookPrice(
			mockClient as unknown as SuiClient,
			MOCK_POOL_ID,
			MOCK_PACKAGE_ID,
			MOCK_BASE,
			MOCK_QUOTE,
		);

		expect(result.source).toBe("deepbook");
		expect(result.baseAsset).toBe(MOCK_BASE);
		expect(result.quoteAsset).toBe(MOCK_QUOTE);
		expect(result.midPrice).toBe(midPrice);
		expect(result.bidPrice).toBe(bestBid);
		expect(result.askPrice).toBe(bestAsk);
		expect(result.timestamp).toBeGreaterThan(0);
	});

	it("should throw ArbError on RPC failure", async () => {
		const mockClient = createMockSuiClient({
			devInspectTransactionBlock: vi.fn().mockRejectedValue(new Error("network error")),
		});

		await expect(
			fetchDeepBookPrice(
				mockClient as unknown as SuiClient,
				MOCK_POOL_ID,
				MOCK_PACKAGE_ID,
				MOCK_BASE,
				MOCK_QUOTE,
			),
		).rejects.toThrow("Failed to fetch DeepBook price");
	});
});
