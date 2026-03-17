/**
 * @fileoverview Pure simulation engine — no DOM dependencies.
 * Safe to import in Web Workers.
 */

export class Simulation {
    constructor() {
        this.data;
        this.dt;
        this.startTime;
        this.endTime;
        this._onError = null; // injectable error handler
    }

    _reportError(msg) {
        if (this._onError) {
            this._onError(msg);
        }
        throw new Error(msg);
    }

    safeEval(expression) {
        expression = expression.replaceAll("--", "+");
        expression = expression
            .replaceAll(/(?<!Math\.)\basinh\b/gi, 'Math.asinh')
            .replaceAll(/(?<!Math\.)\bacosh\b/gi, 'Math.acosh')
            .replaceAll(/(?<!Math\.)\batanh\b/gi, 'Math.atanh')
            .replaceAll(/(?<!Math\.)\bsinh\b/gi, 'Math.sinh')
            .replaceAll(/(?<!Math\.)\bcosh\b/gi, 'Math.cosh')
            .replaceAll(/(?<!Math\.)\btanh\b/gi, 'Math.tanh')
            .replaceAll(/(?<!Math\.)\basin\b/gi, 'Math.asin')
            .replaceAll(/(?<!Math\.)\bacos\b/gi, 'Math.acos')
            .replaceAll(/(?<!Math\.)\batan\b/gi, 'Math.atan')
            .replaceAll(/(?<!Math\.)\bsin\b/gi, 'Math.sin')
            .replaceAll(/(?<!Math\.)\bcos\b/gi, 'Math.cos')
            .replaceAll(/(?<!Math\.)\btan\b/gi, 'Math.tan')
            .replaceAll(/(?<!Math\.)\bsec\b/gi, 'Math.sec')
            .replaceAll(/(?<!Math\.)\bcsc\b/gi, 'Math.csc')
            .replaceAll(/(?<!Math\.)\bcot\b/gi, 'Math.cot')
            .replaceAll(/(?<!Math\.)\bsqrt\b/gi, 'Math.sqrt')
            .replaceAll(/(?<!Math\.)\bcbrt\b/gi, 'Math.cbrt')
            .replaceAll(/(?<!Math\.)\bmax\b/gi, 'Math.max')
            .replaceAll(/(?<!Math\.)\bmin\b/gi, 'Math.min')
            .replaceAll(/(?<!Math\.)\bpi\b/gi, 'Math.PI')
            .replaceAll(/(?<!Math\.)\be\b/gi, 'Math.E')
            .replaceAll(/(?<!Math\.)\bexp\b/gi, 'Math.exp')
            .replaceAll(/(?<!Math\.)\blog\b/gi, 'Math.log')
            .replaceAll(/(?<!Math\.)\blog10\b/gi, 'Math.log10')
            .replaceAll(/(?<!Math\.)\babs\b/gi, 'Math.abs')
            .replaceAll(/(?<!Math\.)\bceil\b/gi, 'Math.ceil')
            .replaceAll(/(?<!Math\.)\bfloor\b/gi, 'Math.floor')
            .replaceAll(/(?<!Math\.)\bround\b/gi, 'Math.round')
            .replaceAll(/(?<!Math\.)\bpow\b/gi, 'Math.pow')
            .replaceAll(/(?<!Math\.)\brandom\b/gi, 'Math.random')
            .replaceAll(/(?<!Math\.)\bhypot\b/gi, 'Math.hypot')
            .replaceAll(/(?<!Math\.)\bexpm1\b/gi, 'Math.expm1')
            .replaceAll(/(?<!Math\.)\blog1p\b/gi, 'Math.log1p')
            .replaceAll(/(?<!Math\.)\bsign\b/gi, 'Math.sign');

        Math.sec = x => 1 / Math.cos(x);
        Math.csc = x => 1 / Math.sin(x);
        Math.cot = x => 1 / Math.tan(x);

        try {
            return eval?.(expression);
        } catch(e) {
            console.log(e);
            return NaN;
        }
    }

