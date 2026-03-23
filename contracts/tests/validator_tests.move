#[test_only]
module sui_arb_agent::validator_tests;

use sui_arb_agent::validator;

// ─── Constants for test prices (scaled by 1e9) ─────────────────
const PRICE_1_00: u64 = 1_000_000_000;   // $1.00
const PRICE_1_01: u64 = 1_010_000_000;   // $1.01 (1% spread)
const PRICE_1_001: u64 = 1_001_000_000;  // $1.001 (0.1% spread)
const PRICE_1_05: u64 = 1_050_000_000;   // $1.05 (5% spread)

const AMOUNT_100: u64 = 100_000_000_000; // 100 units
const GAS_COST_LOW: u64 = 1_000_000;     // 0.001 SUI
const GAS_COST_HIGH: u64 = 500_000_000;  // 0.5 SUI

// ─── Spread calculation tests ──────────────────────────────────

#[test]
fun test_spread_1_percent() {
    // 1% spread = 100 bps
    let spread = validator::calculate_spread_bps(PRICE_1_00, PRICE_1_01);
    assert!(spread == 100); // 1.01 - 1.00 = 0.01 => 0.01/1.00 * 10000 = 100 bps
}

#[test]
fun test_spread_0_1_percent() {
    // 0.1% spread = 10 bps
    let spread = validator::calculate_spread_bps(PRICE_1_00, PRICE_1_001);
    assert!(spread == 10);
}

#[test]
fun test_spread_5_percent() {
    // 5% spread = 500 bps
    let spread = validator::calculate_spread_bps(PRICE_1_00, PRICE_1_05);
    assert!(spread == 500);
}

#[test]
fun test_spread_symmetric() {
    // Spread should be the same regardless of order
    let spread_ab = validator::calculate_spread_bps(PRICE_1_00, PRICE_1_01);
    let spread_ba = validator::calculate_spread_bps(PRICE_1_01, PRICE_1_00);
    assert!(spread_ab == spread_ba);
}

#[test]
fun test_spread_equal_prices() {
    let spread = validator::calculate_spread_bps(PRICE_1_00, PRICE_1_00);
    assert!(spread == 0);
}

#[test]
fun test_spread_zero_price() {
    let spread = validator::calculate_spread_bps(0, PRICE_1_00);
    assert!(spread == 0);

    let spread2 = validator::calculate_spread_bps(PRICE_1_00, 0);
    assert!(spread2 == 0);
}

// ─── Profit calculation tests ──────────────────────────────────

#[test]
fun test_profit_basic() {
    // Buy at 1.00, sell at 1.01, 100 units
    // Gross = (0.01e9) * 100e9 / 1e9 = 1e9 = 1 SUI
    let profit = validator::calculate_profit(PRICE_1_00, PRICE_1_01, AMOUNT_100, GAS_COST_LOW);
    // Expected: 1_000_000_000 - 1_000_000 = 999_000_000
    assert!(profit == 999_000_000);
}

#[test]
fun test_profit_unprofitable_after_gas() {
    // Small spread, high gas
    let profit = validator::calculate_profit(PRICE_1_00, PRICE_1_001, AMOUNT_100, GAS_COST_HIGH);
    // Gross = 0.001e9 * 100e9 / 1e9 = 100_000_000
    // 100_000_000 - 500_000_000 => unprofitable
    assert!(profit == 0);
}

#[test]
fun test_profit_zero_amount() {
    let profit = validator::calculate_profit(PRICE_1_00, PRICE_1_01, 0, GAS_COST_LOW);
    assert!(profit == 0);
}

#[test]
fun test_profit_sell_less_than_buy() {
    let profit = validator::calculate_profit(PRICE_1_01, PRICE_1_00, AMOUNT_100, GAS_COST_LOW);
    assert!(profit == 0);
}

#[test]
fun test_profit_equal_prices() {
    let profit = validator::calculate_profit(PRICE_1_00, PRICE_1_00, AMOUNT_100, GAS_COST_LOW);
    assert!(profit == 0);
}

// ─── Validate arbitrage tests ──────────────────────────────────

#[test]
fun test_validate_profitable_arb() {
    // 1% spread, min 30 bps, low gas
    let valid = validator::validate_arbitrage(
        PRICE_1_00, PRICE_1_01, AMOUNT_100, GAS_COST_LOW, 30,
    );
    assert!(valid == true);
}

#[test]
fun test_validate_spread_below_minimum() {
    // 0.1% spread = 10 bps, min is 30 bps
    let valid = validator::validate_arbitrage(
        PRICE_1_00, PRICE_1_001, AMOUNT_100, GAS_COST_LOW, 30,
    );
    assert!(valid == false);
}

#[test]
fun test_validate_unprofitable_after_gas() {
    // 0.1% spread = 10 bps, min is 5 bps (passes spread check)
    // But gas cost eats up the profit
    let valid = validator::validate_arbitrage(
        PRICE_1_00, PRICE_1_001, AMOUNT_100, GAS_COST_HIGH, 5,
    );
    assert!(valid == false);
}

#[test]
fun test_validate_zero_amount() {
    let valid = validator::validate_arbitrage(
        PRICE_1_00, PRICE_1_01, 0, GAS_COST_LOW, 30,
    );
    assert!(valid == false);
}

#[test]
fun test_validate_5_percent_spread() {
    // Large spread — should be profitable
    let valid = validator::validate_arbitrage(
        PRICE_1_00, PRICE_1_05, AMOUNT_100, GAS_COST_LOW, 30,
    );
    assert!(valid == true);
}

// ─── Direction tests ───────────────────────────────────────────

#[test]
fun test_direction_buy_deepbook_sell_cetus() {
    // DeepBook cheaper => buy DeepBook, sell Cetus
    let dir = validator::determine_direction(PRICE_1_00, PRICE_1_01);
    assert!(dir == validator::direction_buy_deepbook_sell_cetus());
}

#[test]
fun test_direction_buy_cetus_sell_deepbook() {
    // Cetus cheaper => buy Cetus, sell DeepBook
    let dir = validator::determine_direction(PRICE_1_01, PRICE_1_00);
    assert!(dir == validator::direction_buy_cetus_sell_deepbook());
}

#[test]
fun test_direction_equal_prices() {
    let dir = validator::determine_direction(PRICE_1_00, PRICE_1_00);
    assert!(dir == validator::direction_none());
}

#[test]
fun test_direction_zero_price() {
    let dir = validator::determine_direction(0, PRICE_1_00);
    assert!(dir == validator::direction_none());

    let dir2 = validator::determine_direction(PRICE_1_00, 0);
    assert!(dir2 == validator::direction_none());
}
