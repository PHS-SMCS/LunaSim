/**
 * @fileoverview DOM-free copy of the LunaSim Simulation class for use in Web Workers.
 *
 * IMPORTANT: This file must never import anything that touches the DOM, calls
 * document.getElementById, or references browser-only globals. It is loaded
 * exclusively inside simulationWorker.js via the Web Worker API.
 *
 * Key differences from engine.js:
 *  - No DOM references (document, window, etc.)
 *  - No API-data imports (stockMarket, weatherData, macroData). API tags in
 *    equations must be pre-resolved to numeric values by the main thread
 *    before the engineJson is dispatched to workers.
 *  - trigMode is read from this.data.trigMode instead of a DOM element.
 *  - Errors are thrown (and optionally routed through this._onError) instead
 *    of showing popups.
 */

export class Simulation {
    constructor() {
        this.data      = undefined;
        this.dt        = undefined;
        this.startTime = undefined;
        this.endTime   = undefined;

        /**
         * Optional error callback set by the worker to forward messages back.
         * Signature: (message: string) => void
         * @type {Function|null}
         */
        this._onError = null;
    }

    // ─────────────────────────────────────────────────────────────
    // Internal error helper — throws always, calls _onError first
    // ─────────────────────────────────────────────────────────────

    _throwError(msg) {
        if (this._onError) this._onError(msg);
        throw new Error(msg);
    }

    // ─────────────────────────────────────────────────────────────
    // safeEval — no DOM, reads trigMode from this.data
    // ─────────────────────────────────────────────────────────────

