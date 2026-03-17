// sim/monteCarlo.js

/**
 * Samples a value from a specified probability distribution.
 */
export function sampleDistribution(dist) {
    switch(dist.type) {
        case "normal": {
            // Box-Muller transform
            const u1 = Math.random(), u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            return dist.mean + z * dist.stddev;
        }
        case "uniform":
            return dist.min + Math.random() * (dist.max - dist.min);
        case "triangular": {
            const { min, max, mode } = dist;
            const fc = (mode - min) / (max - min);
            const u = Math.random();
            return u < fc
                ? min + Math.sqrt(u * (max - min) * (mode - min))
                : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
        }
        case "fixed":
        default:
            return dist.value;
    }
}

/**
 * Applies sampled values to an engineJson object by replacing
 * stock initial values and equation constants according to
 * the user-defined uncertainty map.
 *
 * @param {Object} engineJson - Deep clone of the translated engine JSON
 * @param {Object} uncertaintyMap - { stockOrVarLabel: distributionObject }
 */
export function applySample(engineJson, uncertaintyMap) {
    const json = JSON.parse(JSON.stringify(engineJson)); // deep clone

    Object.entries(uncertaintyMap).forEach(([label, dist]) => {
        const sampledValue = sampleDistribution(dist);

        // Replace initial value for stocks
        if (json.stocks[label]) {
            json.stocks[label].equation = String(sampledValue);
        }
        // Replace equation for converters
        if (json.converters[label]) {
            json.converters[label].equation = String(sampledValue);
        }
    });

    return json;
}

/**
 * Runs N Monte Carlo iterations using a pool of Web Workers.
 * Returns time series data for computing percentile bands.
 *
 * @param {Object} engineJson - Base engine JSON from translator
 * @param {Object} uncertaintyMap - Distribution specs per variable
 * @param {number} N - Number of runs (default 500)
 * @param {Function} onProgress - Callback(completed, total)
 * @returns {Promise<Object>} - { runs: Array<engineOutput>, percentiles: Object }
 */
export function runMonteCarlo(engineJson, uncertaintyMap, N = 500, onProgress = null) {
    return new Promise((resolve, reject) => {
        const results = [];
        let completed = 0;

        // Number of workers = min(navigator.hardwareConcurrency, 8)
        const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
        const workers = [];
        let nextRun = 0;

        function dispatchTo(worker) {
            if (nextRun >= N) return;
            const runIndex = nextRun++;
            const sampledJson = applySample(engineJson, uncertaintyMap);
            worker.postMessage({ engineJson: sampledJson, runIndex });
        }

        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(new URL('./simulationWorker.js', import.meta.url),
                { type: 'module' });

            worker.onmessage = function(e) {
                const { runIndex, result, error } = e.data;

                if (error) {
                    console.warn(`Run ${runIndex} failed: ${error}`);
                } else {
                    results[runIndex] = result;
                }

                completed++;
                if (onProgress) onProgress(completed, N);

                if (completed >= N) {
                    workers.forEach(w => w.terminate());
                    resolve(computePercentiles(results.filter(Boolean), engineJson));
                } else {
                    dispatchTo(worker);
                }
            };

            worker.onerror = (e) => reject(e);
            workers.push(worker);
            dispatchTo(worker);
        }
    });
}

/**
 * Computes percentile bands from all Monte Carlo runs.
 * Returns p5, p25, p50 (median), p75, p95 for each variable at each timestep.
 */
function computePercentiles(runs, baseEngineJson) {
    const percentiles = {};
    const allKeys = [
        ...Object.keys(baseEngineJson.stocks),
        ...Object.keys(baseEngineJson.converters)
    ];

    allKeys.forEach(key => {
        const isStock = !!baseEngineJson.stocks[key];
        const numSteps = runs[0]?.timesteps?.length || 0;

        percentiles[key] = {
            p5: [], p25: [], p50: [], p75: [], p95: [],
            mean: [], stddev: []
        };

        for (let t = 0; t < numSteps; t++) {
            const values = runs
                .map(run => isStock
                    ? run.stocks[key]?.values[t]
                    : run.converters[key]?.values[t])
                .filter(v => v !== undefined && !isNaN(v))
                .sort((a, b) => a - b);

            if (values.length === 0) continue;

            const pct = (p) => {
                const idx = (p / 100) * (values.length - 1);
                const lo = Math.floor(idx), hi = Math.ceil(idx);
                return values[lo] + (values[hi] - values[lo]) * (idx - lo);
            };

            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;

            percentiles[key].p5.push(pct(5));
            percentiles[key].p25.push(pct(25));
            percentiles[key].p50.push(pct(50));
            percentiles[key].p75.push(pct(75));
            percentiles[key].p95.push(pct(95));
            percentiles[key].mean.push(mean);
            percentiles[key].stddev.push(Math.sqrt(variance));
        }
    });

    return { runs, percentiles, timesteps: runs[0]?.timesteps || [] };
}