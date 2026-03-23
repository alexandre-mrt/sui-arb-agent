/**
 * Cetus CLMM price feed.
 * Reads pool object to extract sqrt_price and converts to human-readable price.
 */

import type { SuiClient } from "@mysten/sui/client";
import { PRICE_SCALE } from "../config.js";
import { ArbError, type PriceFeed } from "../types.js";

// Cetus uses X64 fixed-point for sqrt prices (2^64 scaling)
const X64 = 1n << 64n;

/**
 * Fetch current price from a Cetus CLMM pool.
 */
export async function fetchCetusPrice(
	client: SuiClient,
	poolId: string,
	baseAsset: string,
	quoteAsset: string,
	baseDecimals: number,
	quoteDecimals: number,
): Promise<PriceFeed> {
	const timestamp = Date.now();

	try {
		const poolObject = await client.getObject({
			id: poolId,
			options: { showContent: true },
		});

		if (!poolObject.data?.content) {
			throw new ArbError(`Cetus pool not found: ${poolId}`, "CETUS_POOL_NOT_FOUND");
		}

		const content = poolObject.data.content;
		if (content.dataType !== "moveObject") {
			throw new ArbError("Unexpected pool data type", "CETUS_PARSE_ERROR");
		}

		const fields = content.fields as Record<string, unknown>;
		const sqrtPriceRaw = extractSqrtPrice(fields);
		const midPrice = sqrtPriceToPrice(sqrtPriceRaw, baseDecimals, quoteDecimals);

		// Approximate bid/ask from mid price with a small spread
		// Cetus AMM does not have a discrete order book
		const estimatedSpread = midPrice / 1000n; // ~0.1% spread approximation
		const bidPrice = midPrice - estimatedSpread;
		const askPrice = midPrice + estimatedSpread;

		return {
			source: "cetus",
			baseAsset,
			quoteAsset,
			bidPrice,
			askPrice,
			midPrice,
			timestamp,
		};
	} catch (error) {
		if (error instanceof ArbError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		throw new ArbError(`Failed to fetch Cetus price: ${message}`, "CETUS_FETCH_ERROR");
	}
}

/**
 * Extract sqrt_price from Cetus pool fields.
 * Navigates nested object structure.
 */
export function extractSqrtPrice(fields: Record<string, unknown>): bigint {
	const raw = fields.current_sqrt_price;

	if (!raw) {
		throw new ArbError("Could not extract current_sqrt_price from pool", "CETUS_PARSE_ERROR");
	}

	// Flat layout: current_sqrt_price is a string directly
	if (typeof raw === "string") {
		return BigInt(raw);
	}

	// Nested layout: current_sqrt_price is an object with fields.value
	if (typeof raw === "object" && raw !== null) {
		const nested = raw as Record<string, unknown>;
		const innerFields = nested.fields as Record<string, string> | undefined;
		if (innerFields?.value) {
			return BigInt(innerFields.value);
		}
	}

	throw new ArbError("Could not extract current_sqrt_price from pool", "CETUS_PARSE_ERROR");
}

/**
 * Convert Cetus sqrt_price (X64 fixed-point) to a price scaled by PRICE_SCALE (1e9).
 *
 * Formula:
 *   real_price = (sqrt_price / 2^64)^2 * 10^(decimalsA - decimalsB)
 *   scaled_price = real_price * PRICE_SCALE
 *
 * To avoid floating point:
 *   scaled = sqrt_price^2 * PRICE_SCALE * 10^(decimalsA - decimalsB) / 2^128
 */
export function sqrtPriceToPrice(
	sqrtPriceX64: bigint,
	decimalsA: number,
	decimalsB: number,
): bigint {
	if (sqrtPriceX64 === 0n) return 0n;

	const sqrtPriceSquared = sqrtPriceX64 * sqrtPriceX64;
	const decimalDiff = decimalsA - decimalsB;

	// Compute 10^|decimalDiff|
	const decimalScale = decimalDiff >= 0 ? 10n ** BigInt(decimalDiff) : 1n;
	const decimalDivisor = decimalDiff < 0 ? 10n ** BigInt(-decimalDiff) : 1n;

	// price_scaled = sqrtPrice^2 * PRICE_SCALE * decimalScale / (2^128 * decimalDivisor)
	const x128 = X64 * X64;
	const numerator = sqrtPriceSquared * PRICE_SCALE * decimalScale;
	const price = numerator / (x128 * decimalDivisor);

	return price;
}

/**
 * Convert a human-readable price (scaled by PRICE_SCALE) back to Cetus sqrtPriceX64.
 * Useful for creating test mocks.
 *
 * sqrtPriceX64 = sqrt(price / PRICE_SCALE / 10^(decimalsA - decimalsB)) * 2^64
 */
export function priceToSqrtPriceX64(
	priceScaled: bigint,
	decimalsA: number,
	decimalsB: number,
): bigint {
	if (priceScaled === 0n) return 0n;

	const decimalDiff = decimalsA - decimalsB;
	const x128 = X64 * X64;

	const decimalScale = decimalDiff >= 0 ? 10n ** BigInt(decimalDiff) : 1n;
	const decimalDivisor = decimalDiff < 0 ? 10n ** BigInt(-decimalDiff) : 1n;

	// Reverse: sqrtPrice^2 = price * x128 * decimalDivisor / (PRICE_SCALE * decimalScale)
	const sqrtPriceSquared = (priceScaled * x128 * decimalDivisor) / (PRICE_SCALE * decimalScale);

	return bigIntSqrt(sqrtPriceSquared);
}

/**
 * Integer square root using Newton's method.
 */
export function bigIntSqrt(value: bigint): bigint {
	if (value < 0n) throw new ArbError("sqrt of negative bigint", "MATH_ERROR");
	if (value === 0n) return 0n;
	if (value === 1n) return 1n;

	let x = value;
	let y = (x + 1n) / 2n;
	while (y < x) {
		x = y;
		y = (x + value / x) / 2n;
	}
	return x;
}
