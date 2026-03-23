/**
 * Environment configuration and constants.
 * All values loaded from process.env with typed defaults.
 */

import type { NetworkConfig, PoolConfig, StrategyConfig } from "./types.js";

// Price scaling constants
export const PRICE_SCALE = 1_000_000_000n;
export const BPS_SCALE = 10_000;

// SUI decimals
export const SUI_DECIMALS = 9;

// Clock object ID (shared across all Sui networks)
export const CLOCK_OBJECT_ID = "0x6";

// DeepBook package IDs
const DEEPBOOK_PACKAGES = {
	testnet: "0xa3886aaa8aa831572dd39549242ca004a438c3a55967af9f0387ad2b01595068",
	mainnet: "0xb29d83c26cdd2a64959263abbcfc4a6937f0c9fccaf98580ca56faded65be244",
	devnet: "0xa3886aaa8aa831572dd39549242ca004a438c3a55967af9f0387ad2b01595068",
} as const;

// Cetus global config IDs
const CETUS_GLOBAL_CONFIGS = {
	testnet: "0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a",
	mainnet: "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f",
	devnet: "0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a",
} as const;

// Default strategy parameters
const DEFAULT_MIN_SPREAD_BPS = 30;
const DEFAULT_MAX_TRADE_SIZE_SUI = 100_000_000_000n; // 100 SUI
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_SLIPPAGE_BPS = 50;

function requireEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function optionalEnv(key: string, fallback: string): string {
	return process.env[key] ?? fallback;
}

export function loadNetworkConfig(): NetworkConfig {
	const network = optionalEnv("SUI_NETWORK", "testnet") as NetworkConfig["network"];
	const rpcUrl = optionalEnv(
		"SUI_RPC_URL",
		network === "mainnet"
			? "https://fullnode.mainnet.sui.io:443"
			: network === "testnet"
				? "https://fullnode.testnet.sui.io:443"
				: "https://fullnode.devnet.sui.io:443",
	);

	return {
		network,
		rpcUrl,
		packageId: requireEnv("PACKAGE_ID"),
		deepbookPackageId: DEEPBOOK_PACKAGES[network],
		cetusGlobalConfig: CETUS_GLOBAL_CONFIGS[network],
	};
}

export function loadPoolConfig(): PoolConfig {
	return {
		deepbookPoolId: requireEnv("DEEPBOOK_POOL_ID"),
		cetusPoolId: requireEnv("CETUS_POOL_ID"),
		baseAsset: optionalEnv("BASE_ASSET", "0x2::sui::SUI"),
		quoteAsset: optionalEnv("QUOTE_ASSET", "0x2::usdc::USDC"),
		baseDecimals: Number.parseInt(optionalEnv("BASE_DECIMALS", "9"), 10),
		quoteDecimals: Number.parseInt(optionalEnv("QUOTE_DECIMALS", "6"), 10),
	};
}

export function loadStrategyConfig(): StrategyConfig {
	return {
		minSpreadBps: Number.parseInt(
			optionalEnv("MIN_SPREAD_BPS", String(DEFAULT_MIN_SPREAD_BPS)),
			10,
		),
		maxTradeSizeSui: BigInt(optionalEnv("MAX_TRADE_SIZE_SUI", String(DEFAULT_MAX_TRADE_SIZE_SUI))),
		pollIntervalMs: Number.parseInt(
			optionalEnv("POLL_INTERVAL_MS", String(DEFAULT_POLL_INTERVAL_MS)),
			10,
		),
		slippageBps: Number.parseInt(optionalEnv("SLIPPAGE_BPS", String(DEFAULT_SLIPPAGE_BPS)), 10),
	};
}
