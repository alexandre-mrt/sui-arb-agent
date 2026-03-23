/**
 * Mock Cetus CLMM pool data for testing.
 */

import { priceToSqrtPriceX64 } from "../../src/prices/cetus.js";

/**
 * Create a mock Cetus pool object response from getObject.
 */
export function createMockCetusPool(
	sqrtPrice: bigint,
	tickIndex = 0,
): {
	data: {
		content: {
			dataType: "moveObject";
			fields: Record<string, unknown>;
		};
	};
} {
	return {
		data: {
			content: {
				dataType: "moveObject",
				fields: {
					current_sqrt_price: sqrtPrice.toString(),
					current_tick_index: tickIndex,
					fee_rate: "2500",
					liquidity: "1000000000000",
				},
			},
		},
	};
}

/**
 * Create a mock Cetus pool from a human-readable price.
 * Price should be scaled by PRICE_SCALE (1e9).
 */
export function createMockCetusPoolFromPrice(priceScaled: bigint, decimalsA = 9, decimalsB = 6) {
	const sqrtPrice = priceToSqrtPriceX64(priceScaled, decimalsA, decimalsB);
	return createMockCetusPool(sqrtPrice);
}

/**
 * Create a mock pool object that is not found (null content).
 */
export function createMockCetusPoolNotFound() {
	return {
		data: null,
	};
}

/**
 * Create a mock pool with nested field structure
 * (some Cetus pool versions use nested objects).
 */
export function createMockCetusPoolNested(sqrtPrice: bigint) {
	return {
		data: {
			content: {
				dataType: "moveObject" as const,
				fields: {
					current_sqrt_price: {
						fields: {
							value: sqrtPrice.toString(),
						},
					},
					current_tick_index: 0,
				},
			},
		},
	};
}
