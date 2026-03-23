#[test_only]
module sui_arb_agent::integration_tests;

use sui::coin;
use sui::sui::SUI;
use sui::clock;
use sui::test_scenario;
use sui_arb_agent::vault;
use sui_arb_agent::strategy;
use sui_arb_agent::validator;
use sui_arb_agent::events;
use sui_arb_agent::mock_pool;

const ADMIN: address = @0xA;

// Prices scaled by 1e9
const DEEPBOOK_PRICE: u64 = 1_000_000_000; // $1.00
const CETUS_PRICE: u64 = 1_015_000_000;    // $1.015 (1.5% spread)
const TRADE_AMOUNT: u64 = 10_000_000_000;  // 10 units
const GAS_COST: u64 = 5_000_000;           // 0.005 SUI

#[test]
fun test_full_arb_flow() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    // 1. Create vault, strategy, caps
    let mut v = vault::create_vault_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);
    let keeper_cap = vault::create_keeper_cap_for_testing(ctx);
    let config = strategy::create_config_for_testing(ctx);
    let clk = clock::create_for_testing(ctx);

    // 2. Fund the vault
    let funds = coin::mint_for_testing<SUI>(100_000_000_000, ctx); // 100 SUI
    vault::deposit<SUI>(&mut v, funds, &admin_cap, ctx);
    assert!(vault::balance<SUI>(&v) == 100_000_000_000);

    // 3. Check strategy is active
    assert!(strategy::is_active(&config) == true);

    // 4. Determine direction
    let direction = validator::determine_direction(DEEPBOOK_PRICE, CETUS_PRICE);
    assert!(direction == validator::direction_buy_deepbook_sell_cetus());

    // 5. Validate arbitrage
    let spread = validator::calculate_spread_bps(DEEPBOOK_PRICE, CETUS_PRICE);
    assert!(spread >= strategy::min_spread_bps(&config)); // 150 bps >= 30 bps

    let is_profitable = validator::validate_arbitrage(
        DEEPBOOK_PRICE,
        CETUS_PRICE,
        TRADE_AMOUNT,
        GAS_COST,
        strategy::min_spread_bps(&config),
    );
    assert!(is_profitable == true);

    // 6. Calculate expected profit
    let profit = validator::calculate_profit(DEEPBOOK_PRICE, CETUS_PRICE, TRADE_AMOUNT, GAS_COST);
    assert!(profit > 0);

    // 7. Keeper withdraws for trade
    let trade_coin = vault::keeper_withdraw<SUI>(
        &mut v, TRADE_AMOUNT, &keeper_cap, ctx,
    );
    assert!(trade_coin.value() == TRADE_AMOUNT);

    // 8. Simulate mock swap (buy on DeepBook)
    let deepbook_pool = mock_pool::create_mock_pool(DEEPBOOK_PRICE, ctx);
    let bought = mock_pool::mock_swap_buy(&deepbook_pool, trade_coin.value(), ctx);

    // 9. Simulate mock swap (sell on Cetus)
    let cetus_pool = mock_pool::create_mock_pool(CETUS_PRICE, ctx);
    let proceeds = mock_pool::mock_swap_sell(&cetus_pool, bought.value(), ctx);

    // 10. Emit trade event
    events::emit_trade_executed(
        direction,
        DEEPBOOK_PRICE,
        CETUS_PRICE,
        TRADE_AMOUNT,
        profit,
        &clk,
    );

    // 11. Return proceeds to vault
    vault::keeper_deposit<SUI>(&mut v, proceeds, &keeper_cap, ctx);

    // Verify vault has more than before the trade
    // Original: 100 SUI - 10 SUI (withdrawn) + proceeds
    let final_balance = vault::balance<SUI>(&v);
    assert!(final_balance > 90_000_000_000); // Should be > 90 since we got proceeds back

    // Cleanup
    coin::burn_for_testing(trade_coin);
    coin::burn_for_testing(bought);
    mock_pool::destroy_mock_pool(deepbook_pool);
    mock_pool::destroy_mock_pool(cetus_pool);
    clock::destroy_for_testing(clk);

    // Drain vault before destroying
    let remaining_amount = vault::balance<SUI>(&v);
    let remaining = vault::keeper_withdraw<SUI>(
        &mut v, remaining_amount, &keeper_cap, ctx,
    );
    coin::burn_for_testing(remaining);

    vault::destroy_admin_cap_for_testing(admin_cap);
    vault::destroy_keeper_cap_for_testing(keeper_cap);
    strategy::destroy_config_for_testing(config);
    vault::destroy_vault_for_testing(v);
    scenario.end();
}

#[test]
fun test_arb_fails_validation_emits_event() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let config = strategy::create_config_for_testing(ctx);
    let clk = clock::create_for_testing(ctx);

    // Prices with only 0.1% spread (10 bps) — below minimum of 30 bps
    let price_a: u64 = 1_000_000_000;
    let price_b: u64 = 1_001_000_000;

    let is_profitable = validator::validate_arbitrage(
        price_a,
        price_b,
        TRADE_AMOUNT,
        GAS_COST,
        strategy::min_spread_bps(&config),
    );
    assert!(is_profitable == false);

    // Emit failure event
    events::emit_arbitrage_failed(
        b"spread below minimum threshold",
        price_a,
        price_b,
        &clk,
    );

    clock::destroy_for_testing(clk);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}

#[test]
fun test_circuit_breaker_blocks_trade() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut config = strategy::create_config_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    // Deactivate strategy (circuit breaker)
    strategy::deactivate(&mut config, &admin_cap);
    assert!(strategy::is_active(&config) == false);

    // Even with a great spread, the keeper should check is_active first
    let direction = validator::determine_direction(DEEPBOOK_PRICE, CETUS_PRICE);
    assert!(direction == validator::direction_buy_deepbook_sell_cetus());

    // Strategy is inactive — keeper would skip execution
    // (This is enforced off-chain; we just verify the flag here)

    vault::destroy_admin_cap_for_testing(admin_cap);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}
