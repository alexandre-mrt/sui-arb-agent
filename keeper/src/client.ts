/**
 * SuiClient setup and keypair management.
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { NetworkConfig } from "./types.js";

export function createSuiClient(config: NetworkConfig): SuiClient {
	return new SuiClient({ url: config.rpcUrl });
}

export function createSuiClientFromNetwork(network: "mainnet" | "testnet" | "devnet"): SuiClient {
	return new SuiClient({ url: getFullnodeUrl(network) });
}

export function loadKeypair(privateKeyBase64: string): Ed25519Keypair {
	if (!privateKeyBase64) {
		throw new Error("Private key is required");
	}
	return Ed25519Keypair.fromSecretKey(privateKeyBase64);
}

export function loadKeypairFromEnv(): Ed25519Keypair {
	const privateKey = process.env.PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("PRIVATE_KEY environment variable is required");
	}
	return loadKeypair(privateKey);
}

export async function getCurrentGasPrice(client: SuiClient): Promise<bigint> {
	const gasPrice = await client.getReferenceGasPrice();
	return BigInt(gasPrice);
}
