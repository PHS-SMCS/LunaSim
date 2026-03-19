// sim/monteCarlo.js
// Monte Carlo engine for LunaSim — supports regular stocks, converters,
// and the special stock-type parameters: cookTime (microwave),
// transitTime (conveyor), and capacity (queue).

/**
 * Samples a single value from a probability distribution.
 * @param {Object} dist - Distribution descriptor.
 * @returns {number}
 */
export function sampleDistribution(dist) {
    switch (dist.type) {
        case "normal": {
            // Box-Muller transform
            const u1 = Math.random(), u2 = Math.random();
            const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            return dist.mean + z * dist.stddev;
        }
        case "uniform":
            return dist.min + Math.random() * (dist.max - dist.min);
        case "triangular": {
            const { min, max, mode } = dist;
            const fc = (mode - min) / (max - min);
            const u  = Math.random();
            return u < fc
                ? min + Math.sqrt(u * (max - min) * (mode - min))
                : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
        }
        case "fixed":
        default:
            return dist.value !== undefined ? dist.value : 0;
    }
}

/**
 * Applies sampled values to a deep-cloned engineJson.
 *
 * The uncertaintyMap keys map to one of:
 *   - A regular stock label          → replaces stock.equation (initial value)
 *   - A converter/variable label     → replaces converter.equation
 *   - A microwave stock label + ".cookTime"   → replaces stock.cookTime
 *   - A conveyor stock label + ".transitTime" → replaces stock.transitTime
 *   - A queue stock label   + ".capacity"     → replaces stock.capacity
 *
 * The UI encodes special params as "<stockLabel>.__cookTime__" etc.
 * so they can be stored alongside regular label keys without collision.
 *
 * @param {Object} engineJson    - Deep clone of the translated engine JSON
 * @param {Object} uncertaintyMap - { key: distributionObject }
 * @returns {Object} Patched engine JSON ready for one simulation run.
 */
export function applySample(engineJson, uncertaintyMap) {
    const json = JSON.parse(JSON.stringify(engineJson));

    for (const [key, dist] of Object.entries(uncertaintyMap)) {
        const sampled = sampleDistribution(dist);

        // ── Special stock-type parameters ────────────────────────────────────
        if (key.endsWith(".__cookTime__")) {
            const stockLabel = key.slice(0, -".__cookTime__".length);
            if (json.stocks[stockLabel] && json.stocks[stockLabel].isMicrowave) {
                json.stocks[stockLabel].cookTime = Math.max(0.001, sampled);
            }
            continue;
        }
        if (key.endsWith(".__transitTime__")) {
            const stockLabel = key.slice(0, -".__transitTime__".length);
            if (json.stocks[stockLabel] && json.stocks[stockLabel].isConveyor) {
                json.stocks[stockLabel].transitTime = Math.max(0.001, sampled);
            }
            continue;
        }
        if (key.endsWith(".__capacity__")) {
            const stockLabel = key.slice(0, -".__capacity__".length);
            if (json.stocks[stockLabel] && json.stocks[stockLabel].isQueue) {
                json.stocks[stockLabel].capacity = Math.max(0, sampled);
            }
            continue;
        }

        // ── Regular stock initial value ───────────────────────────────────
        if (json.stocks[key]) {
            json.stocks[key].equation = String(sampled);
            continue;
        }

        // ── Converter / variable ──────────────────────────────────────────
        if (json.converters[key]) {
            json.converters[key].equation = String(sampled);
            continue;
        }
    }

    return json;
}

/**
 * Runs N Monte Carlo iterations using a pool of Web Workers.
 *
 * @param {Object}   engineJson     - Base engine JSON (from translator + editor setup)
 * @param {Object}   uncertaintyMap - Distribution specs per key (see applySample)
 * @param {number}   N              - Number of runs (default 200)
 * @param {Function} onProgress     - Optional callback(completed, total)
 * @param {string}   bandSetting    - "90", "95", "99", or "90+50"
 * @returns {Promise<Object>} { percentiles, timesteps, bandSetting }
 */
