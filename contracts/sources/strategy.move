/// On-chain strategy configuration with circuit breaker.
module sui_arb_agent::strategy;

use sui::event;
use sui_arb_agent::vault::AdminCap;

// ─── Error codes ───────────────────────────────────────────────
const EInvalidSpread: u64 = 101;
const EInvalidTradeSize: u64 = 102;

// ─── Constants ─────────────────────────────────────────────────
const DEFAULT_MIN_SPREAD_BPS: u64 = 30;     // 0.30%
const DEFAULT_MAX_TRADE_SIZE: u64 = 1_000_000_000_000; // 1000 SUI (1e9 * 1000)
const MAX_SPREAD_BPS: u64 = 10_000;          // 100%

// ─── Strategy config ───────────────────────────────────────────

/// Shared strategy configuration object.
public struct StrategyConfig has key {
    id: UID,
    min_spread_bps: u64,
    max_trade_size: u64,
    is_active: bool,
}

// ─── Events ────────────────────────────────────────────────────

public struct StrategyUpdated has copy, drop {
    min_spread_bps: u64,
    max_trade_size: u64,
}

public struct StrategyToggled has copy, drop {
    is_active: bool,
}

// ─── Init ──────────────────────────────────────────────────────

fun init(ctx: &mut TxContext) {
    let config = StrategyConfig {
        id: object::new(ctx),
        min_spread_bps: DEFAULT_MIN_SPREAD_BPS,
        max_trade_size: DEFAULT_MAX_TRADE_SIZE,
        is_active: true,
    };
    transfer::share_object(config);
}

// ─── Admin functions ───────────────────────────────────────────

/// Update strategy parameters (admin only).
public fun update_config(
    config: &mut StrategyConfig,
    _admin_cap: &AdminCap,
    new_min_spread: u64,
    new_max_size: u64,
) {
    assert!(new_min_spread > 0 && new_min_spread <= MAX_SPREAD_BPS, EInvalidSpread);
    assert!(new_max_size > 0, EInvalidTradeSize);

    config.min_spread_bps = new_min_spread;
    config.max_trade_size = new_max_size;

    event::emit(StrategyUpdated {
        min_spread_bps: new_min_spread,
        max_trade_size: new_max_size,
    });
}

/// Activate the strategy (admin only).
public fun activate(config: &mut StrategyConfig, _admin_cap: &AdminCap) {
    config.is_active = true;
    event::emit(StrategyToggled { is_active: true });
}

/// Deactivate the strategy / circuit breaker (admin only).
public fun deactivate(config: &mut StrategyConfig, _admin_cap: &AdminCap) {
    config.is_active = false;
    event::emit(StrategyToggled { is_active: false });
}

// ─── View functions ────────────────────────────────────────────

public fun min_spread_bps(config: &StrategyConfig): u64 {
    config.min_spread_bps
}

public fun max_trade_size(config: &StrategyConfig): u64 {
    config.max_trade_size
}

public fun is_active(config: &StrategyConfig): bool {
    config.is_active
}

// ─── Test helpers ──────────────────────────────────────────────

#[test_only]
public fun create_config_for_testing(ctx: &mut TxContext): StrategyConfig {
    StrategyConfig {
        id: object::new(ctx),
        min_spread_bps: DEFAULT_MIN_SPREAD_BPS,
        max_trade_size: DEFAULT_MAX_TRADE_SIZE,
        is_active: true,
    }
}

#[test_only]
public fun destroy_config_for_testing(config: StrategyConfig) {
    let StrategyConfig { id, .. } = config;
    object::delete(id);
}
