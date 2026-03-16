/**
 * @fileoverview Handles parsing and calculations for LunaSim
 * @module engine
 * @author Authors: Karthik S. Vedula, Ryan Chung, Arjun Mujumdar, Akash Saran
 */


/**
 * Displays the simulation error popup and dims the background.
 * Triggered when an equation or model setup fails validation.
 * @function
 * @memberOf module:engine
 */

function showSimErrorPopup() {
    document.getElementById("simErrorPopup").style.display = "block";
    document.getElementById("grayEffectDiv").style.display = "block";
}
document.getElementById("simErrorPopupDismiss").addEventListener("click", closeSimErrorPopup);

/**
 * Hides the simulation error popup and restores background visibility.
 * @function
 * @memberOf module:engine
 */

function closeSimErrorPopup() {
    document.getElementById("simErrorPopup").style.display = "none";
    document.getElementById("grayEffectDiv").style.display = "none";
}

export class Simulation {
    constructor() {
        this.data;
        this.dt;
        this.startTime;
        this.endTime;
    }

    /**
     * Safely evaluates a mathematical expression string using JavaScript's `eval`,
     * while replacing known mathematical terms and correcting syntax patterns.
     *
     * @method
     * @memberof Simulation
     * @param {string} expression - The math expression to evaluate.
     * @returns {number} The result of the evaluated expression or NaN on error.
     * @memberOf module:engine
     */

