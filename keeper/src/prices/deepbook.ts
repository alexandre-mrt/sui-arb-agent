/**
 * DeepBook v3 price feed.
 * Uses devInspectTransactionBlock to read pool prices without gas.
 */

import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { CLOCK_OBJECT_ID, PRICE_SCALE } from "../config.js";
import { ArbError, type PriceFeed } from "../types.js";

const DEEPBOOK_POOL_MODULE = "pool";
const MID_PRICE_FUNCTION = "mid_price";
const LEVEL2_FUNCTION = "get_level2_ticks_from_mid";
const DEFAULT_TICK_DEPTH = 5;

/**
 * Fetch current price from a DeepBook v3 pool via devInspect.
 */
export async function fetchDeepBookPrice(
	client: SuiClient,
	poolId: string,
	deepbookPackageId: string,
	baseAsset: string,
	quoteAsset: string,
): Promise<PriceFeed> {
	const timestamp = Date.now();

	try {
		const midPrice = await fetchMidPrice(client, poolId, deepbookPackageId);

		const { bestBid, bestAsk } = await fetchBestBidAsk(client, poolId, deepbookPackageId);

		return {
			source: "deepbook",
			baseAsset,
			quoteAsset,
			bidPrice: bestBid,
			askPrice: bestAsk,
			midPrice,
			timestamp,
		};
	} catch (error) {
		if (error instanceof ArbError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		throw new ArbError(`Failed to fetch DeepBook price: ${message}`, "DEEPBOOK_FETCH_ERROR");
	}
}

/**
 * Fetch mid price from DeepBook pool via devInspect.
 * Returns price scaled by 1e9.
 */
export async function fetchMidPrice(
	client: SuiClient,
	poolId: string,
	deepbookPackageId: string,
): Promise<bigint> {
	const tx = new Transaction();
	tx.moveCall({
		target: `${deepbookPackageId}::${DEEPBOOK_POOL_MODULE}::${MID_PRICE_FUNCTION}`,
		arguments: [tx.object(poolId), tx.object(CLOCK_OBJECT_ID)],
	});

	const result = await client.devInspectTransactionBlock({
		transactionBlock: tx,
		sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
	});

	if (result.effects.status.status !== "success") {
		throw new ArbError(
			`devInspect failed for mid_price: ${result.effects.status.error ?? "unknown error"}`,
			"DEEPBOOK_INSPECT_ERROR",
		);
	}

	const returnValues = result.results?.[0]?.returnValues;
	if (!returnValues || returnValues.length === 0) {
		throw new ArbError("No return values from mid_price", "DEEPBOOK_PARSE_ERROR");
	}

	const bytes = returnValues[0][0];
	return parseBcsU64(bytes);
}

/**
 * Fetch best bid and ask from level2 order book data.
 */
export async function fetchBestBidAsk(
	client: SuiClient,
	poolId: string,
	deepbookPackageId: string,
): Promise<{ bestBid: bigint; bestAsk: bigint }> {
	const tx = new Transaction();
	tx.moveCall({
		target: `${deepbookPackageId}::${DEEPBOOK_POOL_MODULE}::${LEVEL2_FUNCTION}`,
		arguments: [tx.object(poolId), tx.pure.u64(DEFAULT_TICK_DEPTH), tx.object(CLOCK_OBJECT_ID)],
	});

	const result = await client.devInspectTransactionBlock({
		transactionBlock: tx,
		sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
	});

	if (result.effects.status.status !== "success") {
		throw new ArbError(
			`devInspect failed for level2: ${result.effects.status.error ?? "unknown error"}`,
			"DEEPBOOK_INSPECT_ERROR",
		);
	}

	const returnValues = result.results?.[0]?.returnValues;
	if (!returnValues || returnValues.length < 2) {
		throw new ArbError("Insufficient return values from level2", "DEEPBOOK_PARSE_ERROR");
	}

	// returnValues: [bid_prices[], bid_quantities[], ask_prices[], ask_quantities[]]
	const bidPrices = parseBcsVecU64(returnValues[0][0]);
	const askPrices = parseBcsVecU64(returnValues[2][0]);

	const bestBid = bidPrices.length > 0 ? bidPrices[0] : 0n;
	const bestAsk = askPrices.length > 0 ? askPrices[0] : 0n;

	return { bestBid, bestAsk };
}

/**
 * Parse a BCS-encoded u64 from raw bytes.
 */
export function parseBcsU64(bytes: number[]): bigint {
	if (bytes.length < 8) {
		throw new ArbError("Invalid BCS u64: insufficient bytes", "BCS_PARSE_ERROR");
	}
	let value = 0n;
	for (let i = 0; i < 8; i++) {
		value |= BigInt(bytes[i]) << BigInt(i * 8);
	}
	return value;
}

/**
 * Parse a BCS-encoded vector<u64> from raw bytes.
 * Format: [uleb128 length, then length * 8 bytes]
 */
export function parseBcsVecU64(bytes: number[]): bigint[] {
	if (bytes.length === 0) return [];

	// Read ULEB128 length
	let offset = 0;
	let length = 0;
	let shift = 0;
	for (;;) {
		if (offset >= bytes.length) {
			throw new ArbError("Invalid ULEB128 in BCS vec", "BCS_PARSE_ERROR");
		}
		const byte = bytes[offset];
		offset++;
		length |= (byte & 0x7f) << shift;
		if ((byte & 0x80) === 0) break;
		shift += 7;
	}

	const result: bigint[] = [];
	for (let i = 0; i < length; i++) {
		const u64Bytes = bytes.slice(offset, offset + 8);
		result.push(parseBcsU64(u64Bytes));
		offset += 8;
	}

	return result;
}

/**
 * Estimate trade size from DeepBook level2 liquidity.
 */
export function estimateDeepBookLiquidity(
	prices: readonly bigint[],
	quantities: readonly bigint[],
): bigint {
	let total = 0n;
	const len = Math.min(prices.length, quantities.length);
	for (let i = 0; i < len; i++) {
		total += (prices[i] * quantities[i]) / PRICE_SCALE;
	}
	return total;
}
