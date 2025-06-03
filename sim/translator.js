/* Author: Karthik S. Vedula
 * Converts the json file exported by gojs (from editor.js) to a json data file that can be used by engine.js
 * Caution! This uses label and not keys to identify nodes, as the user identifies nodes by label in equations.
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

            res.variables.push({equation: node.equation, label: node.label});

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
                }
                if(obj.nodeDataArray[h].key == link.from){
                    currentInfluence.from = obj.nodeDataArray[h].key;
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