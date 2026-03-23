/**
 * Transaction execution and result handling.
 */

import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Transaction } from "@mysten/sui/transactions";
import { ArbError, type TradeResult } from "../types.js";

/**
 * Execute an arbitrage transaction: sign, submit, and parse results.
 */
export async function executeArbitrage(
	client: SuiClient,
	signer: Ed25519Keypair,
	tx: Transaction,
): Promise<TradeResult> {
	try {
		const result = await client.signAndExecuteTransaction({
			signer,
			transaction: tx,
			options: {
				showEffects: true,
				showEvents: true,
			},
		});

		const effects = result.effects;
		if (!effects) {
			return {
				success: false,
				error: "No effects returned from transaction",
			};
		}

		const status = effects.status.status;
		const gasUsed = computeGasUsed(effects);

		if (status !== "success") {
			return {
				success: false,
				digest: result.digest,
				gasUsed,
				error: effects.status.error ?? "Transaction failed",
			};
		}

		const profit = extractProfitFromEvents(result.events ?? []);

		logTradeResult({
			success: true,
			digest: result.digest,
			profit,
			gasUsed,
		});

		return {
			success: true,
			digest: result.digest,
			profit,
			gasUsed,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			error: `Execution failed: ${message}`,
		};
	}
}

/**
 * Dry-run a transaction to check if it would succeed.
 */
export async function dryRunArbitrage(
	client: SuiClient,
	signer: Ed25519Keypair,
	tx: Transaction,
): Promise<{ success: boolean; gasEstimate: bigint; error?: string }> {
	try {
		tx.setSender(signer.toSuiAddress());
		const dryRun = await client.dryRunTransactionBlock({
			transactionBlock: await tx.build({ client }),
		});

		const status = dryRun.effects.status.status;
		const gasEstimate = computeGasUsed(dryRun.effects);

		if (status !== "success") {
			return {
				success: false,
				gasEstimate,
				error: dryRun.effects.status.error ?? "Dry run failed",
			};
		}

		return { success: true, gasEstimate };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			gasEstimate: 0n,
			error: `Dry run error: ${message}`,
		};
	}
}

/**
 * Compute total gas used from transaction effects.
 */
function computeGasUsed(effects: {
	gasUsed: {
		computationCost: string;
		storageCost: string;
		storageRebate: string;
	};
}): bigint {
	const computation = BigInt(effects.gasUsed.computationCost);
	const storage = BigInt(effects.gasUsed.storageCost);
	const rebate = BigInt(effects.gasUsed.storageRebate);
	return computation + storage - rebate;
}

/**
 * Extract profit from trade events.
 */
function extractProfitFromEvents(
	events: ReadonlyArray<{ type: string; parsedJson?: Record<string, unknown> }>,
): bigint {
	for (const event of events) {
		if (event.type.includes("::events::TradeExecuted")) {
			const profit = event.parsedJson?.profit;
			if (typeof profit === "string" || typeof profit === "number") {
				return BigInt(profit);
			}
		}
	}
	return 0n;
}

/**
 * Log trade result to console.
 */
function logTradeResult(result: TradeResult): void {
	if (result.success) {
		console.log(
			`[TRADE] Success | digest=${result.digest} | profit=${result.profit} | gas=${result.gasUsed}`,
		);
	} else {
		console.log(`[TRADE] Failed | error=${result.error}`);
	}
}
