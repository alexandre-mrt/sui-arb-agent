/// Shared vault holding the agent's funds with capability-gated access.
/// Uses Bag for generic coin storage keyed by type name.
module sui_arb_agent::vault;

use sui::bag::{Self, Bag};
use sui::coin::{Self, Coin};
use sui::balance::Balance;
use sui::event;
use std::type_name;
use std::ascii::String;

// ─── Error codes ───────────────────────────────────────────────
const EInsufficientBalance: u64 = 1;
const ECoinTypeNotFound: u64 = 2;

// ─── Capabilities ──────────────────────────────────────────────

/// Admin capability — created on module init, transferred to deployer.
public struct AdminCap has key, store { id: UID }

/// Keeper capability — allows the off-chain keeper to execute trades.
public struct KeeperCap has key, store { id: UID }

// ─── Vault ─────────────────────────────────────────────────────

/// Shared vault storing balances in a Bag keyed by coin type name.
public struct Vault has key {
    id: UID,
    balances: Bag,
}

// ─── Events ────────────────────────────────────────────────────

public struct VaultDeposit has copy, drop {
    coin_type: String,
    amount: u64,
    depositor: address,
}

public struct VaultWithdraw has copy, drop {
    coin_type: String,
    amount: u64,
    recipient: address,
}

// ─── Init ──────────────────────────────────────────────────────

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());

    let vault = Vault {
        id: object::new(ctx),
        balances: bag::new(ctx),
    };
    transfer::share_object(vault);
}

// ─── Admin functions ───────────────────────────────────────────

/// Create a new KeeperCap and transfer it to the given address.
public fun create_keeper_cap(
    _admin_cap: &AdminCap,
    recipient: address,
    ctx: &mut TxContext,
) {
    let keeper_cap = KeeperCap { id: object::new(ctx) };
    transfer::transfer(keeper_cap, recipient);
}

/// Deposit coins into the vault (admin only).
public fun deposit<T>(
    vault: &mut Vault,
    coin: Coin<T>,
    _admin_cap: &AdminCap,
    ctx: &TxContext,
) {
    let amount = coin.value();
    let key = type_name::with_defining_ids<T>().into_string();

    if (vault.balances.contains(key)) {
        let existing: &mut Balance<T> = vault.balances.borrow_mut(key);
        existing.join(coin.into_balance());
    } else {
        vault.balances.add(key, coin.into_balance());
    };

    event::emit(VaultDeposit {
        coin_type: type_name::with_defining_ids<T>().into_string(),
        amount,
        depositor: ctx.sender(),
    });
}

/// Withdraw coins from the vault (admin only).
public fun withdraw<T>(
    vault: &mut Vault,
    amount: u64,
    _admin_cap: &AdminCap,
    ctx: &mut TxContext,
): Coin<T> {
    let key = type_name::with_defining_ids<T>().into_string();
    assert!(vault.balances.contains(key), ECoinTypeNotFound);

    let bal: &mut Balance<T> = vault.balances.borrow_mut(key);
    assert!(bal.value() >= amount, EInsufficientBalance);
    let split_bal = bal.split(amount);

    // Remove empty balance entry to keep the bag clean
    if (bal.value() == 0) {
        let empty: Balance<T> = vault.balances.remove(key);
        empty.destroy_zero();
    };

    event::emit(VaultWithdraw {
        coin_type: type_name::with_defining_ids<T>().into_string(),
        amount,
        recipient: ctx.sender(),
    });

    coin::from_balance(split_bal, ctx)
}

// ─── Keeper functions ──────────────────────────────────────────

/// Withdraw coins for arb execution (keeper only).
public fun keeper_withdraw<T>(
    vault: &mut Vault,
    amount: u64,
    _keeper_cap: &KeeperCap,
    ctx: &mut TxContext,
): Coin<T> {
    let key = type_name::with_defining_ids<T>().into_string();
    assert!(vault.balances.contains(key), ECoinTypeNotFound);

    let bal: &mut Balance<T> = vault.balances.borrow_mut(key);
    assert!(bal.value() >= amount, EInsufficientBalance);
    let split_bal = bal.split(amount);

    // Remove empty balance entry to keep the bag clean
    if (bal.value() == 0) {
        let empty: Balance<T> = vault.balances.remove(key);
        empty.destroy_zero();
    };

    event::emit(VaultWithdraw {
        coin_type: type_name::with_defining_ids<T>().into_string(),
        amount,
        recipient: ctx.sender(),
    });

    coin::from_balance(split_bal, ctx)
}

/// Deposit profits back into the vault (keeper only).
public fun keeper_deposit<T>(
    vault: &mut Vault,
    coin: Coin<T>,
    _keeper_cap: &KeeperCap,
    ctx: &TxContext,
) {
    let amount = coin.value();
    let key = type_name::with_defining_ids<T>().into_string();

    if (vault.balances.contains(key)) {
        let existing: &mut Balance<T> = vault.balances.borrow_mut(key);
        existing.join(coin.into_balance());
    } else {
        vault.balances.add(key, coin.into_balance());
    };

    event::emit(VaultDeposit {
        coin_type: type_name::with_defining_ids<T>().into_string(),
        amount,
        depositor: ctx.sender(),
    });
}

// ─── View functions ────────────────────────────────────────────

/// Get the balance of a specific coin type in the vault.
public fun balance<T>(vault: &Vault): u64 {
    let key = type_name::with_defining_ids<T>().into_string();
    if (vault.balances.contains(key)) {
        let bal: &Balance<T> = vault.balances.borrow(key);
        bal.value()
    } else {
        0
    }
}

// ─── Test helpers ──────────────────────────────────────────────

#[test_only]
public fun create_admin_cap_for_testing(ctx: &mut TxContext): AdminCap {
    AdminCap { id: object::new(ctx) }
}

#[test_only]
public fun create_keeper_cap_for_testing(ctx: &mut TxContext): KeeperCap {
    KeeperCap { id: object::new(ctx) }
}

#[test_only]
public fun create_vault_for_testing(ctx: &mut TxContext): Vault {
    Vault {
        id: object::new(ctx),
        balances: bag::new(ctx),
    }
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: AdminCap) {
    let AdminCap { id } = cap;
    object::delete(id);
}

#[test_only]
public fun destroy_keeper_cap_for_testing(cap: KeeperCap) {
    let KeeperCap { id } = cap;
    object::delete(id);
}

#[test_only]
public fun destroy_vault_for_testing(vault: Vault) {
    let Vault { id, balances } = vault;
    balances.destroy_empty();
    object::delete(id);
}
