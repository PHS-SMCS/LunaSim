/**
 * @fileoverview Real-world weather data integration for LunaSim.
 *
 * Allows simulation equations to reference live weather conditions for any
 * US ZIP code using the syntax:
 *
 *   [temp][ZIP]          – current temperature in °F
 *   [humidity][ZIP]      – relative humidity in %
 *   [wind][ZIP]          – wind speed in mph
 *   [precip][ZIP]        – precipitation probability in % (next hour)
 *   [aq][ZIP]            – air quality index (US AQI, 0–500 scale)
 *
 * Data sources (both free, no API key required):
 *   • Open-Meteo  (https://open-meteo.com)  – weather variables
 *   • Open-Meteo Air Quality API            – US AQI
 *   • Nominatim / OpenStreetMap             – ZIP → lat/lon geocoding
 *
 * Prices are fetched once per simulation run and cached in memory.
 *
 * @module weatherData
 */

// ─────────────────────────────────────────────────────────────────────────────
// API base URLs  (no keys required)
// ─────────────────────────────────────────────────────────────────────────────

const NOMINATIM_BASE  = "https://nominatim.openstreetmap.org";
const WEATHER_BASE    = "https://api.open-meteo.com/v1/forecast";
const AQ_BASE         = "https://air-quality-api.open-meteo.com/v1/air-quality";

// ─────────────────────────────────────────────────────────────────────────────
// Supported weather variable keywords
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All recognized weather keyword tags (lowercase).
 * @constant {string[]}
 */
export const WEATHER_KEYWORDS = ["temp", "humidity", "wind", "precip", "aq"];

/**
 * Regex that matches any [keyword][ZIP] weather tag.
 * keyword is captured in group 1, ZIP in group 2.
 *
 * Matches: [temp][10001]  [humidity][90210]  [wind][30301]  [precip][77001]  [aq][60601]
 *
 * @constant {RegExp}
 */
export const WEATHER_TAG_REGEX = /\[(temp|humidity|wind|precip|aq)\]\[(\d{5})\]/gi;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache  (keyed by "keyword:ZIP")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cache populated by {@link prefetchWeatherTags} before each simulation run.
 * Keys are lowercase strings of the form `"keyword:ZIP"`, e.g. `"temp:10001"`.
 * Values are numbers (NaN on failure).
 *
 * @type {Map<string, number>}
 */
export const weatherCache = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Extraction helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans an array of equation strings and returns all unique (keyword, zip)
 * pairs found via the [keyword][ZIP] syntax.
 *
 * @param {string[]} equations
 * @returns {{ keyword: string, zip: string }[]} Deduplicated pairs.
 *
 * @example
 * extractWeatherTags(["[temp][10001] + [wind][10001]", "[aq][90210]"])
 * // => [{ keyword:"temp", zip:"10001" }, { keyword:"wind", zip:"10001" }, { keyword:"aq", zip:"90210" }]
 */
