/**
 * @fileoverview World Bank macro-economic indicator integration for LunaSim.
 *
 * Allows simulation equations to reference live country-level economic data
 * using the syntax [indicator][COUNTRY], where COUNTRY is a 2-letter ISO code.
 *
 * Supported indicators:
 *   [gdp][US]           – GDP (current USD)
 *   [inflation][US]     – Inflation / CPI annual growth rate (%)
 *   [unemployment][US]  – Unemployment rate (% of labor force)
 *   [population][US]    – Total population
 *   [gnipc][US]         – GNI per capita (current USD)
 *   [tradebal][US]      – Current account balance (USD)
 *
 * Data source: World Bank Indicators API v2 (free, no API key required)
 *   https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 *
 * Uses `mrnev=1` (most recent non-empty value) so results stay fresh even
 * though World Bank data is updated annually rather than in real time.
 *
 * Country codes follow ISO 3166-1 alpha-2 (e.g. US, DE, CN, JP, BR, IN).
 *
 * @module macroData
 */

// ─────────────────────────────────────────────────────────────────────────────
// World Bank indicator code map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps LunaSim keyword → World Bank indicator code.
 * @constant {Object.<string, string>}
 */
const WB_INDICATORS = {
    gdp:          "NY.GDP.MKTP.CD",   // GDP (current US$)
    inflation:    "FP.CPI.TOTL.ZG",   // Inflation, consumer prices (annual %)
    unemployment: "SL.UEM.TOTL.ZS",   // Unemployment, total (% of labor force)
    population:   "SP.POP.TOTL",       // Population, total
    gnipc:        "NY.GNP.PCAP.CD",   // GNI per capita (current US$)
    tradebal:     "BN.CAB.XOKA.CD",   // Current account balance (BoP, current US$)
};

/**
 * All recognized macro keyword tags (lowercase).
 * @constant {string[]}
 */
export const MACRO_KEYWORDS = Object.keys(WB_INDICATORS);

const WB_BASE = "https://api.worldbank.org/v2";

// ─────────────────────────────────────────────────────────────────────────────
// Regex
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Matches any [keyword][COUNTRY] macro tag.
 * Group 1 = keyword, Group 2 = ISO2 country code (1-3 uppercase letters,
 * permissive enough to also handle 3-letter codes like "CHN").
 *
 * @constant {RegExp}
 */
export const MACRO_TAG_REGEX = /\[(gdp|inflation|unemployment|population|gnipc|tradebal)\]\[([A-Za-z]{2,3})\]/gi;

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory cache populated before each simulation run.
 * Keys: `"keyword:COUNTRYCODE"` (both lowercase), e.g. `"gdp:us"`.
 * Values: numbers (NaN on failure).
 *
 * @type {Map<string, number>}
 */
export const macroCache = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans an array of equation strings and returns all unique (keyword, country)
 * pairs found via the [keyword][COUNTRY] syntax.
 *
 * @param {string[]} equations
 * @returns {{ keyword: string, country: string }[]} Deduplicated pairs.
 *
 * @example
 * extractMacroTags(["[gdp][US] / [population][US]", "[inflation][DE]"])
 * // => [{ keyword:"gdp", country:"US" }, { keyword:"population", country:"US" }, { keyword:"inflation", country:"DE" }]
 */
export function extractMacroTags(equations) {
    const seen    = new Set();
    const results = [];

    for (const eq of equations) {
        if (!eq) continue;
        MACRO_TAG_REGEX.lastIndex = 0;
        const matches = eq.matchAll(MACRO_TAG_REGEX);
        for (const match of matches) {
            const keyword = match[1].toLowerCase();
            const country = match[2].toUpperCase();
            const key     = `${keyword}:${country}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push({ keyword, country });
            }
        }
    }

    MACRO_TAG_REGEX.lastIndex = 0;
    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helper — one indicator + one country
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the most-recent non-empty value for a given World Bank indicator
 * and ISO2 country code. Returns null on any failure.
 *
 * Uses `mrnev=1` (most recent non-empty value) to skip years with no data
 * and always retrieve a real number.
 *
 * @async
 * @param {string} indicatorCode - World Bank indicator code, e.g. "NY.GDP.MKTP.CD".
 * @param {string} country       - ISO2 country code, e.g. "US".
 * @returns {Promise<number|null>}
 */
async function fetchIndicator(indicatorCode, country) {
    try {
        const url = `${WB_BASE}/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicatorCode)}?format=json&mrnev=1&per_page=1`;
        const res = await fetch(url);

        if (!res.ok) {
            console.warn(`[macroData] World Bank HTTP ${res.status} for ${country}/${indicatorCode}`);
            return null;
        }

        const json = await res.json();

        // World Bank v2 JSON: [ { page, pages, … }, [ { value, date, … }, … ] ]
        if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1]) || json[1].length === 0) {
            console.warn(`[macroData] No data returned for ${country}/${indicatorCode}`, json);
            return null;
        }

        const entry = json[1][0];

        if (entry.value === null || entry.value === undefined) {
            console.warn(`[macroData] Null value for ${country}/${indicatorCode} (year ${entry.date})`);
            return null;
        }

        console.log(`[macroData] ${country}/${indicatorCode} (${entry.date}) = ${entry.value}`);
        return Number(entry.value);

    } catch (err) {
        console.error(`[macroData] Fetch failed for ${country}/${indicatorCode}:`, err);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch fetch — groups by country so logging is clean, fires all in parallel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all macro values required by the current model's equations and
 * populates {@link macroCache}. All requests fire in parallel.
 *
 * Call this once in the async `run()` wrapper in `editor.js`, after
 * `translate()` and before `sim.run()`.
 *
 * @async
 * @param {{ keyword: string, country: string }[]} tags - Output of {@link extractMacroTags}.
 * @returns {Promise<void>}
 */
export async function prefetchMacroTags(tags) {
    macroCache.clear();

    if (tags.length === 0) return;

    const grouped = tags.reduce((acc, { keyword, country }) => {
        if (!acc[country]) acc[country] = [];
        acc[country].push(keyword);
        return acc;
    }, {});

    console.log(
        `[macroData] Prefetching macro indicators for: ` +
        Object.entries(grouped).map(([c, ks]) => `${c}(${ks.join(",")})`).join(" | ")
    );

    // Fire all fetches in parallel
    await Promise.all(
        tags.map(async ({ keyword, country }) => {
            const indicatorCode = WB_INDICATORS[keyword];
            if (!indicatorCode) {
                console.warn(`[macroData] Unknown keyword "${keyword}"`);
                macroCache.set(`${keyword}:${country}`, NaN);
                return;
            }

            const value = await fetchIndicator(indicatorCode, country);
            const cacheKey = `${keyword}:${country.toUpperCase()}`;

            if (value !== null) {
                macroCache.set(cacheKey, value);
            } else {
                macroCache.set(cacheKey, NaN);
                console.warn(`[macroData] Could not resolve ${keyword}:${country}; stored as NaN`);
            }
        })
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous getter — called by engine.js during evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a cached macro value. Must be called after {@link prefetchMacroTags}.
 *
 * @param {string} keyword - One of the MACRO_KEYWORDS (case-insensitive).
 * @param {string} country - ISO2 country code (case-insensitive).
 * @returns {number} The cached value, or NaN if not available.
 */
export function getMacroValue(keyword, country) {
    const key = `${keyword.toLowerCase()}:${country.toUpperCase()}`;
    if (!macroCache.has(key)) {
        console.warn(`[macroData] getMacroValue("${key}"): not in cache. Did prefetchMacroTags run?`);
        return NaN;
    }
    return macroCache.get(key);
}