export function runMonteCarlo(engineJson, uncertaintyMap, N = 200, onProgress = null, bandSetting = "90") {
    return new Promise((resolve, reject) => {
        const results  = [];
        let completed  = 0;
        let nextRun    = 0;

        const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
        const workers    = [];

        function dispatchTo(worker) {
            if (nextRun >= N) return;
            const runIndex   = nextRun++;
            const sampledJson = applySample(engineJson, uncertaintyMap);
            worker.postMessage({ engineJson: sampledJson, runIndex });
        }

        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(
                new URL('./simulationWorker.js', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = function(e) {
                const { runIndex, result, error } = e.data;

                if (error) {
                    console.warn(`MC run ${runIndex} failed: ${error}`);
                } else {
                    results[runIndex] = result;
                }

                completed++;
                if (onProgress) onProgress(completed, N);

                if (completed >= N) {
                    workers.forEach(w => w.terminate());
                    const validRuns = results.filter(Boolean);
                    if (validRuns.length === 0) {
                        reject(new Error("All Monte Carlo runs failed. Check your model equations."));
                        return;
                    }
                    resolve({
                        ...computePercentiles(validRuns, engineJson),
                        bandSetting
                    });
                } else {
                    dispatchTo(worker);
                }
            };

            worker.onerror = (e) => {
                workers.forEach(w => w.terminate());
                reject(e);
            };

            workers.push(worker);
            dispatchTo(worker);
        }
    });
}

/**
 * Computes percentile bands from all completed Monte Carlo runs.
 * Returns p0.5, p2.5, p5, p25, p50, p75, p95, p97.5, p99.5, mean, stddev
 * for every tracked variable (stocks + converters) at each timestep.
 *
 * @param {Array}  runs         - Array of completed engine output objects
 * @param {Object} baseEngineJson
 * @returns {Object} { percentiles, timesteps }
 */
function computePercentiles(runs, baseEngineJson) {
    const percentiles = {};

    const allKeys = [
        ...Object.keys(baseEngineJson.stocks),
        ...Object.keys(baseEngineJson.converters)
    ];

    const numSteps = runs[0]?.timesteps?.length || 0;

    allKeys.forEach(key => {
        const isStock = !!baseEngineJson.stocks[key];

        percentiles[key] = {
            p0_5:  [], p2_5: [], p5:  [],
            p25:   [], p50:  [], p75: [],
            p95:   [], p97_5:[], p99_5:[],
            mean:  [], stddev: []
        };

        for (let t = 0; t < numSteps; t++) {
            const values = runs
                .map(run => isStock
                    ? run.stocks[key]?.values[t]
                    : run.converters[key]?.values[t])
                .filter(v => v !== undefined && !isNaN(v))
                .sort((a, b) => a - b);

            if (values.length === 0) {
                // push NaN placeholders so array lengths stay consistent
                for (const arr of Object.values(percentiles[key])) arr.push(NaN);
                continue;
            }

            const pct = (p) => {
                const idx = (p / 100) * (values.length - 1);
                const lo  = Math.floor(idx);
                const hi  = Math.ceil(idx);
                return values[lo] + (values[hi] - values[lo]) * (idx - lo);
            };

            const mean     = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;

            percentiles[key].p0_5.push(pct(0.5));
            percentiles[key].p2_5.push(pct(2.5));
            percentiles[key].p5.push(pct(5));
            percentiles[key].p25.push(pct(25));
            percentiles[key].p50.push(pct(50));
            percentiles[key].p75.push(pct(75));
            percentiles[key].p95.push(pct(95));
            percentiles[key].p97_5.push(pct(97.5));
            percentiles[key].p99_5.push(pct(99.5));
            percentiles[key].mean.push(mean);
            percentiles[key].stddev.push(Math.sqrt(variance));
        }
    });

    return { percentiles, timesteps: runs[0]?.timesteps || [] };
}