export function extractWeatherTags(equations) {
    const seen = new Set();
    const results = [];

    for (const eq of equations) {
        if (!eq) continue;
        // Reset regex state before each equation scan
        WEATHER_TAG_REGEX.lastIndex = 0;
        const matches = eq.matchAll(WEATHER_TAG_REGEX);
        for (const match of matches) {
            const keyword = match[1].toLowerCase();
            const zip     = match[2];
            const key     = `${keyword}:${zip}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push({ keyword, zip });
            }
        }
    }

    // Reset after full scan
    WEATHER_TAG_REGEX.lastIndex = 0;
    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocoding  (ZIP → lat/lon via Nominatim)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple in-process geocode cache so the same ZIP is only looked up once.
 * @type {Map<string, { lat: number, lon: number }|null>}
 */
const geocodeCache = new Map();

/**
 * Converts a US ZIP code to latitude/longitude using Nominatim.
 * Returns null if geocoding fails.
 *
 * @async
 * @param {string} zip - 5-digit US ZIP code.
 * @returns {Promise<{ lat: number, lon: number }|null>}
 */
async function geocodeZip(zip) {
    if (geocodeCache.has(zip)) return geocodeCache.get(zip);

    try {
        const url = `${NOMINATIM_BASE}/search?postalcode=${encodeURIComponent(zip)}&country=US&format=json&limit=1`;
        const res = await fetch(url, {
            headers: { "Accept-Language": "en-US,en" }
        });

        if (!res.ok) {
            console.warn(`[weatherData] Nominatim HTTP ${res.status} for ZIP ${zip}`);
            geocodeCache.set(zip, null);
            return null;
        }

        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            console.warn(`[weatherData] No geocode result for ZIP "${zip}"`);
            geocodeCache.set(zip, null);
            return null;
        }

        const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        geocodeCache.set(zip, coords);
        return coords;

    } catch (err) {
        console.error(`[weatherData] Geocode failed for ZIP "${zip}":`, err);
        geocodeCache.set(zip, null);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Weather fetch  (Open-Meteo current conditions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches current weather data for a lat/lon from Open-Meteo.
 * Returns an object with temp (°F), humidity (%), wind (mph), precip (%).
 * Returns null on failure.
 *
 * @async
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ temp: number, humidity: number, wind: number, precip: number }|null>}
 */
async function fetchWeather(lat, lon) {
    try {
        // temperature_2m          → °C  (converted to °F below)
        // relative_humidity_2m    → %
        // wind_speed_10m          → km/h  (converted to mph below)
        // precipitation_probability → %
        const params = new URLSearchParams({
            latitude:               lat,
            longitude:              lon,
            current:                "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability",
            temperature_unit:       "fahrenheit",
            wind_speed_unit:        "mph",
            timezone:               "auto",
            forecast_days:          1,
        });

        const url = `${WEATHER_BASE}?${params.toString()}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.warn(`[weatherData] Open-Meteo HTTP ${res.status}`);
            return null;
        }

        const data = await res.json();
        const c = data.current;

        if (!c) {
            console.warn(`[weatherData] Unexpected Open-Meteo response structure`, data);
            return null;
        }

        return {
            temp:     c.temperature_2m,
            humidity: c.relative_humidity_2m,
            wind:     c.wind_speed_10m,
            precip:   c.precipitation_probability ?? 0,
        };

    } catch (err) {
        console.error(`[weatherData] Weather fetch failed (${lat}, ${lon}):`, err);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Air quality fetch  (Open-Meteo Air Quality API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the current US AQI for a lat/lon from the Open-Meteo Air Quality API.
 * Returns null on failure.
 *
 * @async
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<number|null>}
 */
async function fetchAirQuality(lat, lon) {
    try {
        const params = new URLSearchParams({
            latitude:  lat,
            longitude: lon,
            current:   "us_aqi",
            timezone:  "auto",
        });

        const url = `${AQ_BASE}?${params.toString()}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.warn(`[weatherData] AQ API HTTP ${res.status}`);
            return null;
        }

        const data = await res.json();
        const aqi  = data?.current?.us_aqi;

        if (typeof aqi !== "number") {
            console.warn(`[weatherData] No AQI value in response`, data);
            return null;
        }

        return aqi;

    } catch (err) {
        console.error(`[weatherData] AQ fetch failed (${lat}, ${lon}):`, err);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-ZIP fetch orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all required weather data for a single ZIP code and writes every
 * requested keyword into {@link weatherCache}.
 *
 * @async
 * @param {string} zip - 5-digit US ZIP code.
 * @param {Set<string>} keywords - Which keywords are needed for this ZIP
 *   (subset of WEATHER_KEYWORDS).
 * @returns {Promise<void>}
 */
async function fetchForZip(zip, keywords) {
    const coords = await geocodeZip(zip);

    if (!coords) {
        // Mark all requested keywords for this ZIP as NaN
        for (const kw of keywords) {
            weatherCache.set(`${kw}:${zip}`, NaN);
            console.warn(`[weatherData] ZIP "${zip}" could not be geocoded; ${kw} set to NaN`);
        }
        return;
    }

    const { lat, lon } = coords;

    // Decide what to fetch
    const needsWeather = keywords.has("temp") || keywords.has("humidity") ||
                         keywords.has("wind") || keywords.has("precip");
    const needsAQ      = keywords.has("aq");

    // Fetch in parallel
    const [weatherResult, aqResult] = await Promise.all([
        needsWeather ? fetchWeather(lat, lon) : Promise.resolve(null),
        needsAQ      ? fetchAirQuality(lat, lon) : Promise.resolve(null),
    ]);

    // Store weather results
    if (needsWeather) {
        for (const kw of ["temp", "humidity", "wind", "precip"]) {
            if (!keywords.has(kw)) continue;
            const value = weatherResult ? weatherResult[kw] : NaN;
            weatherCache.set(`${kw}:${zip}`, typeof value === "number" ? value : NaN);
            console.log(`[weatherData] ${kw}:${zip} = ${weatherCache.get(`${kw}:${zip}`)}`);
        }
    }

    // Store AQ result
    if (needsAQ) {
        const value = (aqResult !== null) ? aqResult : NaN;
        weatherCache.set(`aq:${zip}`, value);
        console.log(`[weatherData] aq:${zip} = ${value}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public prefetch  (called once from editor.js before sim run)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all weather values required by the current model's equations and
 * populates {@link weatherCache}. Groups requests by ZIP so each ZIP only
 * triggers one geocode lookup and at most two API calls (weather + AQ).
 *
 * Call this once in the async `run()` wrapper in `editor.js`, after
 * `translate()` and before `sim.run()`.
 *
 * @async
 * @param {{ keyword: string, zip: string }[]} tags - Output of {@link extractWeatherTags}.
 * @returns {Promise<void>}
 */
export async function prefetchWeatherTags(tags) {
    weatherCache.clear();

    if (tags.length === 0) return;

    // Group by ZIP so we make at most 1 geocode call + 2 data calls per ZIP
    /** @type {Map<string, Set<string>>} */
    const byZip = new Map();
    for (const { keyword, zip } of tags) {
        if (!byZip.has(zip)) byZip.set(zip, new Set());
        byZip.get(zip).add(keyword);
    }

    console.log(`[weatherData] Prefetching weather for ZIPs: ${[...byZip.keys()].join(", ")}`);

    // Fetch all ZIPs in parallel
    await Promise.all(
        [...byZip.entries()].map(([zip, keywords]) => fetchForZip(zip, keywords))
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public getter  (called synchronously by engine.js during eval)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a cached weather value. Must be called after {@link prefetchWeatherTags}.
 *
 * @param {string} keyword - One of: temp, humidity, wind, precip, aq.
 * @param {string} zip     - 5-digit US ZIP code.
 * @returns {number} The cached value, or NaN if not available.
 */
export function getWeatherValue(keyword, zip) {
    const key = `${keyword.toLowerCase()}:${zip}`;
    if (!weatherCache.has(key)) {
        console.warn(`[weatherData] getWeatherValue("${key}"): not in cache. Did prefetchWeatherTags run?`);
        return NaN;
    }
    return weatherCache.get(key);
}
