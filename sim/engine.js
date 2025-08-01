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
            .replaceAll(/(?<!Math\.)\bsign\b/gi, 'Math.sign')


        try {
            return eval?.(expression);
        } catch (e) {
            console.log(e);
            return NaN;
        }
    }

    /**
     * Recursively replaces all references to variables, stocks, inflows, and outflows
     * in the equation with their actual equation expressions or initial values.
     *
     * @method
     * @memberof Simulation
     * @param {string} equation - The expression to resolve.
     * @param {string[]} [history=[]] - Keeps track of recursion depth and avoids circular references.
     * @returns {string} A fully-resolved equation string ready for evaluation.
     * @memberOf module:engine
     */

    parseObject(equation, history = []) {
        let objects = {} // stores all stocks, converters, and flows and their respective equation/safeval

        for (var stock in this.data.stocks) {
            objects[stock] = this.data.stocks[stock]["safeval"];

            // add the inflows and outflows to the available objects
            for (var flow in this.data.stocks[stock]["inflows"]) {
                objects[flow] = this.data.stocks[stock]["inflows"][flow]["equation"];
            }
            for (var flow in this.data.stocks[stock]["outflows"]) {
                objects[flow] = this.data.stocks[stock]["outflows"][flow]["equation"];
            }

        }

        for (var converter in this.data.converters) {
            objects[converter] = this.data.converters[converter]["equation"];
        }

        let sortedObjects = Object.keys(objects).sort((a, b) => a.length - b.length).reverse() // sort by length (descending) to prevent substring errors

        // Call parseObject recursively on all objects to replace the names with their respective values
        for (var object of sortedObjects) {
            if (equation.includes("[" + object + "]")) {
                equation = equation.replaceAll("[" + object + "]", this.parseAndEval('(' + objects[object] + ')', history.slice())); // RECURSIVE
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
     * Initializes the simulation state by evaluating all stock, flow, and converter
     * equations for timestep 0. Stores initial values and performs safety checks.
     *
     * @method
     * @memberof Simulation
     * @throws Will show a popup and throw if any value cannot be resolved.
     * @memberOf module:engine
     */

    initObjects() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            let value = this.parseAndEval(stock["equation"]);

            if (stock["isNN"] == true) {
                value = Math.max(0, value);
            }
            
            stock["safeval"] = value;
            stock["values"] = [value];
        }

        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            // initialize flows
            for (var flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] = [this.parseAndEval(this.data.stocks[stockName]["inflows"][flowName]["equation"])];
            }
            for (var flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] = [this.parseAndEval(this.data.stocks[stockName]["outflows"][flowName]["equation"])];
            }
        }

        for (var converterName in this.data.converters) {
            this.data.converters[converterName]["values"] = [this.parseAndEval(this.data.converters[converterName]["equation"])];
        }

        // check if any values are null 
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
                    showSimErrorPopup()
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
     * Resets the simulation to its initial state by clearing all values
     * and resetting all `safeval` fields to null.
     *
     * @method
     * @memberOf module:engine
     */

    reset() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];

            stock["safeval"] = null;
            stock["values"] = [];

            // initialize flows
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
     * all its inflows and outflows using current values.
     *
     * @method
     * @memberof Simulation
     * @param {Object} stock - A stock object containing inflows and outflows.
     * @returns {number} The computed net change for the stock.
     * @memberof Simulation
     */

    dydt(stock) {
        // Locally define the inflow and outflows in stock
        let inflows = stock["inflows"];
        let outflows = stock["outflows"];

        // Use eval to get value of flows
        let sumInflow = 0;
        for (var i in inflows) {
            sumInflow += this.parseAndEval(inflows[i]["equation"]);
        }

        let sumOutflow = 0;
        for (var i in outflows) {
            sumOutflow += this.parseAndEval(outflows[i]["equation"]);
        }

        return sumInflow - sumOutflow;
    }

    /**
     * Runs the simulation using Euler's method for numerical integration.
     * Iterates from startTime to endTime, updating all stocks, flows, and converters.
     *
     * @method
     * @memberof Simulation
     */

    euler() {
        for (var t = this.startTime + this.dt; parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5)); t += this.dt) { // (skip start time as that was covered in this.initObjects())
            this.data.timesteps.push(parseFloat(t.toFixed(5)));
            
            // Calculate new values for all stocks
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                if (stock["isNN"] == true) { // check if stock is non-negative
                    stock["values"].push(Math.max(0,(stock["safeval"] + this.dydt(stock) * this.dt)));
                } else {
                    stock["values"].push(stock["safeval"] + this.dydt(stock) * this.dt);
                }
            }

            // Update safeval for next iteration
            for (var stockName in this.data.stocks) { 
                let stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            // Update values for all flows
            for (var stockName in this.data.stocks) {
                for (var inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"]));
                }
                for (var outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"]));
                }
            }

            // Update the values of all converters
            for (var converter in this.data.converters) {
                let converterEq = this.data.converters[converter]["equation"];
                this.data.converters[converter]["values"].push(this.parseAndEval(converterEq));
            }

        }
    }

    /**
     * Runs the simulation using the 4th-order Runge-Kutta method.
     * Provides more accurate results than Euler's method for the same step size.
     *
     * @method
     * @memberof Simulation
     */

    rk4() {
        for (var t = this.startTime + this.dt; parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5)); t += this.dt) { // use high precision to make sure correct number of iterations
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            let y0_dict = {};
            let k1_dict = {};
            let k2_dict = {};
            let k3_dict = {};
            let k4_dict = {};

            // Set y0 for every stock
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                y0_dict[stockName] = stock["safeval"];
            }

            // k1
            for (var stockName in this.data.stocks) { // calculate k1-values for all stocks (perform for all stocks before updating safeval)
                let stock = this.data.stocks[stockName];

                // Calculate constants
                let k1 = this.dydt(stock) * this.dt;
                k1_dict[stockName] = k1;
            }
            for (var stockName in this.data.stocks) { // update safevals with new k1 values
                let stock = this.data.stocks[stockName];
                stock["safeval"] = y0_dict[stockName] + k1_dict[stockName] / 2;
            }

            // k2
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                let k2 = this.dydt(stock) * this.dt;
                k2_dict[stockName] = k2;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                stock["safeval"] = y0_dict[stockName] + k2_dict[stockName] / 2;
            }

            // k3
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                let k3 = this.dydt(stock) * this.dt;
                k3_dict[stockName] = k3;
            }
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                stock["safeval"] = y0_dict[stockName] + k3_dict[stockName];
            }

            // k4
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                let k4 = this.dydt(stock) * this.dt;
                k4_dict[stockName] = k4;
            }

            // final value
            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];

                if (stock["isNN"] == true) { // check if stock is non-negative
                    stock["values"].push(Math.max(0, y0_dict[stockName] + (k1_dict[stockName] + 2 * k2_dict[stockName] + 2 * k3_dict[stockName] + k4_dict[stockName]) / 6));
                } else {
                    stock["values"].push(y0_dict[stockName] + (k1_dict[stockName] + 2 * k2_dict[stockName] + 2 * k3_dict[stockName] + k4_dict[stockName]) / 6);
                }
            }
            

            // Update safeval for next iteration
            for (var stockName in this.data.stocks) { 
                let stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            // Update values for all flows
            for (var stockName in this.data.stocks) {
                for (var inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"]));
                }
                for (var outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"].push(this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"]));
                }
            }

            // Update the values of all converters
            for (var converter in this.data.converters) {
                let converterEq = this.data.converters[converter]["equation"];
                this.data.converters[converter]["values"].push(this.parseAndEval(converterEq));
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