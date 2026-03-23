/**
 * Shared type definitions for the Sui arbitrage keeper.
 * All prices are bigint scaled by 1e9 (PRICE_SCALE).
 */

export interface PriceFeed {
	readonly source: "deepbook" | "cetus";
	readonly baseAsset: string;
	readonly quoteAsset: string;
	readonly bidPrice: bigint;
	readonly askPrice: bigint;
	readonly midPrice: bigint;
	readonly timestamp: number;
}

export interface ArbitrageOpportunity {
	readonly direction: "deepbook_to_cetus" | "cetus_to_deepbook";
	readonly buyPrice: bigint;
	readonly sellPrice: bigint;
	readonly spreadBps: number;
	readonly estimatedProfit: bigint;
	readonly maxTradeSize: bigint;
}

export interface TradeResult {
	readonly success: boolean;
	readonly digest?: string;
	readonly profit?: bigint;
	readonly gasUsed?: bigint;
	readonly error?: string;
}

export interface StrategyConfig {
	readonly minSpreadBps: number;
	readonly maxTradeSizeSui: bigint;
	readonly pollIntervalMs: number;
	readonly slippageBps: number;
}

export interface AgentState {
	isRunning: boolean;
	totalTrades: number;
	totalProfit: bigint;
	lastCheck: number;
	lastTrade?: TradeResult;
}

export interface PoolConfig {
	readonly deepbookPoolId: string;
	readonly cetusPoolId: string;
	readonly baseAsset: string;
	readonly quoteAsset: string;
	readonly baseDecimals: number;
	readonly quoteDecimals: number;
}

export interface NetworkConfig {
	readonly network: "mainnet" | "testnet" | "devnet";
	readonly rpcUrl: string;
	readonly packageId: string;
	readonly deepbookPackageId: string;
	readonly cetusGlobalConfig: string;
}

export class ArbError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "ArbError";
	}
}