    parseObject(equation, history = []) {
        let objects = {};

        for (var stock in this.data.stocks) {
            objects[stock] = this.data.stocks[stock]["safeval"];
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

        let sortedObjects = Object.keys(objects)
            .sort((a, b) => a.length - b.length).reverse();

        for (var object of sortedObjects) {
            if (equation.includes("[" + object + "]")) {
                equation = equation.replaceAll(
                    "[" + object + "]",
                    this.parseAndEval('(' + objects[object] + ')', history.slice())
                );
            }
        }

        return equation;
    }

    parseAndEval(equation, history = []) {
        if (history.includes(equation)) {
            history.push(equation);
            this._reportError("Circular Definition Detected: " + equation);
        }
        history.push(equation);

        const parsedEquation = this.parseObject(equation, history);
        const res = this.safeEval(parsedEquation);

        if (isNaN(res)) {
            this._reportError("Invalid equation: " + equation +
                " | Parsed: " + parsedEquation);
        }
        return res;
    }

    initObjects() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            let value = this.parseAndEval(stock["equation"]);
            if (stock["isNN"] == true) value = Math.max(0, value);
            stock["safeval"] = value;
            stock["values"] = [value];
        }

        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            for (var flowName in stock["inflows"]) {
                this.data.stocks[stockName]["inflows"][flowName]["values"] =
                    [this.parseAndEval(this.data.stocks[stockName]["inflows"][flowName]["equation"])];
            }
            for (var flowName in stock["outflows"]) {
                this.data.stocks[stockName]["outflows"][flowName]["values"] =
                    [this.parseAndEval(this.data.stocks[stockName]["outflows"][flowName]["equation"])];
            }
        }

        for (var converterName in this.data.converters) {
            this.data.converters[converterName]["values"] =
                [this.parseAndEval(this.data.converters[converterName]["equation"])];
        }
    }

    reset() {
        for (var stockName in this.data.stocks) {
            let stock = this.data.stocks[stockName];
            stock["safeval"] = null;
            stock["values"] = [];
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

    dydt(stock) {
        let inflows = stock["inflows"];
        let outflows = stock["outflows"];
        let sumInflow = 0;
        for (var i in inflows) sumInflow += this.parseAndEval(inflows[i]["equation"]);
        let sumOutflow = 0;
        for (var i in outflows) sumOutflow += this.parseAndEval(outflows[i]["equation"]);
        return sumInflow - sumOutflow;
    }

    euler() {
        for (var t = this.startTime + this.dt;
             parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5));
             t += this.dt) {
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                if (stock["isNN"] == true) {
                    stock["values"].push(Math.max(0, stock["safeval"] + this.dydt(stock) * this.dt));
                } else {
                    stock["values"].push(stock["safeval"] + this.dydt(stock) * this.dt);
                }
            }

            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            for (var stockName in this.data.stocks) {
                for (var inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"]
                        .push(this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"]));
                }
                for (var outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"]
                        .push(this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"]));
                }
            }

            for (var converter in this.data.converters) {
                this.data.converters[converter]["values"]
                    .push(this.parseAndEval(this.data.converters[converter]["equation"]));
            }
        }
    }

    rk4() {
        for (var t = this.startTime + this.dt;
             parseFloat(t.toFixed(5)) <= parseFloat(this.endTime.toFixed(5));
             t += this.dt) {
            this.data.timesteps.push(parseFloat(t.toFixed(5)));

            let y0_dict = {}, k1_dict = {}, k2_dict = {}, k3_dict = {}, k4_dict = {};

            for (var stockName in this.data.stocks) {
                y0_dict[stockName] = this.data.stocks[stockName]["safeval"];
            }

            for (var stockName in this.data.stocks) {
                k1_dict[stockName] = this.dydt(this.data.stocks[stockName]) * this.dt;
            }
            for (var stockName in this.data.stocks) {
                this.data.stocks[stockName]["safeval"] =
                    y0_dict[stockName] + k1_dict[stockName] / 2;
            }

            for (var stockName in this.data.stocks) {
                k2_dict[stockName] = this.dydt(this.data.stocks[stockName]) * this.dt;
            }
            for (var stockName in this.data.stocks) {
                this.data.stocks[stockName]["safeval"] =
                    y0_dict[stockName] + k2_dict[stockName] / 2;
            }

            for (var stockName in this.data.stocks) {
                k3_dict[stockName] = this.dydt(this.data.stocks[stockName]) * this.dt;
            }
            for (var stockName in this.data.stocks) {
                this.data.stocks[stockName]["safeval"] =
                    y0_dict[stockName] + k3_dict[stockName];
            }

            for (var stockName in this.data.stocks) {
                k4_dict[stockName] = this.dydt(this.data.stocks[stockName]) * this.dt;
            }

            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                const newVal = y0_dict[stockName] +
                    (k1_dict[stockName] + 2 * k2_dict[stockName] +
                        2 * k3_dict[stockName] + k4_dict[stockName]) / 6;
                stock["values"].push(stock["isNN"] ? Math.max(0, newVal) : newVal);
            }

            for (var stockName in this.data.stocks) {
                let stock = this.data.stocks[stockName];
                stock["safeval"] = stock["values"][stock["values"].length - 1];
            }

            for (var stockName in this.data.stocks) {
                for (var inflow in this.data.stocks[stockName]["inflows"]) {
                    this.data.stocks[stockName]["inflows"][inflow]["values"]
                        .push(this.parseAndEval(this.data.stocks[stockName]["inflows"][inflow]["equation"]));
                }
                for (var outflow in this.data.stocks[stockName]["outflows"]) {
                    this.data.stocks[stockName]["outflows"][outflow]["values"]
                        .push(this.parseAndEval(this.data.stocks[stockName]["outflows"][outflow]["equation"]));
                }
            }

            for (var converter in this.data.converters) {
                this.data.converters[converter]["values"]
                    .push(this.parseAndEval(this.data.converters[converter]["equation"]));
            }
        }
    }

    setData(structData) {
        this.data = structData;
        this.dt = parseFloat(structData.dt);
        this.startTime = parseFloat(structData.start_time);
        this.endTime = parseFloat(structData.end_time);
        this.reset();
    }

    run() {
        this.initObjects();
        this.data["timesteps"] = [this.startTime];
        if (this.data["integration_method"] == "euler") {
            this.euler();
        } else {
            this.rk4();
        }
        return JSON.parse(JSON.stringify(this.data));
    }
}