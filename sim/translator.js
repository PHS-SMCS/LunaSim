/**
 * @fileoverview Translates the GOJS model into JSON for processing
 * @module translator
 * @author Authors: Karthik S.Vedula, Ryan Chung, Arjun Mujudar, Akash Saran
 */
/**
 * Converts a GoJS diagram JSON object into a structured simulation-ready format.
 *
 * Extracts stocks, variables, converters, valves, and influences from the diagram model.
 * This function relies on node labels (not keys) for equation referencing,
 * and handles ghost nodes (prefixed with `$`) by resolving them to real nodes when needed.
 *
 * The output object is compatible with the simulation engine used in `engine.js`.
 *
 * @function
 * @memberof module:translator
 * @param {Object} obj - The JSON object representing a GoJS model, typically from `myDiagram.model.toJson()`.
 * @returns {Object} A structured object containing:
 * - `stocks`: stock definitions keyed by label
 * - `converters`: variable-equivalent nodes for plotting
 * - `variables`: array of raw variables with key, label, and equation
 * - `valves`: array of flow controllers (valves)
 * - `influences`: influence connections between nodes
 * - `labelsandkeys`: mapping of label-to-key used for reference resolution
 *
 * @example
 * const engineJson = translate(myDiagram.model.toJson());
 */

export function translate(obj) {
    var res = {
        "stocks": {},
        "converters": {},
        "variables":[],
        "influences":[],
        "valves":[],
        "labelsandkeys": []
    };

    class influence {
        to;
        toEq;
        from;
        tolabel;
        fromlabel;
    }
    var valves = obj.nodeDataArray.filter(node => node.category === "valve");

    // the rest of the information (start and end times, dt, and integration method ae added lator in editor.js)

    var stockKeyToName = {}; // used for checking of a stock exists in the model (specifically in the inflows and outflows)

    // add all the stocks and converters to the res object
    for (var i = 0; i < obj.nodeDataArray.length; i++) {
        var node = obj.nodeDataArray[i];

        if (node.category == "stock") {
            res.labelsandkeys.push({key: node.key, label: node.label});

            stockKeyToName[node.key] = node.label;

            if (node.label[0] === "$") {
                continue;
            }

            res.stocks[node.label.toString()] = {
                "isNN": node.checkbox,
                "values": [],
                "safeval": null,
                "equation": node.equation,
                "inflows": {},
                "outflows": {}
            };
        }
        if (node.category == "variable") {

            res.labelsandkeys.push({key: node.key, label: node.label});

            res.variables.push({key: node.key, equation: node.equation, label: node.label});

            if (node.label[0] === "$") {
                continue;
            }

            res.converters[node.label.toString()] = {
                "values": [],
                "equation": node.equation
            };
        }

        if (node.category == "valve") {
            res.valves.push({equation: node.equation, label: node.label, key: node.key});
            res.labelsandkeys.push({key: node.key, label: node.label});

        }


    }

    // add all the flows to the res object
    for (var i = 0; i < obj.linkDataArray.length; i++) {
        var link = obj.linkDataArray[i];

        if (link.category == "influence") {
            var currentInfluence = new influence;

            for (var h =0; h< obj.nodeDataArray.length; h++){
                if(obj.nodeDataArray[h].key == link.to){
                    currentInfluence.to = obj.nodeDataArray[h].key;
                    currentInfluence.toEq = obj.nodeDataArray[h].equation;
                    currentInfluence.tolabel = obj.nodeDataArray[h].label;
                }
                if(obj.nodeDataArray[h].key == link.from){
                    currentInfluence.from = obj.nodeDataArray[h].key;
                    currentInfluence.fromlabel = obj.nodeDataArray[h].label;
                }
            }
            res.influences.push(currentInfluence);
        }

        if (link.category == "flow") {
            if (!link.labelKeys || link.labelKeys.length === 0) continue;

            const valveKey = link.labelKeys[0];
            const valveNode = obj.nodeDataArray.find(n => n.key === valveKey);
            if (!valveNode) {
                console.warn(`⚠️ Flow link with valveKey ${valveKey} not found. Skipping.`);
                continue;
            }

            let flowEq = valveNode.equation;
            let flowName = valveNode.label.toString();
            let isUniflow = valveNode.checkbox;

            // Ghost valve? Use its non-ghost counterpart
            if (flowName[0] === "$") {
                const ghostRef = obj.nodeDataArray.find(n => n.label === flowName.substring(1));
                if (ghostRef) {
                    flowEq = ghostRef.equation;
                    flowName = ghostRef.label.toString();
                    isUniflow = ghostRef.checkbox;
                }
            }

            if (isUniflow) {
                flowEq = "Math.max(0," + flowEq + ")";
            }

            // add to stock outflows/inflows
            let stockName = stockKeyToName[link.from];
            if (stockName) {
                if (stockName[0] === "$") stockName = stockName.substring(1);
                res.stocks[stockName].outflows[flowName] = { equation: flowEq, values: [] };
            }

            stockName = stockKeyToName[link.to];
            if (stockName) {
                if (stockName[0] === "$") stockName = stockName.substring(1);
                res.stocks[stockName].inflows[flowName] = { equation: flowEq, values: [] };
            }
        }

    }

    return res;
}