// simulationWorker.js — imports from engineCore, not engine
import { Simulation } from './engineCore.js';

self.onmessage = function(e) {
    const { engineJson, runIndex } = e.data;
    try {
        const sim = new Simulation();

        // Wire up error reporting without DOM
        sim._onError = (msg) => { throw new Error(msg); };

        sim.setData(engineJson);
        const result = sim.run();
        sim.reset();
        self.postMessage({ runIndex, result });
    } catch(err) {
        self.postMessage({ runIndex, result: null, error: err.message });
    }
};