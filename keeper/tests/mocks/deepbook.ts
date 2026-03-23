/**
 * Mock DeepBook v3 RPC responses for testing.
 */

import { type MockDevInspectResult, createDevInspectSuccess } from "./sui-client.js";

/**
 * Encode a u64 value as little-endian bytes (BCS format).
 */
export function u64ToLeBytes(value: bigint): number[] {
	const bytes: number[] = [];
	let remaining = value;
	for (let i = 0; i < 8; i++) {
		bytes.push(Number(remaining & 0xffn));
		remaining >>= 8n;
	}
	return bytes;
}

/**
 * Encode a vector<u64> as BCS bytes (ULEB128 length + u64 elements).
 */
export function vecU64ToBytes(values: bigint[]): number[] {
	const bytes: number[] = [];
	// ULEB128 encode length
	let length = values.length;
	while (length >= 0x80) {
		bytes.push((length & 0x7f) | 0x80);
		length >>= 7;
	}
	bytes.push(length & 0x7f);
	// Encode each u64
	for (const val of values) {
		bytes.push(...u64ToLeBytes(val));
	}
	return bytes;
}

/**
 * Create a mock devInspect response for mid_price.
 */
export function createMockMidPriceResponse(midPrice: bigint): MockDevInspectResult {
	return createDevInspectSuccess([u64ToLeBytes(midPrice)]);
}

/**
 * Create a mock devInspect response for get_level2_ticks_from_mid.
 * Returns bid_prices, bid_quantities, ask_prices, ask_quantities.
 */
export function createMockLevel2Response(
	bestBid: bigint,
	bestAsk: bigint,
	depth = 3,
): MockDevInspectResult {
	// Create price ladder around bid/ask
	const bidPrices: bigint[] = [];
	const bidQuantities: bigint[] = [];
	const askPrices: bigint[] = [];
	const askQuantities: bigint[] = [];

	const step = 100_000n; // 0.0001 in 1e9 scale
	const baseQuantity = 1_000_000_000n; // 1 SUI

	for (let i = 0; i < depth; i++) {
		bidPrices.push(bestBid - step * BigInt(i));
		bidQuantities.push(baseQuantity * BigInt(i + 1));
		askPrices.push(bestAsk + step * BigInt(i));
		askQuantities.push(baseQuantity * BigInt(i + 1));
	}

	return {
		effects: { status: { status: "success" } },
		results: [
			{
				returnValues: [
					[vecU64ToBytes(bidPrices), "vector<u64>"],
					[vecU64ToBytes(bidQuantities), "vector<u64>"],
					[vecU64ToBytes(askPrices), "vector<u64>"],
					[vecU64ToBytes(askQuantities), "vector<u64>"],
				],
			},
		],
	};
}

/**
 * Create a combined mock for both mid_price and level2 calls.
 * Returns a function that responds differently based on call order.
 */
export function createMockDeepBookResponses(midPrice: bigint, bestBid: bigint, bestAsk: bigint) {
	let callCount = 0;
	return () => {
		callCount++;
		if (callCount === 1) {
			return Promise.resolve(createMockMidPriceResponse(midPrice));
		}
		return Promise.resolve(createMockLevel2Response(bestBid, bestAsk));
	};
}
