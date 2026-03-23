#[test_only]
module sui_arb_agent::vault_tests;

use sui::coin;
use sui::sui::SUI;
use sui::test_scenario;
use sui_arb_agent::vault;

// ─── Helpers ───────────────────────────────────────────────────

const ADMIN: address = @0xA;
const KEEPER: address = @0xB;

// ─── Tests ─────────────────────────────────────────────────────

#[test]
fun test_vault_creation() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let vault = vault::create_vault_for_testing(ctx);
    assert!(vault::balance<SUI>(&vault) == 0);

    vault::destroy_vault_for_testing(vault);
    scenario.end();
}

#[test]
fun test_deposit_and_balance() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut vault = vault::create_vault_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    let deposit_coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
    vault::deposit<SUI>(&mut vault, deposit_coin, &admin_cap, ctx);

    assert!(vault::balance<SUI>(&vault) == 1_000_000_000);

    // Second deposit adds to existing balance
    let deposit_coin2 = coin::mint_for_testing<SUI>(500_000_000, ctx);
    vault::deposit<SUI>(&mut vault, deposit_coin2, &admin_cap, ctx);

    assert!(vault::balance<SUI>(&vault) == 1_500_000_000);

    // Cleanup: withdraw all before destroying
    let withdrawn = vault::withdraw<SUI>(&mut vault, 1_500_000_000, &admin_cap, ctx);
    coin::burn_for_testing(withdrawn);

    vault::destroy_admin_cap_for_testing(admin_cap);
    vault::destroy_vault_for_testing(vault);
    scenario.end();
}

#[test]
fun test_withdraw() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut vault = vault::create_vault_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    let deposit_coin = coin::mint_for_testing<SUI>(2_000_000_000, ctx);
    vault::deposit<SUI>(&mut vault, deposit_coin, &admin_cap, ctx);

    let withdrawn = vault::withdraw<SUI>(&mut vault, 500_000_000, &admin_cap, ctx);
    assert!(withdrawn.value() == 500_000_000);
    assert!(vault::balance<SUI>(&vault) == 1_500_000_000);

    // Cleanup
    coin::burn_for_testing(withdrawn);
    let remaining = vault::withdraw<SUI>(&mut vault, 1_500_000_000, &admin_cap, ctx);
    coin::burn_for_testing(remaining);

    vault::destroy_admin_cap_for_testing(admin_cap);
    vault::destroy_vault_for_testing(vault);
    scenario.end();
}

#[test]
fun test_keeper_deposit_and_withdraw() {
    let mut scenario = test_scenario::begin(KEEPER);
    let ctx = scenario.ctx();

    let mut vault = vault::create_vault_for_testing(ctx);
    let keeper_cap = vault::create_keeper_cap_for_testing(ctx);

    // Keeper deposits
    let deposit_coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
    vault::keeper_deposit<SUI>(&mut vault, deposit_coin, &keeper_cap, ctx);
    assert!(vault::balance<SUI>(&vault) == 1_000_000_000);

    // Keeper withdraws
    let withdrawn = vault::keeper_withdraw<SUI>(&mut vault, 300_000_000, &keeper_cap, ctx);
    assert!(withdrawn.value() == 300_000_000);
    assert!(vault::balance<SUI>(&vault) == 700_000_000);

    // Cleanup
    coin::burn_for_testing(withdrawn);
    let remaining = vault::keeper_withdraw<SUI>(&mut vault, 700_000_000, &keeper_cap, ctx);
    coin::burn_for_testing(remaining);

    vault::destroy_keeper_cap_for_testing(keeper_cap);
    vault::destroy_vault_for_testing(vault);
    scenario.end();
}

#[test, expected_failure(abort_code = vault::EInsufficientBalance)]
fun test_withdraw_insufficient_balance() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut vault = vault::create_vault_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    let deposit_coin = coin::mint_for_testing<SUI>(100, ctx);
    vault::deposit<SUI>(&mut vault, deposit_coin, &admin_cap, ctx);

    // Try to withdraw more than available — should abort
    let withdrawn = vault::withdraw<SUI>(&mut vault, 200, &admin_cap, ctx);
    coin::burn_for_testing(withdrawn);

    vault::destroy_admin_cap_for_testing(admin_cap);
    vault::destroy_vault_for_testing(vault);
    scenario.end();
}

#[test, expected_failure(abort_code = vault::ECoinTypeNotFound)]
fun test_withdraw_nonexistent_coin_type() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let mut vault = vault::create_vault_for_testing(ctx);
    let admin_cap = vault::create_admin_cap_for_testing(ctx);

    // Withdraw SUI without ever depositing — should abort
    let withdrawn = vault::withdraw<SUI>(&mut vault, 100, &admin_cap, ctx);
    coin::burn_for_testing(withdrawn);

    vault::destroy_admin_cap_for_testing(admin_cap);
    vault::destroy_vault_for_testing(vault);
    scenario.end();
}

#[test]
fun test_zero_balance_for_unknown_type() {
    let mut scenario = test_scenario::begin(ADMIN);
    let ctx = scenario.ctx();

    let vault = vault::create_vault_for_testing(ctx);

    // Balance for a type never deposited should be 0
    assert!(vault::balance<SUI>(&vault) == 0);

    vault::destroy_vault_for_testing(vault);
    scenario.end();
}
