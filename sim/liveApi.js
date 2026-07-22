/**
 * Live-data equation support for LunaSim.
 *
 * Supported syntax:
 *   Weather:    [temp|wind|humidity|aq|precip][US_ZIP]
 *   World Bank: [gdp|inflation|unemployment|population|gnipc|trade balance][ISO2]
 *   Market:     [stock][TICKER]
 */

export const LIVE_API_SUGGESTIONS = [
    { label: '[temp][ZIP_CODE] — current temperature (°C)', insert: 'temp][ZIP_CODE' },
    { label: '[wind][ZIP_CODE] — current wind speed (km/h)', insert: 'wind][ZIP_CODE' },
    { label: '[humidity][ZIP_CODE] — relative humidity (%)', insert: 'humidity][ZIP_CODE' },
    { label: '[precip][ZIP_CODE] — current precipitation (mm)', insert: 'precip][ZIP_CODE' },
    { label: '[aq][ZIP_CODE] — current US air-quality index', insert: 'aq][ZIP_CODE' },
    { label: '[gdp][COUNTRY_CODE] — latest GDP (current USD)', insert: 'gdp][COUNTRY_CODE' },
    { label: '[inflation][COUNTRY_CODE] — latest inflation (%)', insert: 'inflation][COUNTRY_CODE' },
    { label: '[unemployment][COUNTRY_CODE] — latest unemployment (%)', insert: 'unemployment][COUNTRY_CODE' },
    { label: '[population][COUNTRY_CODE] — latest population', insert: 'population][COUNTRY_CODE' },
    { label: '[gnipc][COUNTRY_CODE] — latest GNI per capita (USD)', insert: 'gnipc][COUNTRY_CODE' },
    { label: '[trade balance][COUNTRY_CODE] — latest trade (% GDP)', insert: 'trade balance][COUNTRY_CODE' },
    { label: '[stock][TICKER] — current Finnhub market price', insert: 'stock][TICKER' }
];

const LIVE_REF_RE = /\[(temp|wind|humidity|precip|aq|gdp|inflation|unemployment|population|gnipc|trade\s+balance|stock)\]\[([^\]]+)\]/gi;
const WORLD_BANK_INDICATORS = {
    gdp: 'NY.GDP.MKTP.CD',
    inflation: 'FP.CPI.TOTL.ZG',
    unemployment: 'SL.UEM.TOTL.ZS',
    population: 'SP.POP.TOTL',
    gnipc: 'NY.GNP.PCAP.CD',
    'trade balance': 'NE.TRD.GNFS.ZS'
};

export function findLiveApiReferences(expression) {
    const refs = [];
    String(expression || '').replace(LIVE_REF_RE, (raw, type, parameter) => {
        refs.push({ raw, type: type.toLowerCase().replace(/\s+/g, ' '), parameter: parameter.trim() });
        return raw;
    });
    return refs;
}

export function stripLiveApiReferences(expression) {
    return String(expression || '').replace(LIVE_REF_RE, '0');
}

async function fetchJson(url, fetchImpl, timeoutMs = 15000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller?.signal });
        if (!response.ok) throw new Error(`Live API request failed (${response.status})`);
        return await response.json();
    } catch (err) {
        if (err?.name === 'AbortError') throw new Error('Live API request timed out. Try again in a moment.');
        throw err;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function coordinatesForZip(zip, fetchImpl) {
    if (!/^\d{5}$/.test(zip)) throw new Error(`Invalid US ZIP code: ${zip}`);
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&postalcode=' + encodeURIComponent(zip);
    try {
        const data = await fetchJson(url, fetchImpl, 6000);
        if (Array.isArray(data) && data[0]) return { latitude: Number(data[0].lat), longitude: Number(data[0].lon) };
    } catch (err) {
        console.warn('Nominatim lookup failed; using ZIP fallback.', err);
    }
    const fallback = await fetchJson(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, fetchImpl);
    const place = fallback?.places?.[0];
    if (!place) throw new Error(`ZIP code not found: ${zip}`);
    return { latitude: Number(place.latitude), longitude: Number(place.longitude) };
}

async function resolveWeather(type, zip, fetchImpl) {
    const { latitude, longitude } = await coordinatesForZip(zip, fetchImpl);
    if (type === 'aq') {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`;
        const data = await fetchJson(url, fetchImpl);
        return Number(data.current?.us_aqi);
    }
    const field = {
        temp: 'temperature_2m', wind: 'wind_speed_10m',
        humidity: 'relative_humidity_2m', precip: 'precipitation'
    }[type];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${field}`;
    const data = await fetchJson(url, fetchImpl);
    return Number(data.current?.[field]);
}

async function resolveWorldBank(type, country, fetchImpl) {
    const code = country.toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Invalid ISO country code: ${country}`);
    const indicator = WORLD_BANK_INDICATORS[type];
    const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(code)}/indicator/${indicator}?format=json&mrnev=1&per_page=1`;
    const data = await fetchJson(url, fetchImpl);
    const value = Array.isArray(data) && Array.isArray(data[1]) ? data[1][0]?.value : null;
    return value === null || value === undefined ? NaN : Number(value);
}

async function resolveStock(ticker, fetchImpl, finnhubKey) {
    if (!finnhubKey) throw new Error('Finnhub API key required for [stock][TICKER]. Add it in Settings → Experimental.');
    const symbol = ticker.toUpperCase();
    if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) throw new Error(`Invalid stock ticker: ${ticker}`);
    const data = await fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubKey)}`, fetchImpl);
    return Number(data.c);
}

export async function resolveLiveApiValue(type, parameter, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('This browser does not support live API requests.');
    let value;
    if (['temp', 'wind', 'humidity', 'precip', 'aq'].includes(type)) {
        value = await resolveWeather(type, parameter, fetchImpl);
    } else if (type === 'stock') {
        value = await resolveStock(parameter, fetchImpl, options.finnhubKey || '');
    } else {
        value = await resolveWorldBank(type, parameter, fetchImpl);
    }
    if (!Number.isFinite(value)) throw new Error(`No numeric live value returned for [${type}][${parameter}]`);
    return value;
}

export async function resolveLiveApiExpression(expression, options = {}) {
    const cache = options.cache || new Map();
    const refs = findLiveApiReferences(expression);
    let resolved = String(expression || '');
    for (const ref of refs) {
        const key = `${ref.type}:${ref.parameter.toUpperCase()}`;
        if (!cache.has(key)) cache.set(key, await resolveLiveApiValue(ref.type, ref.parameter, options));
        resolved = resolved.split(ref.raw).join(String(cache.get(key)));
    }
    return resolved;
}

export async function resolveEngineLiveApis(engineJson, options = {}) {
    const clone = JSON.parse(JSON.stringify(engineJson));
    const cache = new Map();
    const resolveEquation = async obj => {
        if (obj && typeof obj.equation === 'string') obj.equation = await resolveLiveApiExpression(obj.equation, { ...options, cache });
    };
    for (const stock of Object.values(clone.stocks || {})) {
        await resolveEquation(stock);
        for (const flow of Object.values(stock.inflows || {})) await resolveEquation(flow);
        for (const flow of Object.values(stock.outflows || {})) await resolveEquation(flow);
    }
    for (const converter of Object.values(clone.converters || {})) await resolveEquation(converter);
    for (const variable of clone.variables || []) await resolveEquation(variable);
    for (const valve of clone.valves || []) await resolveEquation(valve);
    clone.liveApiValues = Object.fromEntries(cache);
    return clone;
}
