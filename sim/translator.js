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
                if(obj.nodeDataArray[h].label == link.from){
                    currentInfluence.from = obj.nodeDataArray[h].label;
                }
            }
            res.influences.push(currentInfluence);
        }

        if (link.category == "flow") {
            // get the flow equation from the link (in the corresponding valve in node data array)
            var flowEq;
            var flowName;
            var isUniflow;
            for (var j = 0; j < obj.nodeDataArray.length; j++) { // find the corresponding valve
                if (obj.nodeDataArray[j].key == link.labelKeys[0]) {
                    flowEq = obj.nodeDataArray[j].equation;
                    flowName = obj.nodeDataArray[j].label.toString();
                    isUniflow = obj.nodeDataArray[j].checkbox;
                    break;
                }
            }

            if (flowName[0] === "$") {
                // get the corresponding info on flowEq and isUniflow from the non-ghost flow
                for (var j = 0; j < obj.nodeDataArray.length; j++) {
                    if (obj.nodeDataArray[j].label == flowName.substring(1)) {
                        flowEq = obj.nodeDataArray[j].equation;
                        flowName = obj.nodeDataArray[j].label.toString();
                        isUniflow = obj.nodeDataArray[j].checkbox;
                        break;
                    }
                }
            }

            // add a '#' to the flow equation if it is a uniflow (processed in engine.js)
            if (isUniflow) {
                flowEq = "Math.max(0," + flowEq + ")";
            }

            // check if the from is a stock
            var stockName = stockKeyToName[link.from];
            if (stockName !== undefined) {
                if (stockName[0] === "$") {
                    stockName = stockName.substring(1);
                }

                // add the flow to the outflows of the source
                res.stocks[stockName].outflows[flowName] = {
                    "equation": flowEq,
                    "values": []
                }
            }

            // check if the to is a stock
            stockName = stockKeyToName[link.to];
            if (stockName !== undefined) {
                if (stockName[0] === "$") {
                    stockName = stockName.substring(1);
                }

                // add the flow to the inflows of the destination
                res.stocks[stockName].inflows[flowName] = {
                    "equation": flowEq,
                    "values": []
                }
            }
        }
    }

    return res;
}