// simulationWorker.js — imports from engineCore, not engine
import { Simulation } from './engineCore.js';

self.onmessage = function(e) {
    const { batch } = e.data;

    const batchResults = batch.map(({ runIndex, sampledJson }) => {
        try {
            const sim = new Simulation();

            // Wire up error reporting without DOM
            sim._onError = (msg) => { throw new Error(msg); };

            sim.setData(sampledJson);
            const result = sim.run();
            sim.reset();
            return { runIndex, result };
        } catch(err) {
            return { runIndex, result: null, error: err.message };
        }
    });

    self.postMessage({ batchResults });
};