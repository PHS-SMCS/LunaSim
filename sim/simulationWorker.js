// simulationWorker.js
// Web Worker entry point — imports from DOM-free engineCore.js.
// Receives base engineJson + sampled parameters, runs one simulation, returns result.
import { Simulation } from './engineCore.js';

self.onmessage = function(e) {
    const { engineJson, runIndex } = e.data;
    try {
        const sim = new Simulation();

        // Inject error handler so errors surface as messages, not crashes
        sim._onError = (msg) => { throw new Error(msg); };

        // Pass trigMode from engineJson so safeEval uses correct trig mode
        sim.trigMode = engineJson.trigMode || "radian";

        sim.setData(engineJson);
        const result = sim.run();
        sim.reset();
        self.postMessage({ runIndex, result });
    } catch(err) {
        self.postMessage({ runIndex, result: null, error: err.message });
    }
};
