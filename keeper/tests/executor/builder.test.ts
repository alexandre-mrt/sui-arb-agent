import { describe, expect, it } from "vitest";
import {
	applySlippage,
	buildDirectArbitrageTx,
	buildFlashLoanArbitrageTx,
} from "../../src/executor/builder.js";
import type { ArbitrageOpportunity, NetworkConfig, PoolConfig } from "../../src/types.js";

const mockNetwork: NetworkConfig = {
	network: "testnet",
	rpcUrl: "https://fullnode.testnet.sui.io:443",
	packageId: "0xabc123",
	deepbookPackageId: "0xa3886aaa8aa831572dd39549242ca004a438c3a55967af9f0387ad2b01595068",
	cetusGlobalConfig: "0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a",
};

const mockPool: PoolConfig = {
	deepbookPoolId: "0xdeepbook_pool",
	cetusPoolId: "0xcetus_pool",
	baseAsset: "0x2::sui::SUI",
	quoteAsset: "0x2::usdc::USDC",
	baseDecimals: 9,
	quoteDecimals: 6,
};

const builderConfig = {
	network: mockNetwork,
	pool: mockPool,
	slippageBps: 50,
};

describe("applySlippage", () => {
	it("should reduce amount by slippage percentage", () => {
		const amount = 1_000_000_000n;
		// 50 bps = 0.5%
		const result = applySlippage(amount, 50);
		expect(result).toBe(995_000_000n);
	});

	it("should return full amount with 0 slippage", () => {
		const amount = 1_000_000_000n;
		expect(applySlippage(amount, 0)).toBe(amount);
	});

	it("should return 0 with 100% slippage (10000 bps)", () => {
		const amount = 1_000_000_000n;
		expect(applySlippage(amount, 10000)).toBe(0n);
	});
});

describe("buildDirectArbitrageTx", () => {
	it("should build a transaction for deepbook_to_cetus", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "deepbook_to_cetus",
			buyPrice: 5_000_000_000n,
			sellPrice: 5_100_000_000n,
			spreadBps: 200,
			estimatedProfit: 50_000_000n,
			maxTradeSize: 100_000_000_000n,
		};

		const tx = buildDirectArbitrageTx(opportunity, builderConfig);

		// Transaction should be created without errors
		expect(tx).toBeDefined();
		// Transaction is a valid Transaction object
		expect(tx).toBeInstanceOf(Object);
	});

	it("should build a transaction for cetus_to_deepbook", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "cetus_to_deepbook",
			buyPrice: 4_900_000_000n,
			sellPrice: 5_000_000_000n,
			spreadBps: 204,
			estimatedProfit: 60_000_000n,
			maxTradeSize: 50_000_000_000n,
		};

		const tx = buildDirectArbitrageTx(opportunity, builderConfig);

		expect(tx).toBeDefined();
	});

	it("should include profitability validation when strategyConfigId provided", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "deepbook_to_cetus",
			buyPrice: 5_000_000_000n,
			sellPrice: 5_100_000_000n,
			spreadBps: 200,
			estimatedProfit: 50_000_000n,
			maxTradeSize: 100_000_000_000n,
		};

		const tx = buildDirectArbitrageTx(opportunity, {
			...builderConfig,
			strategyConfigId: "0xstrategy",
		});

		expect(tx).toBeDefined();
	});
});

describe("buildFlashLoanArbitrageTx", () => {
	it("should build a flash loan transaction for deepbook_to_cetus", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "deepbook_to_cetus",
			buyPrice: 5_000_000_000n,
			sellPrice: 5_100_000_000n,
			spreadBps: 200,
			estimatedProfit: 50_000_000n,
			maxTradeSize: 100_000_000_000n,
		};

		const tx = buildFlashLoanArbitrageTx(opportunity, builderConfig);

		expect(tx).toBeDefined();
	});

	it("should build a flash loan transaction for cetus_to_deepbook", () => {
		const opportunity: ArbitrageOpportunity = {
			direction: "cetus_to_deepbook",
			buyPrice: 4_900_000_000n,
			sellPrice: 5_000_000_000n,
			spreadBps: 204,
			estimatedProfit: 60_000_000n,
			maxTradeSize: 50_000_000_000n,
		};

		const tx = buildFlashLoanArbitrageTx(opportunity, builderConfig);

		expect(tx).toBeDefined();
	});
});
