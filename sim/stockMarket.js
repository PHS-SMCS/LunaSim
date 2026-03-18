/**
 * @fileoverview Finnhub stock market integration for LunaSim.
 *
 * Allows simulation equations to reference real-world stock prices using
 * the syntax [stock][TICKER], e.g. [stock][AAPL] or [stock][MSFT].
 *
 * Prices are fetched once per simulation run and cached for the duration
 * of that run to avoid redundant API calls and rate-limit issues.
 *
 * @module stockMarket
 */

/**
 * Your Finnhub API key. Replace with your own key from https://finnhub.io
 * @constant {string}
 */
const FINNHUB_API_KEY = "d6sqc3hr01qoqoir33kgd6sqc3hr01qoqoir33l0";

/**
 * Base URL for the Finnhub REST API.
 * @constant {string}
 */
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

/**
 * In-memory price cache. Populated by {@link prefetchStockTickers} before
 * each simulation run and consumed by {@link getStockPrice} during evaluation.
 *
 * Keys are uppercase ticker symbols; values are numeric prices (current price `c`
 * from the Finnhub quote endpoint).
 *
 * @type {Map<string, number>}
 */
export const stockPriceCache = new Map();

/**
 * Regex that matches every [stock][TICKER] occurrence in an equation string.
 * The ticker is captured in group 1.
 *
 * @constant {RegExp}
 */
export const STOCK_TAG_REGEX = /\[stock\]\[([^\]]+)\]/gi;

/**
 * Scans an array of equation strings and collects every unique ticker symbol
 * referenced via the [stock][TICKER] syntax.
 *
 * @param {string[]} equations - Raw equation strings from stocks, variables, and valves.
 * @returns {string[]} Deduplicated array of uppercase ticker symbols found.
 *
 * @example
 * extractTickers(["[stock][AAPL] * 2", "[stock][aapl] + [stock][MSFT]"])
 * // => ["AAPL", "MSFT"]
 */
export function extractTickers(equations) {
    const tickers = new Set();
    for (const eq of equations) {
        if (!eq) continue;
        const matches = eq.matchAll(STOCK_TAG_REGEX);
        for (const match of matches) {
            tickers.add(match[1].toUpperCase());
        }
    }
    return Array.from(tickers);
}

/**
 * Fetches the current quote for a single ticker from Finnhub and returns
 * the current price (`c` field). Returns `null` on any error.
 *
 * @async
 * @param {string} ticker - Uppercase ticker symbol, e.g. "AAPL".
 * @returns {Promise<number|null>} The current price, or null if the fetch failed.
 */
async function fetchPrice(ticker) {
    try {
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`[stockMarket] HTTP ${response.status} for ticker "${ticker}"`);
            return null;
        }

        const data = await response.json();

        // Finnhub returns { c: currentPrice, h, l, o, pc, t }
        // A price of 0 usually means the symbol was not found.
        if (typeof data.c !== "number" || data.c === 0) {
            console.warn(`[stockMarket] No valid price for ticker "${ticker}". Response:`, data);
            return null;
        }

        return data.c;
    } catch (err) {
        console.error(`[stockMarket] Failed to fetch price for "${ticker}":`, err);
        return null;
    }
}

/**
 * Fetches prices for all provided tickers in parallel and stores them in
 * {@link stockPriceCache}. Any ticker that cannot be resolved is stored as
 * `NaN` so the simulation engine can surface a meaningful error.
 *
 * Call this once before starting the simulation run (i.e. inside the async
 * wrapper around `run()` in editor.js).
 *
 * @async
 * @param {string[]} tickers - Ticker symbols to prefetch (already deduplicated & uppercase).
 * @returns {Promise<void>}
 */
export async function prefetchStockTickers(tickers) {
    stockPriceCache.clear();

    if (tickers.length === 0) return;

    console.log(`[stockMarket] Fetching prices for: ${tickers.join(", ")}`);

    const results = await Promise.all(
        tickers.map(async (ticker) => {
            const price = await fetchPrice(ticker);
            return { ticker, price };
        })
    );

    for (const { ticker, price } of results) {
        if (price !== null) {
            stockPriceCache.set(ticker, price);
            console.log(`[stockMarket] ${ticker} = ${price}`);
        } else {
            // Store NaN so parseObject can report the failure clearly
            stockPriceCache.set(ticker, NaN);
            console.warn(`[stockMarket] Could not resolve price for "${ticker}"; stored as NaN`);
        }
    }
}

/**
 * Returns the cached price for a ticker symbol. Must be called after
 * {@link prefetchStockTickers} has populated the cache.
 *
 * @param {string} ticker - Ticker symbol (case-insensitive; normalized internally).
 * @returns {number} The cached price, or NaN if the ticker was not found/fetched.
 */
export function getStockPrice(ticker) {
    const key = ticker.toUpperCase();
    if (!stockPriceCache.has(key)) {
        console.warn(`[stockMarket] getStockPrice("${key}"): not in cache. Did prefetchStockTickers run?`);
        return NaN;
    }
    return stockPriceCache.get(key);
}
