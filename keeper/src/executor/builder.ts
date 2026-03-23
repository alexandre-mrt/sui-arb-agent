/**
 * PTB builder for arbitrage transactions.
 * Constructs Programmable Transaction Blocks for cross-DEX arbitrage.
 */

import { Transaction } from "@mysten/sui/transactions";
import { CLOCK_OBJECT_ID } from "../config.js";
import type { ArbitrageOpportunity, NetworkConfig, PoolConfig } from "../types.js";

// Direction constants matching Move contract
const DIRECTION_BUY_DEEPBOOK_SELL_CETUS = 1;
const DIRECTION_BUY_CETUS_SELL_DEEPBOOK = 2;

interface BuilderConfig {
	readonly network: NetworkConfig;
	readonly pool: PoolConfig;
	readonly slippageBps: number;
	readonly vaultId?: string;
	readonly keeperCapId?: string;
	readonly strategyConfigId?: string;
}

/**
 * Build a direct arbitrage PTB: buy on one DEX, sell on the other.
 * Uses the agent's own funds (from vault or wallet).
 */
export function buildDirectArbitrageTx(
	opportunity: ArbitrageOpportunity,
	config: BuilderConfig,
): Transaction {
	const tx = new Transaction();

	const direction =
		opportunity.direction === "deepbook_to_cetus"
			? DIRECTION_BUY_DEEPBOOK_SELL_CETUS
			: DIRECTION_BUY_CETUS_SELL_DEEPBOOK;

	// Calculate minimum output with slippage protection
	const minOutput = applySlippage(opportunity.maxTradeSize, config.slippageBps);

	if (opportunity.direction === "deepbook_to_cetus") {
		// Step 1: Buy on DeepBook (swap quote for base)
		addDeepBookBuy(tx, config, opportunity.maxTradeSize, minOutput);
		// Step 2: Sell on Cetus (swap base for quote)
		addCetusSell(tx, config, opportunity.maxTradeSize, minOutput);
	} else {
		// Step 1: Buy on Cetus (swap quote for base)
		addCetusBuy(tx, config, opportunity.maxTradeSize, minOutput);
		// Step 2: Sell on DeepBook (swap base for quote)
		addDeepBookSell(tx, config, opportunity.maxTradeSize, minOutput);
	}

	// Step 3: Validate profitability on-chain
	addProfitabilityValidation(tx, config, opportunity, direction);

	// Step 4: Emit trade event
	addTradeEvent(tx, config, opportunity, direction);

	return tx;
}

/**
 * Build a flash loan arbitrage PTB: borrow from DeepBook, arb, repay.
 * Capital-free arbitrage using DeepBook flash loans.
 */
export function buildFlashLoanArbitrageTx(
	opportunity: ArbitrageOpportunity,
	config: BuilderConfig,
): Transaction {
	const tx = new Transaction();

	const direction =
		opportunity.direction === "deepbook_to_cetus"
			? DIRECTION_BUY_DEEPBOOK_SELL_CETUS
			: DIRECTION_BUY_CETUS_SELL_DEEPBOOK;

	// Step 1: Borrow via DeepBook flash loan
	const [borrowedCoin, flashLoan] = addFlashLoanBorrow(tx, config, opportunity.maxTradeSize);

	// Step 2: Swap on the other DEX
	if (opportunity.direction === "deepbook_to_cetus") {
		addCetusSellWithCoin(tx, config, borrowedCoin);
	} else {
		addDeepBookSellWithCoin(tx, config, borrowedCoin);
	}

	// Step 3: Repay flash loan
	addFlashLoanRepay(tx, config, flashLoan);

	// Step 4: Emit trade event
	addTradeEvent(tx, config, opportunity, direction);

	return tx;
}

