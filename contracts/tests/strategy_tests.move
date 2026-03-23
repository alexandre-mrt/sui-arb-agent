#[test_only]
module sui_arb_agent::strategy_tests;

use sui::test_scenario;
use sui_arb_agent::strategy;
use sui_arb_agent::vault;

const ADMIN: address = @0xA;

#[test]
fun test_default_config() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let config = strategy::create_config_for_testing(ctx);

    assert!(strategy::min_spread_bps(&config) == 30);
    assert!(strategy::max_trade_size(&config) == 1_000_000_000_000);
    assert!(strategy::is_active(&config) == true);

    strategy::destroy_config_for_testing(config);
    scenario.end();
}

#[test]
fun test_update_config() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut config = strategy::create_config_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    strategy::update_config(&mut config, &admin_cap, 50, 2_000_000_000_000);

    assert!(strategy::min_spread_bps(&config) == 50);
    assert!(strategy::max_trade_size(&config) == 2_000_000_000_000);

    vault::destroy_admin_cap_for_testing(admin_cap);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}

#[test]
fun test_deactivate_and_activate() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut config = strategy::create_config_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    assert!(strategy::is_active(&config) == true);

    strategy::deactivate(&mut config, &admin_cap);
    assert!(strategy::is_active(&config) == false);

    strategy::activate(&mut config, &admin_cap);
    assert!(strategy::is_active(&config) == true);

    vault::destroy_admin_cap_for_testing(admin_cap);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}

#[test, expected_failure(abort_code = strategy::EInvalidSpread)]
fun test_update_config_zero_spread() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut config = strategy::create_config_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    // Zero spread should fail
    strategy::update_config(&mut config, &admin_cap, 0, 1_000_000_000);

    vault::destroy_admin_cap_for_testing(admin_cap);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}

#[test, expected_failure(abort_code = strategy::EInvalidSpread)]
fun test_update_config_spread_too_high() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut config = strategy::create_config_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    // Spread > 10000 bps (100%) should fail
    strategy::update_config(&mut config, &admin_cap, 10_001, 1_000_000_000);

    vault::destroy_admin_cap_for_testing(admin_cap);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}

#[test, expected_failure(abort_code = strategy::EInvalidTradeSize)]
fun test_update_config_zero_trade_size() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut config = strategy::create_config_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    strategy::update_config(&mut config, &admin_cap, 30, 0);

    vault::destroy_admin_cap_for_testing(admin_cap);
    strategy::destroy_config_for_testing(config);
    scenario.end();
}