    safeEval(expression) {
        // if there are two -- or two ++, remove one
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
            // Additional trig functions
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
            .replaceAll(/(?<!Math\.)\be\b/gi, 'Math.E')
            // rest of the functions
            .replaceAll(/(?<!Math\.)\bexp\b/gi, 'Math.exp')
            .replaceAll(/(?<!Math\.)\blog\b/gi, 'Math.log')
            .replaceAll(/(?<!Math\.)\blog10\b/gi, 'Math.log10')
            .replaceAll(/(?<!Math\.)\bsqrt\b/gi, 'Math.sqrt')
            .replaceAll(/(?<!Math\.)\bcbrt\b/gi, 'Math.cbrt')
            .replaceAll(/(?<!Math\.)\babs\b/gi, 'Math.abs')
            .replaceAll(/(?<!Math\.)\bceil\b/gi, 'Math.ceil')
            .replaceAll(/(?<!Math\.)\bfloor\b/gi, 'Math.floor')
            .replaceAll(/(?<!Math\.)\bround\b/gi, 'Math.round')
            .replaceAll(/(?<!Math\.)\bpow\b/gi, 'Math.pow')
            .replaceAll(/(?<!Math\.)\bmax\b/gi, 'Math.max')
            .replaceAll(/(?<!Math\.)\bmin\b/gi, 'Math.min')
            .replaceAll(/(?<!Math\.)\brandom\b/gi, 'Math.random')
            .replaceAll(/(?<!Math\.)\bhypot\b/gi, 'Math.hypot')
            .replaceAll(/(?<!Math\.)\bexpm1\b/gi, 'Math.expm1')
            .replaceAll(/(?<!Math\.)\blog1p\b/gi, 'Math.log1p')
            .replaceAll(/(?<!Math\.)\bsign\b/gi, 'Math.sign');

        Math.sec = x => 1 / Math.cos(x);
        Math.csc = x => 1 / Math.sin(x);
        Math.cot = x => 1 / Math.tan(x);

        const trigModeElement = document.getElementById("trigMode");
        const trigMode = trigModeElement ? trigModeElement.value : "radian";

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


    /**
     * Recursively replaces all references to variables, stocks (including conveyors),
     * inflows, and outflows in the equation with their actual equation expressions or
     * current safeval values.
     *
     * Conveyors appear in this.data.stocks and are resolved exactly like regular
     * stocks — their safeval (current pipeline total) is substituted when referenced
     * via [conveyorName] in another node's equation.
     *
     * @method
     * @memberof Simulation
     * @param {string} equation - The expression to resolve.
     * @param {string[]} [history=[]] - Keeps track of recursion depth and avoids circular references.
     * @returns {string} A fully-resolved equation string ready for evaluation.
     * @memberOf module:engine
     */

    /**
     * Resolves the actual inbound flow rate for a single inflow entry.
     * Called by stepConveyor, stepMicrowave, and dydt() to evaluate an inflow.
     *
     * - If marked _isTransitIn: return upstream conveyor's _lastTransitRate.
     * - If marked _isBatchIn:   return upstream microwave's _lastBatchRate.
     * - Otherwise:              evaluate the user's equation normally.
     *
     * This is the correct function to call whenever you need the rate flowing
     * INTO a node, regardless of whether the source is a delay node.
     *
     * @param {Object} flow - An inflow entry from stock.inflows[name].
     * @returns {number} The resolved inflow rate.
     */
    evalFlowInbound(flow) {
        if (flow["_isTransitIn"] && flow["_upstreamStock"]) {
            const up = this.data.stocks[flow["_upstreamStock"]];
            return (up && up["_lastTransitRate"] !== undefined) ? up["_lastTransitRate"] : 0;
        }
        if (flow["_isBatchIn"] && flow["_upstreamStock"]) {
            const up = this.data.stocks[flow["_upstreamStock"]];
            return (up && up["_lastBatchRate"] !== undefined) ? up["_lastBatchRate"] : 0;
        }
        if (flow["_isOverflowIn"] && flow["_upstreamStock"]) {
            const up = this.data.stocks[flow["_upstreamStock"]];
            return (up && up["_lastOverflowRate"] !== undefined) ? up["_lastOverflowRate"] : 0;
        }
        return this.parseAndEval(flow["equation"]);
    }

    /**
     * Evaluates the rate for a single flow entry. For normal flows this
     * just parses and evaluates the user equation. For flows marked
     * _isTransitIn or _isBatchIn (the outflow of a conveyor/microwave going
     * into a downstream stock), we return the cached transit/batch rate
     * that was computed during stepConveyor/stepMicrowave for this timestep.
     *
     * @method
     * @memberof Simulation
     * @param {Object} flow - A flow object from stock.inflows or stock.outflows.
     * @returns {number} The evaluated flow rate.
     */
    evalFlowRate(flow) {
        // Inflow to a stock that comes FROM a conveyor (transit completion rate)
        if (flow["_isTransitIn"] && flow["_upstreamStock"]) {
            const upstream = this.data.stocks[flow["_upstreamStock"]];
            if (upstream && upstream["_lastTransitRate"] !== undefined) {
                return upstream["_lastTransitRate"];
            }
            return 0;
        }
        // Inflow to a stock that comes FROM a microwave (batch release rate)
        if (flow["_isBatchIn"] && flow["_upstreamStock"]) {
            const upstream = this.data.stocks[flow["_upstreamStock"]];
            if (upstream && upstream["_lastBatchRate"] !== undefined) {
                return upstream["_lastBatchRate"];
            }
            return 0;
        }
        // Inflow to a stock that comes FROM a queue overflow
        if (flow["_isOverflowIn"] && flow["_upstreamStock"]) {
            const upstream = this.data.stocks[flow["_upstreamStock"]];
            if (upstream && upstream["_lastOverflowRate"] !== undefined) {
                return upstream["_lastOverflowRate"];
            }
            return 0;
        }
        if (flow["_isTransitOut"]) {
            return 0;  // placeholder; see recordFlowValues() override below
        }
        if (flow["_isBatchOut"]) {
            return 0;  // placeholder
        }
        // Normal user-equation flow
        return this.parseAndEval(flow["equation"]);
    }

    /**
     * Records flow values for a single stock's inflows and outflows.
     * Handles transit/batch flows specially by reading cached rates.
     * @param {string} stockName
     */
    recordFlowValues(stockName) {
        const stock = this.data.stocks[stockName];
        for (var flowName in stock["inflows"]) {
            const f = stock["inflows"][flowName];
            f["values"].push(this.evalFlowInbound(f));
        }
        for (var flowName in stock["outflows"]) {
            const f = stock["outflows"][flowName];
            let rate;
            if (f["_isTransitOut"]) {
                rate = (stock["_lastTransitRate"] !== undefined) ? stock["_lastTransitRate"] : 0;
            } else if (f["_isBatchOut"]) {
                rate = (stock["_lastBatchRate"] !== undefined) ? stock["_lastBatchRate"] : 0;
            } else if (f["_isOverflowOut"]) {
                rate = (stock["_lastOverflowRate"] !== undefined) ? stock["_lastOverflowRate"] : 0;
            } else {
                rate = this.parseAndEval(f["equation"]);
            }
            f["values"].push(rate);
        }
    }

    parseObject(equation, history = []) {
        let objects = {}; // stores all stocks (including conveyors/microwaves), converters, and flows

        for (var stock in this.data.stocks) {
            objects[stock] = this.data.stocks[stock]["safeval"];

            // For flow entries, use the evaluated rate rather than the raw equation
            // for transit/batch/overflow flows, since the user's equation is not the actual rate.
            for (var flow in this.data.stocks[stock]["inflows"]) {
                const f = this.data.stocks[stock]["inflows"][flow];
                if (f["_isTransitIn"] && f["_upstreamStock"]) {
                    const up = this.data.stocks[f["_upstreamStock"]];
                    objects[flow] = (up && up["_lastTransitRate"] !== undefined)
                        ? String(up["_lastTransitRate"]) : "0";
                } else if (f["_isBatchIn"] && f["_upstreamStock"]) {
                    const up = this.data.stocks[f["_upstreamStock"]];
                    objects[flow] = (up && up["_lastBatchRate"] !== undefined)
                        ? String(up["_lastBatchRate"]) : "0";
                } else if (f["_isOverflowIn"] && f["_upstreamStock"]) {
                    const up = this.data.stocks[f["_upstreamStock"]];
                    objects[flow] = (up && up["_lastOverflowRate"] !== undefined)
                        ? String(up["_lastOverflowRate"]) : "0";
                } else {
                    objects[flow] = f["equation"];
                }
            }
            for (var flow in this.data.stocks[stock]["outflows"]) {
                const f = this.data.stocks[stock]["outflows"][flow];
                if (f["_isTransitOut"]) {
                    objects[flow] = (this.data.stocks[stock]["_lastTransitRate"] !== undefined)
                        ? String(this.data.stocks[stock]["_lastTransitRate"]) : "0";
                } else if (f["_isBatchOut"]) {
                    objects[flow] = (this.data.stocks[stock]["_lastBatchRate"] !== undefined)
                        ? String(this.data.stocks[stock]["_lastBatchRate"]) : "0";
                } else if (f["_isOverflowOut"]) {
                    objects[flow] = (this.data.stocks[stock]["_lastOverflowRate"] !== undefined)
                        ? String(this.data.stocks[stock]["_lastOverflowRate"]) : "0";
                } else {
                    objects[flow] = f["equation"];
                }
            }
        }

        for (var converter in this.data.converters) {
            objects[converter] = this.data.converters[converter]["equation"];
        }

        let sortedObjects = Object.keys(objects).sort((a, b) => a.length - b.length).reverse();

        for (var object of sortedObjects) {
            if (equation.includes("[" + object + "]")) {
                equation = equation.replaceAll("[" + object + "]", this.parseAndEval('(' + objects[object] + ')', history.slice()));
            }
        }

        return equation;
    }

    /**
     * Parses and evaluates an expression by resolving dependencies recursively,
     * then safely evaluates the result. Detects and reports circular definitions.
     *
     * @method
     * @memberof Simulation
     * @param {string} equation - The expression to parse and evaluate.
     * @param {string[]} [history=[]] - Used to track recursion and detect cycles.
     * @returns {number} The numeric result of evaluating the expression.
     * @throws Will show a popup and throw if evaluation fails or cycle is detected.
     * @memberOf module:engine
     */

    parseAndEval(equation, history = []) {

        // Check for circular definitions
        if (history.includes(equation)) {
            history.push(equation);
            document.getElementById("simErrorPopupDesc").innerHTML = "Circular Definition Detected:<br>" + equation + "<br><br>Stack Trace:<br>" + history.join("<br> -> ") + "<br><br>Please check your equations and try again.";
            showSimErrorPopup();
            throw new Error("Circular Definition Detected:<br>" + equation + "<br><br>Stack Trace:<br>" + history.join("<br> -> ") + "<br><br>Please check your equations and try again.");
        }
        history.push(equation);

        var parsedEquation;
        parsedEquation = this.parseObject(equation, history);
        var res = this.safeEval(parsedEquation);

        if (isNaN(res)) {
            document.getElementById("simErrorPopupDesc").innerHTML = "Invalid equation:<br>" + equation + "<br><br>Parsed equation:<br>" + parsedEquation + "<br><br>Please check your equations and try again.";
            showSimErrorPopup();
            throw new Error("Invalid equation:<br>" + equation + "<br><br>Parsed equation:<br>" + parsedEquation + "<br><br>Please check your equations and try again.");
        } else {
            return res;
        }
    }

    /**
     * Initializes the simulation state by evaluating all stock, conveyor, flow, and
     * converter equations for timestep 0. Stores initial values and performs safety
     * checks.
     *
     * For conveyor stocks the pipeline queue is also initialised here:
     *   slots = max(1, round(transitTime / dt))
     *   Each slot is pre-filled with (initialValue / slots) so that the conveyor
     *   begins draining at a steady rate from t=0.
     *
     * @method
     * @memberof Simulation
     * @throws Will show a popup and throw if any value cannot be resolved.
     * @memberOf module:engine
     */

    initObjects() {
        // ── Step 1: evaluate initial values for all stocks (including conveyors) ─
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            let value = this.parseAndEval(stock["equation"]);

            if (stock["isNN"] == true) {
                value = Math.max(0, value);
            }

            stock["safeval"] = value;
            stock["values"] = [value];
        }

        // ── Step 2: build conveyor pipelines ────────────────────────────────────
        // Each slot in the pipeline represents dt worth of material in transit.
        // Pre-filling with (initialValue / slots) distributes the initial conveyor
        // contents evenly so material exits at a steady rate from the very first step.
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            if (!stock["isConveyor"]) continue;

            let slots = Math.max(1, Math.round(stock["transitTime"] / this.dt));
            stock["_slots"] = slots;

            let perSlot = stock["safeval"] / slots;
            stock["pipeline"] = new Array(slots).fill(perSlot);
        }

