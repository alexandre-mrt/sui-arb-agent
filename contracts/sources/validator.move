/// Arbitrage profitability validator.
/// All prices are u64 scaled by 1e9 (standard Sui convention).
module sui_arb_agent::validator;

// ─── Constants ─────────────────────────────────────────────────
const BPS_DENOMINATOR: u64 = 10_000;
const PRICE_SCALE: u64 = 1_000_000_000; // 1e9

// ─── Direction constants ───────────────────────────────────────
const DIRECTION_NONE: u8 = 0;
const DIRECTION_BUY_DEEPBOOK_SELL_CETUS: u8 = 1;
const DIRECTION_BUY_CETUS_SELL_DEEPBOOK: u8 = 2;

// ─── Public functions ──────────────────────────────────────────

/// Validate whether an arbitrage opportunity is profitable.
/// Returns true if the expected profit exceeds gas cost and the
/// spread meets the minimum threshold.
public fun validate_arbitrage(
    price_a: u64,
    price_b: u64,
    amount: u64,
    gas_cost: u64,
    min_spread_bps: u64,
): bool {
    if (amount == 0) return false;

    let spread = calculate_spread_bps(price_a, price_b);
    if (spread < min_spread_bps) return false;

    let (buy_price, sell_price) = if (price_a < price_b) {
        (price_a, price_b)
    } else {
        (price_b, price_a)
    };

    let profit = calculate_profit(buy_price, sell_price, amount, gas_cost);
    profit > 0
}

/// Calculate spread in basis points between two prices.
/// spread_bps = |price_a - price_b| * 10000 / min(price_a, price_b)
public fun calculate_spread_bps(price_a: u64, price_b: u64): u64 {
    if (price_a == 0 || price_b == 0) return 0;

    let diff = if (price_a > price_b) {
        price_a - price_b
    } else {
        price_b - price_a
    };

    let min_price = if (price_a < price_b) { price_a } else { price_b };

    // Use u128 to avoid overflow: diff * BPS_DENOMINATOR / min_price
    let spread = ((diff as u128) * (BPS_DENOMINATOR as u128) / (min_price as u128));
    (spread as u64)
}

/// Calculate expected profit from an arbitrage trade.
/// profit = (sell_price - buy_price) * amount / PRICE_SCALE - gas_cost
/// Returns 0 if unprofitable.
public fun calculate_profit(
    buy_price: u64,
    sell_price: u64,
    amount: u64,
    gas_cost: u64,
): u64 {
    if (sell_price <= buy_price) return 0;
    if (amount == 0) return 0;

    let price_diff = sell_price - buy_price;

    // Use u128 to avoid overflow
    let gross_profit = ((price_diff as u128) * (amount as u128) / (PRICE_SCALE as u128));
    let gross_u64 = (gross_profit as u64);

    if (gross_u64 <= gas_cost) {
        0
    } else {
        gross_u64 - gas_cost
    }
}

/// Determine trade direction based on prices.
/// Returns: 0 = no arb, 1 = buy DeepBook sell Cetus, 2 = buy Cetus sell DeepBook.
public fun determine_direction(deepbook_price: u64, cetus_price: u64): u8 {
    if (deepbook_price == 0 || cetus_price == 0) return DIRECTION_NONE;
    if (deepbook_price == cetus_price) return DIRECTION_NONE;

    if (deepbook_price < cetus_price) {
        // DeepBook is cheaper: buy on DeepBook, sell on Cetus
        DIRECTION_BUY_DEEPBOOK_SELL_CETUS
    } else {
        // Cetus is cheaper: buy on Cetus, sell on DeepBook
        DIRECTION_BUY_CETUS_SELL_DEEPBOOK
    }
}

// ─── Public constant accessors ─────────────────────────────────

public fun direction_none(): u8 { DIRECTION_NONE }
public fun direction_buy_deepbook_sell_cetus(): u8 { DIRECTION_BUY_DEEPBOOK_SELL_CETUS }
public fun direction_buy_cetus_sell_deepbook(): u8 { DIRECTION_BUY_CETUS_SELL_DEEPBOOK }