    safeEval(expression) {
        expression = expression.replaceAll("--", "+");
        expression = expression
            // Inverse hyperbolic trig
            .replaceAll(/(?<!Math\.)\basinh\b/gi, 'Math.asinh')
            .replaceAll(/(?<!Math\.)\bacosh\b/gi, 'Math.acosh')
            .replaceAll(/(?<!Math\.)\batanh\b/gi, 'Math.atanh')
            // Hyperbolic trig
            .replaceAll(/(?<!Math\.)\bsinh\b/gi, 'Math.sinh')
            .replaceAll(/(?<!Math\.)\bcosh\b/gi, 'Math.cosh')
            .replaceAll(/(?<!Math\.)\btanh\b/gi, 'Math.tanh')
            // Inverse trig
            .replaceAll(/(?<!Math\.)\basin\b/gi, 'Math.asin')
            .replaceAll(/(?<!Math\.)\bacos\b/gi, 'Math.acos')
            .replaceAll(/(?<!Math\.)\batan\b/gi, 'Math.atan')
            // Basic trig
            .replaceAll(/(?<!Math\.)\bsin\b/gi, 'Math.sin')
            .replaceAll(/(?<!Math\.)\bcos\b/gi, 'Math.cos')
            .replaceAll(/(?<!Math\.)\btan\b/gi, 'Math.tan')
            // Additional trig
            .replaceAll(/(?<!Math\.)\bsec\b/gi, 'Math.sec')
            .replaceAll(/(?<!Math\.)\bcsc\b/gi, 'Math.csc')
            .replaceAll(/(?<!Math\.)\bcot\b/gi, 'Math.cot')
            // Roots
            .replaceAll(/(?<!Math\.)\bsqrt\b/gi, 'Math.sqrt')
            .replaceAll(/(?<!Math\.)\bcbrt\b/gi, 'Math.cbrt')
            // Min/Max
            .replaceAll(/(?<!Math\.)\bmax\b/gi, 'Math.max')
            .replaceAll(/(?<!Math\.)\bmin\b/gi, 'Math.min')
            // Constants
            .replaceAll(/(?<!Math\.)\bpi\b/gi, 'Math.PI')
            .replaceAll(/(?<!Math\.)\be\b/gi,  'Math.E')
            // Other functions
            .replaceAll(/(?<!Math\.)\bexp\b/gi,   'Math.exp')
            .replaceAll(/(?<!Math\.)\blog\b/gi,   'Math.log')
            .replaceAll(/(?<!Math\.)\blog10\b/gi, 'Math.log10')
            .replaceAll(/(?<!Math\.)\babs\b/gi,   'Math.abs')
            .replaceAll(/(?<!Math\.)\bceil\b/gi,  'Math.ceil')
            .replaceAll(/(?<!Math\.)\bfloor\b/gi, 'Math.floor')
            .replaceAll(/(?<!Math\.)\bround\b/gi, 'Math.round')
            .replaceAll(/(?<!Math\.)\bpow\b/gi,   'Math.pow')
            .replaceAll(/(?<!Math\.)\brandom\b/gi,'Math.random')
            .replaceAll(/(?<!Math\.)\bhypot\b/gi, 'Math.hypot')
            .replaceAll(/(?<!Math\.)\bexpm1\b/gi, 'Math.expm1')
            .replaceAll(/(?<!Math\.)\blog1p\b/gi, 'Math.log1p')
            .replaceAll(/(?<!Math\.)\bsign\b/gi,  'Math.sign');

        // Define custom trig helpers on Math (safe inside a worker)
        Math.sec = x => 1 / Math.cos(x);
        Math.csc = x => 1 / Math.sin(x);
        Math.cot = x => 1 / Math.tan(x);

        // Read trigMode from the engineJson, not from the DOM
        const trigMode = this.data?.trigMode || "radian";

        if (trigMode === "degree") {
            expression = expression
                .replaceAll(/Math\.sin\s*\(([^)]+)\)/g, 'Math.sin(($1)*Math.PI/180)')
                .replaceAll(/Math\.cos\s*\(([^)]+)\)/g, 'Math.cos(($1)*Math.PI/180)')
                .replaceAll(/Math\.tan\s*\(([^)]+)\)/g, 'Math.tan(($1)*Math.PI/180)')
                .replaceAll(/Math\.sec\s*\(([^)]+)\)/g, 'Math.sec(($1)*Math.PI/180)')
                .replaceAll(/Math\.csc\s*\(([^)]+)\)/g, 'Math.csc(($1)*Math.PI/180)')
                .replaceAll(/Math\.cot\s*\(([^)]+)\)/g, 'Math.cot(($1)*Math.PI/180)');
        }

        try {
            return eval?.(expression);
        } catch (e) {
            console.log(e);
            return NaN;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // parseObject — no API tag substitution (pre-resolved by main thread)
    // ─────────────────────────────────────────────────────────────

    parseObject(equation, history = []) {
        // NOTE: [stock][TICKER], [keyword][ZIP], and [indicator][COUNTRY] tags
        // must already be replaced with numeric literals by the main thread
        // before this engineJson is sent to the worker. See resolveApiTags()
        // in editor.js.

        const objects = {};

        for (const stock in this.data.stocks) {
            objects[stock] = this.data.stocks[stock]["safeval"];

            for (const flow in this.data.stocks[stock]["inflows"]) {
                objects[flow] = this.data.stocks[stock]["inflows"][flow]["equation"];
            }
            for (const flow in this.data.stocks[stock]["outflows"]) {
                objects[flow] = this.data.stocks[stock]["outflows"][flow]["equation"];
            }
        }

        for (const converter in this.data.converters) {
            objects[converter] = this.data.converters[converter]["equation"];
        }

        // Sort by length descending to prevent substring collisions
        const sortedObjects = Object.keys(objects)
            .sort((a, b) => a.length - b.length)
            .reverse();

        for (const object of sortedObjects) {
            if (equation.includes("[" + object + "]")) {
                equation = equation.replaceAll(
                    "[" + object + "]",
                    this.parseAndEval("(" + objects[object] + ")", history.slice())
                );
            }
        }

        return equation;
    }

    // ─────────────────────────────────────────────────────────────
    // parseAndEval — throws instead of showing popups
    // ─────────────────────────────────────────────────────────────

    parseAndEval(equation, history = []) {
        if (history.includes(equation)) {
            history.push(equation);
            this._throwError(
                "Circular Definition Detected: " + equation +
                " | Stack: " + history.join(" -> ")
            );
        }
        history.push(equation);

        const parsedEquation = this.parseObject(equation, history);
        const res = this.safeEval(parsedEquation);

        if (isNaN(res)) {
            this._throwError(
                "Invalid equation: " + equation +
                " | Parsed: " + parsedEquation
            );
        }

        return res;
    }

    // ─────────────────────────────────────────────────────────────
    // initObjects
    // ─────────────────────────────────────────────────────────────

    initObjects() {
        for (const stockName in this.data.stocks) {
            const stock = this.data.stocks[stockName];
            let value = this.parseAndEval(stock["equation"]);
            if (stock["isNN"] === true) value = Math.max(0, value);
            stock["safeval"] = value;
            stock["values"]  = [value];
        }

        for (const stockName in this.data.stocks) {
            const stock = this.data.stocks[stockName];
            for (const flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] =
                    [this.parseAndEval(this.data.stocks[stockName]["inflows"][flowName]["equation"])];
            }
            for (const flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] =
                    [this.parseAndEval(this.data.stocks[stockName]["outflows"][flowName]["equation"])];
            }
        }

        for (const converterName in this.data.converters) {
            this.data.converters[converterName]["values"] =
                [this.parseAndEval(this.data.converters[converterName]["equation"])];
        }

        // Null checks
        for (const stockName in this.data.stocks) {
            const stock = this.data.stocks[stockName];
            if (stock["values"][0] == null) {
                this._throwError("Invalid equation (maybe circular definition): " + stock["equation"]);
            }
            for (const flowName in stock["inflows"]) {
                if (stock["inflows"][flowName]["values"][0] == null) {
                    this._throwError("Invalid equation (maybe circular definition): " + stock["inflows"][flowName]["equation"]);
                }
            }
            for (const flowName in stock["outflows"]) {
                if (stock["outflows"][flowName]["values"][0] == null) {
                    this._throwError("Invalid equation (maybe circular definition): " + stock["outflows"][flowName]["equation"]);
                }
            }
        }

        for (const converterName in this.data.converters) {
            if (this.data.converters[converterName]["values"][0] == null) {
                this._throwError("Invalid equation (maybe circular definition): " + this.data.converters[converterName]["equation"]);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // reset
    // ─────────────────────────────────────────────────────────────

    reset() {
        for (const stockName in this.data.stocks) {
            const stock = this.data.stocks[stockName];
            stock["safeval"] = null;
            stock["values"]  = [];
            for (const flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] = [];
            }
            for (const flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] = [];
            }
        }
        for (const converterName in this.data.converters) {
            this.data.converters[converterName]["values"] = [];
        }
        this.data.timesteps = [];
    }

    // ─────────────────────────────────────────────────────────────
    // dydt
    // ─────────────────────────────────────────────────────────────

    dydt(stock) {
        let sumInflow  = 0;
        let sumOutflow = 0;
        for (const i in stock["inflows"])  sumInflow  += this.parseAndEval(stock["inflows"][i]["equation"]);
        for (const i in stock["outflows"]) sumOutflow += this.parseAndEval(stock["outflows"][i]["equation"]);
        return sumInflow - sumOutflow;
    }

    // ─────────────────────────────────────────────────────────────
    // euler
    // ─────────────────────────────────────────────────────────────

    euler() {
        for (
            let t = this.startTime + this.dt;
            parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5));
            t += this.dt
        ) {
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            for (const stockName in this.data.stocks) {
                const stock = this.data.stocks[stockName];
                const newVal = stock["safeval"] + this.dydt(stock) * this.dt;
                stock["values"].push(stock["isNN"] ? Math.max(0, newVal) : newVal);
            }
            for (const stockName in this.data.stocks) {
                const stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }
            for (const stockName in this.data.stocks) {
                for (const inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"].push(
                        this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"])
                    );
                }
                for (const outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"].push(
                        this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"])
                    );
                }
            }
            for (const converter in this.data.converters) {
                this.data.converters[converter]["values"].push(
                    this.parseAndEval(this.data.converters[converter]["equation"])
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // rk4
    // ─────────────────────────────────────────────────────────────

    rk4() {
        for (
            let t = this.startTime + this.dt;
            parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5));
            t += this.dt
        ) {
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            const y0 = {}, k1 = {}, k2 = {}, k3 = {}, k4 = {};

            for (const sn in this.data.stocks) y0[sn] = this.data.stocks[sn]["safeval"];

            for (const sn in this.data.stocks) k1[sn] = this.dydt(this.data.stocks[sn]) * this.dt;
            for (const sn in this.data.stocks) this.data.stocks[sn]["safeval"] = y0[sn] + k1[sn] / 2;

            for (const sn in this.data.stocks) k2[sn] = this.dydt(this.data.stocks[sn]) * this.dt;
            for (const sn in this.data.stocks) this.data.stocks[sn]["safeval"] = y0[sn] + k2[sn] / 2;

            for (const sn in this.data.stocks) k3[sn] = this.dydt(this.data.stocks[sn]) * this.dt;
            for (const sn in this.data.stocks) this.data.stocks[sn]["safeval"] = y0[sn] + k3[sn];

            for (const sn in this.data.stocks) k4[sn] = this.dydt(this.data.stocks[sn]) * this.dt;

            for (const sn in this.data.stocks) {
                const stock  = this.data.stocks[sn];
                const newVal = y0[sn] + (k1[sn] + 2 * k2[sn] + 2 * k3[sn] + k4[sn]) / 6;
                stock["values"].push(stock["isNN"] ? Math.max(0, newVal) : newVal);
            }

            for (const sn in this.data.stocks) {
                const stock = this.data.stocks[sn];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }
            for (const sn in this.data.stocks) {
                for (const inflow in this.data.stocks[sn]["inflows"]) {
                    this.data.stocks[sn]["inflows"][inflow]["values"].push(
                        this.parseAndEval(this.data.stocks[sn]["inflows"][inflow]["equation"])
                    );
                }
                for (const outflow in this.data.stocks[sn]["outflows"]) {
                    this.data.stocks[sn]["outflows"][outflow]["values"].push(
                        this.parseAndEval(this.data.stocks[sn]["outflows"][outflow]["equation"])
                    );
                }
            }
            for (const converter in this.data.converters) {
                this.data.converters[converter]["values"].push(
                    this.parseAndEval(this.data.converters[converter]["equation"])
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // setData / run
    // ─────────────────────────────────────────────────────────────

    setData(structData) {
        this.data      = structData;
        this.dt        = parseFloat(structData.dt);
        this.startTime = parseFloat(structData.start_time);
        this.endTime   = parseFloat(structData.end_time);
        this.reset();
    }

    run() {
        this.initObjects();
        this.data["timesteps"] = [this.startTime];

        if (this.data["integration_method"] === "euler") {
            this.euler();
        } else {
            this.rk4();
        }

        return JSON.parse(JSON.stringify(this.data));
    }
}