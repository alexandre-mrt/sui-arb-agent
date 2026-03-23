/// Trade event structs for on-chain logging.
module sui_arb_agent::events;

use sui::event;
use sui::clock::Clock;

// ─── Events ────────────────────────────────────────────────────

/// Emitted when an arbitrage trade is successfully executed.
public struct TradeExecuted has copy, drop {
    direction: u8,
    buy_price: u64,
    sell_price: u64,
    amount: u64,
    profit: u64,
    timestamp: u64,
}

/// Emitted when an arbitrage attempt fails validation.
public struct ArbitrageFailed has copy, drop {
    reason: vector<u8>,
    buy_price: u64,
    sell_price: u64,
    timestamp: u64,
}

// ─── Emit functions ────────────────────────────────────────────

/// Emit a TradeExecuted event.
public fun emit_trade_executed(
    direction: u8,
    buy_price: u64,
    sell_price: u64,
    amount: u64,
    profit: u64,
    clock: &Clock,
) {
    event::emit(TradeExecuted {
        direction,
        buy_price,
        sell_price,
        amount,
        profit,
        timestamp: clock.timestamp_ms(),
    });
}

/// Emit an ArbitrageFailed event.
public fun emit_arbitrage_failed(
    reason: vector<u8>,
    buy_price: u64,
    sell_price: u64,
    clock: &Clock,
) {
    event::emit(ArbitrageFailed {
        reason,
        buy_price,
        sell_price,
        timestamp: clock.timestamp_ms(),
    });
}
