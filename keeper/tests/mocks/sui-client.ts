/**
 * Mock SuiClient for testing.
 */

import { vi } from "vitest";

export interface MockDevInspectResult {
	effects: {
		status: { status: string; error?: string };
	};
	results?: Array<{
		returnValues: Array<[number[], string]>;
	}>;
}

export interface MockTransactionResult {
	digest: string;
	effects: {
		status: { status: string; error?: string };
		gasUsed: {
			computationCost: string;
			storageCost: string;
			storageRebate: string;
		};
	};
	events?: Array<{
		type: string;
		parsedJson?: Record<string, unknown>;
	}>;
}

export interface MockSuiClient {
	getObject: ReturnType<typeof vi.fn>;
	devInspectTransactionBlock: ReturnType<typeof vi.fn>;
	signAndExecuteTransaction: ReturnType<typeof vi.fn>;
	dryRunTransactionBlock: ReturnType<typeof vi.fn>;
	subscribeEvent: ReturnType<typeof vi.fn>;
	getReferenceGasPrice: ReturnType<typeof vi.fn>;
}

export function createMockSuiClient(overrides?: Partial<MockSuiClient>): MockSuiClient {
	return {
		getObject: overrides?.getObject ?? vi.fn(),
		devInspectTransactionBlock: overrides?.devInspectTransactionBlock ?? vi.fn(),
		signAndExecuteTransaction: overrides?.signAndExecuteTransaction ?? vi.fn(),
		dryRunTransactionBlock: overrides?.dryRunTransactionBlock ?? vi.fn(),
		subscribeEvent: overrides?.subscribeEvent ?? vi.fn().mockResolvedValue(() => {}),
		getReferenceGasPrice: overrides?.getReferenceGasPrice ?? vi.fn().mockResolvedValue("1000"),
	};
}

/**
 * Create a successful devInspect result with u64 return values.
 */
export function createDevInspectSuccess(returnBytes: number[][]): MockDevInspectResult {
	return {
		effects: { status: { status: "success" } },
		results: [
			{
				returnValues: returnBytes.map((bytes) => [bytes, "u64"]),
			},
		],
	};
}

/**
 * Create a failed devInspect result.
 */
export function createDevInspectFailure(error: string): MockDevInspectResult {
	return {
		effects: { status: { status: "failure", error } },
	};
}

/**
 * Create a successful transaction result.
 */
export function createTransactionSuccess(digest: string, profit?: bigint): MockTransactionResult {
	const events: MockTransactionResult["events"] =
		profit !== undefined
			? [
					{
						type: "0x123::events::TradeExecuted",
						parsedJson: { profit: profit.toString() },
					},
				]
			: [];

	return {
		digest,
		effects: {
			status: { status: "success" },
			gasUsed: {
				computationCost: "5000000",
				storageCost: "2000000",
				storageRebate: "1000000",
			},
		},
		events,
	};
}

/**
 * Create a failed transaction result.
 */
export function createTransactionFailure(digest: string, error: string): MockTransactionResult {
	return {
		digest,
		effects: {
			status: { status: "failure", error },
			gasUsed: {
				computationCost: "3000000",
				storageCost: "1000000",
				storageRebate: "500000",
			},
		},
		events: [],
	};
}
