/// Mock DEX pool for unit testing.
#[test_only]
module sui_arb_agent::mock_pool;

use sui::coin::{Self, Coin};
use sui::sui::SUI;

// ─── Mock pool ─────────────────────────────────────────────────

/// A mock pool with a configurable price for testing.
public struct MockPool has key, store {
    id: UID,
    price: u64, // scaled by 1e9
}

// ─── Constants ─────────────────────────────────────────────────
const PRICE_SCALE: u64 = 1_000_000_000; // 1e9

// ─── Functions ─────────────────────────────────────────────────

/// Create a new mock pool with the given price.
public fun create_mock_pool(price: u64, ctx: &mut TxContext): MockPool {
    MockPool {
        id: object::new(ctx),
        price,
    }
}

/// Set a new price on the mock pool.
public fun set_price(pool: &mut MockPool, new_price: u64) {
    pool.price = new_price;
}

/// Get the current price of the mock pool.
public fun get_price(pool: &MockPool): u64 {
    pool.price
}

/// Simulate a swap: given coin_in amount, return coin_out amount based on pool price.
/// For simplicity, output_amount = input_amount * PRICE_SCALE / price (buying)
/// or input_amount * price / PRICE_SCALE (selling).
/// This just returns a SUI coin with the computed output value for testing.
public fun mock_swap_buy(
    pool: &MockPool,
    coin_in_value: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    // Buy: spending `coin_in_value` at `pool.price` to get base asset
    // output = input * PRICE_SCALE / price
    let output = ((coin_in_value as u128) * (PRICE_SCALE as u128)
        / (pool.price as u128) as u64);
    coin::mint_for_testing<SUI>(output, ctx)
}

public fun mock_swap_sell(
    pool: &MockPool,
    coin_in_value: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    // Sell: selling `coin_in_value` of base asset at `pool.price`
    // output = input * price / PRICE_SCALE
    let output = ((coin_in_value as u128) * (pool.price as u128)
        / (PRICE_SCALE as u128) as u64);
    coin::mint_for_testing<SUI>(output, ctx)
}

/// Destroy the mock pool (cleanup in tests).
public fun destroy_mock_pool(pool: MockPool) {
    let MockPool { id, .. } = pool;
    object::delete(id);
}