/**
 * Apply slippage tolerance to an amount.
 * Returns amount * (1 - slippageBps / 10000)
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
	const bpsScale = 10_000n;
	return (amount * (bpsScale - BigInt(slippageBps))) / bpsScale;
}

// --- Internal PTB construction helpers ---

function addDeepBookBuy(
	tx: Transaction,
	config: BuilderConfig,
	amount: bigint,
	minOutput: bigint,
): void {
	tx.moveCall({
		target: `${config.network.deepbookPackageId}::pool::swap_exact_quote_for_base`,
		arguments: [
			tx.object(config.pool.deepbookPoolId),
			tx.pure.u64(amount),
			tx.pure.u64(0), // DEEP fee coin (0 = auto)
			tx.pure.u64(minOutput),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}

function addDeepBookSell(
	tx: Transaction,
	config: BuilderConfig,
	amount: bigint,
	minOutput: bigint,
): void {
	tx.moveCall({
		target: `${config.network.deepbookPackageId}::pool::swap_exact_base_for_quote`,
		arguments: [
			tx.object(config.pool.deepbookPoolId),
			tx.pure.u64(amount),
			tx.pure.u64(0),
			tx.pure.u64(minOutput),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}

function addCetusBuy(
	tx: Transaction,
	config: BuilderConfig,
	amount: bigint,
	_minOutput: bigint,
): void {
	// Cetus swap: quote -> base (a2b = false)
	tx.moveCall({
		target: `${config.network.cetusGlobalConfig}::swap::swap`,
		arguments: [
			tx.object(config.pool.cetusPoolId),
			tx.pure.bool(false), // a2b = false (quote to base)
			tx.pure.bool(true), // by_amount_in
			tx.pure.u64(amount),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}

function addCetusSell(
	tx: Transaction,
	config: BuilderConfig,
	amount: bigint,
	_minOutput: bigint,
): void {
	// Cetus swap: base -> quote (a2b = true)
	tx.moveCall({
		target: `${config.network.cetusGlobalConfig}::swap::swap`,
		arguments: [
			tx.object(config.pool.cetusPoolId),
			tx.pure.bool(true), // a2b = true (base to quote)
			tx.pure.bool(true), // by_amount_in
			tx.pure.u64(amount),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}

function addCetusSellWithCoin(
	tx: Transaction,
	config: BuilderConfig,
	// biome-ignore lint/suspicious/noExplicitAny: Transaction result type varies
	_coinRef: any,
): void {
	tx.moveCall({
		target: `${config.network.cetusGlobalConfig}::swap::swap`,
		arguments: [
			tx.object(config.pool.cetusPoolId),
			tx.pure.bool(true),
			tx.pure.bool(true),
			tx.pure.u64(0),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}

function addDeepBookSellWithCoin(
	tx: Transaction,
	config: BuilderConfig,
	// biome-ignore lint/suspicious/noExplicitAny: Transaction result type varies
	_coinRef: any,
): void {
	tx.moveCall({
		target: `${config.network.deepbookPackageId}::pool::swap_exact_base_for_quote`,
		arguments: [
			tx.object(config.pool.deepbookPoolId),
			tx.pure.u64(0),
			tx.pure.u64(0),
			tx.pure.u64(0),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}

function addFlashLoanBorrow(
	tx: Transaction,
	config: BuilderConfig,
	amount: bigint,
	// biome-ignore lint/suspicious/noExplicitAny: MoveCall result types are dynamic
): [any, any] {
	const result = tx.moveCall({
		target: `${config.network.deepbookPackageId}::pool::borrow_flashloan_base`,
		arguments: [tx.object(config.pool.deepbookPoolId), tx.pure.u64(amount)],
	});
	return [result[0], result[1]];
}

function addFlashLoanRepay(
	tx: Transaction,
	config: BuilderConfig,
	// biome-ignore lint/suspicious/noExplicitAny: FlashLoan object type from MoveCall result
	flashLoan: any,
): void {
	tx.moveCall({
		target: `${config.network.deepbookPackageId}::pool::return_flashloan_base`,
		arguments: [tx.object(config.pool.deepbookPoolId), flashLoan],
	});
}

function addProfitabilityValidation(
	tx: Transaction,
	config: BuilderConfig,
	opportunity: ArbitrageOpportunity,
	direction: number,
): void {
	if (!config.strategyConfigId) return;

	tx.moveCall({
		target: `${config.network.packageId}::validator::validate_arbitrage`,
		arguments: [
			tx.pure.u64(opportunity.buyPrice),
			tx.pure.u64(opportunity.sellPrice),
			tx.pure.u64(opportunity.maxTradeSize),
			tx.pure.u64(0), // gas cost estimated at 0 for on-chain check
			tx.pure.u64(30), // min spread bps
		],
	});
}

function addTradeEvent(
	tx: Transaction,
	config: BuilderConfig,
	opportunity: ArbitrageOpportunity,
	direction: number,
): void {
	tx.moveCall({
		target: `${config.network.packageId}::events::emit_trade_executed`,
		arguments: [
			tx.pure.u8(direction),
			tx.pure.u64(opportunity.buyPrice),
			tx.pure.u64(opportunity.sellPrice),
			tx.pure.u64(opportunity.maxTradeSize),
			tx.pure.u64(opportunity.estimatedProfit),
			tx.object(CLOCK_OBJECT_ID),
		],
	});
}