        // ── Step 2a-extra: set initial transit rates for conveyors ─────────────
        // pipeline[0] is about to exit at the first step. Expose as initial rate
        // so that evalFlowRate() works correctly at t=0 for downstream stocks.
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            if (!stock["isConveyor"]) continue;
            const firstSlot = stock["pipeline"].length > 0 ? stock["pipeline"][0] : 0;
            stock["_lastTransitOut"]  = firstSlot;
            stock["_lastTransitRate"] = firstSlot / this.dt;
        }

        // ── Step 2b: initialize microwave batches ───────────────────────────────
        // Each microwave starts with one full batch already loaded (amount = initial
        // value, stepsRemaining = cookTime / dt).  This means at t=0 the microwave
        // already contains material that will exit after the first cookTime elapses.
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            if (!stock["isMicrowave"]) continue;

            let stepsNeeded = Math.max(1, Math.round(stock["cookTime"] / this.dt));
            stock["_cookSteps"] = stepsNeeded;
            // Initialise with existing contents as a single pending batch
            stock["batch"] = stock["safeval"] > 0
                ? { amount: stock["safeval"], stepsRemaining: stepsNeeded }
                : null;
            // Initial rate is 0 (no batch completing at t=0)
            stock["_lastBatchRelease"] = 0;
            stock["_lastBatchRate"]    = 0;
        }

        // ── Step 2c: initialize queue overflow state ────────────────────────────
        // No structure to build — just ensure the cached overflow rate starts at 0
        // so downstream stocks reading _isOverflowIn at t=0 get a clean value.
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            if (!stock["isQueue"]) continue;
            stock["_lastOverflowRate"] = 0;
        }

        // ── Step 3: initialize flow values at t=0 ───────────────────────────────
        for (var stockName in this.data.stocks) {
            // Reset values arrays first
            for (var flowName in this.data.stocks[stockName]["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] = [];
            }
            for (var flowName in this.data.stocks[stockName]["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] = [];
            }
            this.recordFlowValues(stockName);
        }

        // ── Step 4: initialize converter values at t=0 ──────────────────────────
        for (var converterName in this.data.converters) {
            this.data.converters[converterName]["values"] = [this.parseAndEval(this.data.converters[converterName]["equation"])];
        }

        // ── Step 5: null checks ──────────────────────────────────────────────────
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            if (stock["values"][0] == null) {
                document.getElementById("simErrorPopupDesc").innerHTML = "Invalid equation (maybe circular definition):<br>" + stock["equation"] + "<br><br>Please check your equations and try again.";
                showSimErrorPopup();
                throw new Error("Invalid equation (maybe circular definition):<br>" + stock["equation"] + "<br><br>Please check your equations and try again.");
            }

            for (var flowName in stock["inflows"]) {
                if (stock["inflows"][flowName]["values"][0] == null) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "Invalid equation (maybe circular definition):<br>" + stock["inflows"][flowName]["equation"] + "<br><br>Please check your equations and try again.";
                    showSimErrorPopup();
                    throw new Error("Invalid equation (maybe circular definition):<br>" + stock["inflows"][flowName]["equation"] + "<br><br>Please check your equations and try again.");
                }
            }
            for (var flowName in stock["outflows"]) {
                if (stock["outflows"][flowName]["values"][0] == null) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "Invalid equation (maybe circular definition):<br>" + stock["outflows"][flowName]["equation"] + "<br><br>Please check your equations and try again.";
                    showSimErrorPopup();
                    throw new Error("Invalid equation (maybe circular definition):<br>" + stock["outflows"][flowName]["equation"] + "<br><br>Please check your equations and try again.");
                }
            }
        }

        for (var converterName in this.data.converters) {
            if (this.data.converters[converterName]["values"][0] == null) {
                document.getElementById("simErrorPopupDesc").innerHTML = "Invalid equation (maybe circular definition):<br>" + this.data.converters[converterName]["equation"] + "<br><br>Please check your equations and try again.";
                showSimErrorPopup();
                throw new Error("Invalid equation (maybe circular definition):<br>" + this.data.converters[converterName]["equation"] + "<br><br>Please check your equations and try again.");
            }
        }
    }

    /**
     * Resets the simulation to its initial state by clearing all values,
     * resetting all `safeval` fields to null, and clearing conveyor pipelines
     * so that initObjects() rebuilds them cleanly on the next run.
     *
     * @method
     * @memberOf module:engine
     */

    reset() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            stock["safeval"] = null;
            stock["values"] = [];

            // Clear conveyor pipeline so initObjects rebuilds it from scratch.
            if (stock["isConveyor"]) {
                stock["pipeline"] = [];
                stock["_slots"] = 0;
            }

            // Clear microwave batch so initObjects rebuilds it from scratch.
            if (stock["isMicrowave"]) {
                stock["batch"] = null;
                stock["_cookSteps"] = 0;
            }

            // Clear queue overflow state so initObjects resets it cleanly.
            if (stock["isQueue"]) {
                stock["_lastOverflowRate"] = 0;
            }

            // reset flows
            for (var flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] = [];
            }
            for (var flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] = [];
            }
        }

        for (var converterName in this.data.converters) {
            this.data.converters[converterName]["values"] = [];
        }

        this.data.timesteps = [];
    }

    /**
     * Calculates the net rate of change (dy/dt) for a given stock by summing
     * all its inflows and subtracting all its outflows.
     *
     * NOTE: Do NOT call dydt() on a conveyor stock. Conveyors use stepConveyor()
     * instead, which advances the internal pipeline queue.
     *
     * @method
     * @memberof Simulation
     * @param {Object} stock - A regular stock object containing inflows and outflows.
     * @returns {number} The computed net rate of change.
     */

    dydt(stock) {
        let inflows  = stock["inflows"];
        let outflows = stock["outflows"];

        let sumInflow = 0;
        for (var i in inflows) {
            // evalFlowInbound handles _isTransitIn / _isBatchIn correctly
            sumInflow += this.evalFlowInbound(inflows[i]);
        }

        let sumOutflow = 0;
        for (var i in outflows) {
            // outflows from a regular stock are always user-equation driven
            sumOutflow += this.parseAndEval(outflows[i]["equation"]);
        }

        return sumInflow - sumOutflow;
    }

    /**
     * Advances a conveyor stock by exactly one timestep using discrete pipeline
     * (delay queue) logic. This method is always called instead of dydt() for
     * conveyor stocks, regardless of the selected integration method.
     *
     * How it works:
     *   1. Pop the oldest slot from the front of the pipeline array. This chunk
     *      of material has now completed its transit time and exits the conveyor.
     *   2. Evaluate all user-defined inflows to find how much new material enters
     *      the conveyor this step.
     *   3. Push (sumInflow * dt) as a new slot onto the back of the pipeline.
     *   4. Subtract any user-defined explicit outflows (e.g. leaks) from the
     *      running total on top of the transit-completion drain.
     *   5. Compute and return: safeval + inflow*dt - transitOut - explicitOut*dt
     *
     * Pipeline invariant: pipeline.length === _slots at all times after initObjects.
     * The shift/push in steps 1 & 3 maintain this invariant.
     *
     * Why Euler for conveyors even in RK4 mode?
     *   The pipeline is a discrete delay structure, not a continuous ODE. There is
     *   no derivative to estimate at intermediate sub-steps — the transit completion
     *   is a hard boundary condition determined solely by position in the queue.
     *   Applying RK4's intermediate half-steps to a conveyor would silently double-
     *   shift the pipeline, producing incorrect results.
     *
     * @method
     * @memberof Simulation
     * @param {Object} stock - A conveyor stock object with `pipeline` and `_slots`.
     * @returns {number} The new safeval for this conveyor after one dt.
     */

    stepConveyor(stock) {
        // ── STELLA conveyor semantics ──────────────────────────────────────────
        // The pipeline is an ordered queue of slots, each holding (inflow * dt)
        // worth of material. The oldest slot exits each step (transit completion).
        // The outflow FROM the conveyor to the downstream stock is transit-driven;
        // it is NOT the user's valve equation. The user's valve equation on the
        // outflow arrow is ignored — it is replaced at runtime by the transit rate.
        //
        // Store transitOut on the stock so evalFlowRate() can return it when
        // the downstream stock asks for its inflow value from this conveyor.

        // 1. Pop oldest slot — this is the transit completion for this step
        let transitOut = stock["pipeline"].shift();
        stock["_lastTransitOut"] = transitOut;   // rate = transitOut / dt
        stock["_lastTransitRate"] = transitOut / this.dt;

        // 2. Evaluate inflows into this conveyor.
        // If an inflow is marked _isTransitIn or _isBatchIn, it is driven by an
        // upstream delay node's cached rate — not the user's equation.
        // evalFlowInbound() handles both cases uniformly.
        let sumInflow = 0;
        for (var flowName in stock["inflows"]) {
            sumInflow += this.evalFlowInbound(stock["inflows"][flowName]);
        }

        // 3. Push new inflow chunk onto back of pipeline
        stock["pipeline"].push(sumInflow * this.dt);

        // 4. Evaluate any NON-transit explicit outflows (leaks not via transit)
        let sumLeakOutflow = 0;
        for (var flowName in stock["outflows"]) {
            const flow = stock["outflows"][flowName];
            if (flow["_isTransitOut"]) continue;  // transit handled above
            sumLeakOutflow += this.parseAndEval(flow["equation"]);
        }

        // 5. New value = old value + material in - transit completion - leaks*dt
        let newVal = stock["safeval"]
                   + sumInflow * this.dt
                   - transitOut
                   - sumLeakOutflow * this.dt;

        if (stock["isNN"]) {
            newVal = Math.max(0, newVal);
        }

        return newVal;
    }

    /**
     * Advances a microwave (oven) stock by exactly one timestep using batch-delay
     * logic. This is always called instead of dydt() for microwave stocks.
     *
     * STELLA "oven" semantics — batch delay:
     *   - Material enters the microwave each step via its inflows.
     *   - All material currently in the oven is held for exactly cookTime.
     *   - When the cook timer expires, the entire batch exits (is released).
     *   - New inflows that arrive after a batch has been started are accumulated
     *     into the active batch (cooked together).
     *
     * @method
     * @memberof Simulation
     * @param {Object} stock - A microwave stock with `batch` and `_cookSteps`.
     * @returns {number} The new safeval for this microwave after one dt.
     */
    stepMicrowave(stock) {
        // ── STELLA oven semantics ──────────────────────────────────────────────
        // All material in the oven is held for exactly cookTime then released
        // as a batch. The outflow arrow from the microwave carries this batch
        // release rate; it is NOT the user's valve equation.
        //
        // We store _lastBatchRelease and _lastBatchRate so the downstream
        // stock's evalFlowRate() can read the actual release rate.

        // 1. Evaluate inflows into this microwave.
        // Inflows from upstream conveyors/microwaves are transit/batch driven.
        let sumInflow = 0;
        for (var flowName in stock["inflows"]) {
            sumInflow += this.evalFlowInbound(stock["inflows"][flowName]);
        }
        let inflowAmount = sumInflow * this.dt;

        // 2. Count down active batch
        let released = 0;
        if (stock["batch"] !== null) {
            stock["batch"].stepsRemaining -= 1;
            if (stock["batch"].stepsRemaining <= 0) {
                released = stock["batch"].amount;
                stock["batch"] = null;
            }
        }

        // 3. Absorb new inflow into batch
        if (inflowAmount > 0) {
            if (stock["batch"] === null) {
                stock["batch"] = {
                    amount: inflowAmount,
                    stepsRemaining: stock["_cookSteps"]
                };
            } else {
                stock["batch"].amount += inflowAmount;
            }
        }

        // Store release for downstream stock to read
        stock["_lastBatchRelease"] = released;
        stock["_lastBatchRate"]    = released / this.dt;

        // 4. Any non-batch explicit outflows (leaks)
        let sumLeakOutflow = 0;
        for (var flowName in stock["outflows"]) {
            const flow = stock["outflows"][flowName];
            if (flow["_isBatchOut"]) continue;  // batch handled above
            sumLeakOutflow += this.parseAndEval(flow["equation"]);
        }

        let newVal = stock["safeval"] + inflowAmount - released - sumLeakOutflow * this.dt;

        if (stock["isNN"]) {
            newVal = Math.max(0, newVal);
        }

        return newVal;
    }


    /**
     * Advances a queue stock by exactly one timestep.
     *
     * STELLA queue semantics:
     *   - Material flows IN at the user-defined inflow rate each step.
     *   - Normal outflows drain the queue by the user valve equation.
     *   - If inflow would push the total above capacity, the excess is
     *     immediately expelled via the overflow outflow at rate = overflow/dt.
     *   - _lastOverflowRate is cached so downstream stocks/charts can read it.
     *
     * @method
     * @memberof Simulation
     * @param {Object} stock - A queue stock object with `capacity`.
     * @returns {number} The new safeval for this queue after one dt.
     */
    stepQueue(stock) {
        // 1. Evaluate inflows (may include transit/batch from upstream delays)
        let sumInflow = 0;
        for (var flowName in stock["inflows"]) {
            sumInflow += this.evalFlowInbound(stock["inflows"][flowName]);
        }
        const inflowAmount = sumInflow * this.dt;

        // 2. Evaluate normal (non-overflow) outflows
        let sumNormalOutflow = 0;
        for (var flowName in stock["outflows"]) {
            const flow = stock["outflows"][flowName];
            if (flow["_isOverflowOut"]) continue;  // overflow computed below
            sumNormalOutflow += this.parseAndEval(flow["equation"]);
        }

        // 3. Tentative new value before overflow check
        let tentative = stock["safeval"] + inflowAmount - sumNormalOutflow * this.dt;

        // 4. Compute overflow: any material above capacity is expelled immediately
        const cap = (stock["capacity"] !== undefined && stock["capacity"] !== null)
            ? stock["capacity"] : Infinity;
        let overflowAmount = 0;
        if (tentative > cap) {
            overflowAmount = tentative - cap;
            tentative = cap;
        }
        // Cache overflow rate for downstream stocks and chart recording
        stock["_lastOverflowAmount"] = overflowAmount;
        stock["_lastOverflowRate"]   = overflowAmount / this.dt;

        // 5. Apply non-negative constraint
        let newVal = tentative;
        if (stock["isNN"]) {
            newVal = Math.max(0, newVal);
        }

        return newVal;
    }

    /** so upstream delay nodes are always processed before
     * downstream ones.
     *
     * Why topological ordering is required:
     *   In a chain like A (conveyor) → B (microwave) → C (conveyor), node B's
     *   inflow depends on A's _lastTransitRate and C's inflow depends on B's
     *   _lastBatchRate.  If we step B before A, B reads stale data from the
     *   previous timestep.  Topological sort guarantees we always step A, then
     *   B, then C within the same timestep.
     *
     * Algorithm:
     *   1. Build a dependency graph: for each delay node, check its inflows for
     *      _isTransitIn / _isBatchIn — those name their upstream delay node.
     *   2. Kahn's algorithm (BFS) to emit a topological order.
     *   3. Step each node in that order; commit value + safeval immediately so
     *      the next node in the sequence reads the updated rates.
     *
     * @method
     * @memberof Simulation
     */
    stepDelaysInOrder() {
        const stocks = this.data.stocks;

        // Collect all delay node names (conveyor, microwave, and queue)
        const delayNames = Object.keys(stocks).filter(
            n => stocks[n]["isConveyor"] || stocks[n]["isMicrowave"] || stocks[n]["isQueue"]
        );

        if (delayNames.length === 0) return;

        // Build adjacency: upstream → [downstream, ...]
        // and in-degree count for Kahn's algorithm.
        const inDeg = {};
        const children = {};   // upstream → list of downstream delay names
        for (const n of delayNames) {
            inDeg[n]    = 0;
            children[n] = [];
        }

        for (const n of delayNames) {
            const stock = stocks[n];
            for (const flowName in stock["inflows"]) {
                const f = stock["inflows"][flowName];
                const up = f["_upstreamStock"];
                if (up && (f["_isTransitIn"] || f["_isBatchIn"] || f["_isOverflowIn"]) && inDeg[n] !== undefined) {
                    // n depends on up — up must be stepped first
                    if (children[up] !== undefined) {
                        children[up].push(n);
                        inDeg[n]++;
                    }
                }
            }
        }

        // Kahn's BFS topological sort
        const queue  = delayNames.filter(n => inDeg[n] === 0);
        const order  = [];
        while (queue.length > 0) {
            const node = queue.shift();
            order.push(node);
            for (const child of children[node]) {
                inDeg[child]--;
                if (inDeg[child] === 0) queue.push(child);
            }
        }

        // If there are cycles (shouldn't happen in valid models), append
        // remaining nodes so simulation still runs rather than silently dropping them.
        for (const n of delayNames) {
            if (!order.includes(n)) order.push(n);
        }

        // Step each delay node in order, committing immediately so downstream
        // nodes in the same timestep read fresh rates.
        for (const stockName of order) {
            const stock = stocks[stockName];
            let nextVal;
            if (stock["isConveyor"]) {
                nextVal = this.stepConveyor(stock);
            } else if (stock["isMicrowave"]) {
                nextVal = this.stepMicrowave(stock);
            } else {
                nextVal = this.stepQueue(stock);
            }
            stock["values"].push(nextVal);
            stock["safeval"] = nextVal;
        }
    }

    /**
     * Runs the simulation using Euler's method for numerical integration.
     * Iterates from startTime+dt to endTime, updating all stocks, flows, and converters.
     *
     * Conveyor stocks are always stepped using stepConveyor() which uses discrete
     * pipeline logic. All other stocks use the standard Euler formula.
     *
     * To prevent order-of-iteration artifacts, conveyor next-values are computed
     * into a temporary dictionary and committed only after all regular stocks in
     * the same timestep have been updated. This ensures every node reads from the
     * same safeval snapshot regardless of iteration order.
     *
     * @method
     * @memberof Simulation
     */

    euler() {
        for (var t = this.startTime + this.dt; parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5)); t += this.dt) {
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            // ── Step 1: delay nodes in dependency order ───────────────────────────
            // Step upstream delay nodes before downstream ones so that a chained
            // conveyor→microwave, microwave→conveyor, conveyor→conveyor, or
            // microwave→microwave always reads the freshly-computed _lastTransitRate
            // / _lastBatchRate from its upstream neighbour, not the stale previous
            // timestep value.  stepDelaysInOrder() performs a topological sort.
            this.stepDelaysInOrder();

            // ── Step 2: regular stocks Euler step ────────────────────────────────
            let regularNextVals = {};
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                let next = stock["safeval"] + this.dydt(stock) * this.dt;
                if (stock["isNN"]) next = Math.max(0, next);
                regularNextVals[stockName] = next;
            }

            for (var stockName in regularNextVals) {
                this.data.stocks[stockName]["values"].push(regularNextVals[stockName]);
                this.data.stocks[stockName]["safeval"] = regularNextVals[stockName];
            }

            // ── Step 3: record flow values ────────────────────────────────────────
            for (var stockName in this.data.stocks) {
                this.recordFlowValues(stockName);
            }

            // ── Step 4: update converters ─────────────────────────────────────────
            for (var converter in this.data.converters) {
                this.data.converters[converter]["values"].push(
                    this.parseAndEval(this.data.converters[converter]["equation"])
                );
            }
        }
    }

    /**
     * Runs the simulation using the 4th-order Runge-Kutta method.
     * Regular stocks receive the full RK4 treatment for improved accuracy.
     *
     * Conveyor stocks are always stepped using stepConveyor() (Euler / discrete
     * pipeline logic) regardless of this setting, for two reasons:
     *   1. The pipeline is a discrete delay structure, not a continuous ODE —
     *      RK4 intermediate sub-steps have no meaningful interpretation for it.
     *   2. Applying RK4's half-step safeval mutations to a conveyor would
     *      incorrectly advance the pipeline multiple times per timestep.
     *
     * Ordering: regular stocks complete all four RK4 stages and have their
     * safevals updated BEFORE conveyors are stepped. This means any conveyor
     * inflow equation that references a regular stock reads the most accurate
     * (RK4-quality) value available for that stock.
     *
     * @method
     * @memberof Simulation
     */

    rk4() {
        for (var t = this.startTime + this.dt; parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5)); t += this.dt) {
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            let y0_dict = {};
            let k1_dict = {};
            let k2_dict = {};
            let k3_dict = {};
            let k4_dict = {};

            // ── Snapshot y0 for all stocks ────────────────────────────────────────
            // Conveyors are included so other equations can reference them, but
            // their safevals are NOT mutated during k1-k4 intermediate passes.
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                y0_dict[stockName] = stock["safeval"];
            }

            // ── k1 ────────────────────────────────────────────────────────────────
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                k1_dict[stockName] = this.dydt(stock) * this.dt;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                stock["safeval"] = y0_dict[stockName] + k1_dict[stockName] / 2;
            }

            // ── k2 ────────────────────────────────────────────────────────────────
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                k2_dict[stockName] = this.dydt(stock) * this.dt;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                stock["safeval"] = y0_dict[stockName] + k2_dict[stockName] / 2;
            }

            // ── k3 ────────────────────────────────────────────────────────────────
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                k3_dict[stockName] = this.dydt(stock) * this.dt;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                stock["safeval"] = y0_dict[stockName] + k3_dict[stockName];
            }

            // ── k4 ────────────────────────────────────────────────────────────────
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                k4_dict[stockName] = this.dydt(stock) * this.dt;
            }

            // ── Commit RK4 final values for regular stocks ────────────────────────
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;

                if (stock["isNN"] == true) {
                    stock["values"].push(Math.max(0, y0_dict[stockName] + (k1_dict[stockName] + 2 * k2_dict[stockName] + 2 * k3_dict[stockName] + k4_dict[stockName]) / 6));
                } else {
                    stock["values"].push(y0_dict[stockName] + (k1_dict[stockName] + 2 * k2_dict[stockName] + 2 * k3_dict[stockName] + k4_dict[stockName]) / 6);
                }
            }

            // ── Update regular stock safevals before stepping conveyors ───────────
            // Conveyors that reference regular stocks in their inflow equations
            // now see the fully RK4-accurate values.
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isConveyor"] || stock["isMicrowave"] || stock["isQueue"]) continue;
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            // ── Step all delay nodes (conveyor + microwave) in dependency order ────
            // Topological ordering ensures chained delay nodes are always stepped
            // upstream-first so transit/batch rates are fresh for each downstream node.
            this.stepDelaysInOrder();

            // ── Record flow values for this timestep ─────────────────────────────
            for (var stockName in this.data.stocks) {
                this.recordFlowValues(stockName);
            }

            // ── Update converters ────────────────────────────────────────────────
            for (var converter in this.data.converters) {
                this.data.converters[converter]["values"].push(
                    this.parseAndEval(this.data.converters[converter]["equation"])
                );
            }
        }
    }

    /**
     * Loads a structured model dataset and initializes internal simulation parameters.
     * Also triggers a full reset of the simulation state.
     *
     * @method
     * @memberof Simulation
     * @param {Object} structData - The structured model data object.
     */

    setData(structData) {
        this.data = structData;
        this.dt = parseFloat(structData.dt);
        this.startTime = parseFloat(structData.start_time);
        this.endTime = parseFloat(structData.end_time);
        this.reset();
    }

    /**
     * Executes the full simulation using the configured integration method.
     * Returns a deep copy of the resulting data.
     *
     * @method
     * @returns {Object} The completed simulation output data.
     * @memberof Simulation
     */

    run() {
        this.initObjects(); // set initial values

        this.data["timesteps"] = [this.startTime];

        if (this.data["integration_method"] == "euler") {
            this.euler();
        } else if (this.data["integration_method"] == "rk4") {
            this.rk4();
        }

        // return a copy of this.data
        return JSON.parse(JSON.stringify(this.data));
    }
}
