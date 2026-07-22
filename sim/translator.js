/**
 * @fileoverview Translates the GOJS model into JSON for processing
 * @module translator
 * @author Authors: Karthik S.Vedula, Ryan Chung, Arjun Mujudar, Akash Saran
 */

/**
 * Converts a GoJS diagram JSON object into a structured simulation-ready format.
 *
 * STELLA semantics implemented here:
 *
 * Regular stock  — reservoir that accumulates/drains via user-defined flow rates.
 *
 * Conveyor       — pipeline delay. Material flows IN at a user-defined rate and
 *                  exits automatically after `transitTime` has elapsed, slot by
 *                  slot. The outflow arrow from a conveyor carries the transit-
 *                  completion rate; its valve equation is ignored by the engine
 *                  (the engine computes the rate from pipeline[0]/dt). Placed in
 *                  res.stocks with isConveyor:true.
 *
 * Microwave      — batch delay (STELLA "oven"). Material flows IN at a user-
 *                  defined rate and is held for exactly `cookTime`. When the
 *                  timer expires the entire batch exits at once. The outflow arrow
 *                  valve equation is ignored; the engine computes it from the
 *                  batch state. Placed in res.stocks with isMicrowave:true.
 *
 * Cloud          — source/sink boundary. Not placed in res.stocks. Flows
 *                  to/from clouds are wired only on the stock/conveyor/microwave
 *                  side.
 *
 * Queue           — capacity-bounded accumulator. Placed in res.stocks with
 *                  isQueue:true and a capacity field. Normal outflows use the
 *                  user valve equation. An overflow outflow (valve._isOverflow)
 *                  is driven by the engine's computed _lastOverflowRate.
 *
 * Flow wiring rules:
 *   link.from → stock/conveyor/microwave  : adds to that node's outflows
 *   link.to   → stock/conveyor/microwave  : adds to that node's inflows
 *   link.from → cloud (source)            : no outflow entry needed
 *   link.to   → cloud (sink)              : no inflow entry needed
 *
 * For a conveyor's outflow and a microwave's outflow, the engine uses
 * _lastTransitRate / _lastBatchRate instead of the valve equation, so we
 * mark those flow entries with _isTransitOut / _isBatchOut flags.
 * For a downstream stock's inflow that comes FROM a conveyor/microwave, we
 * mark it _isTransitIn / _isBatchIn with _upstreamStock so evalFlowRate()
 * can resolve the correct rate.
 *
 * @function
 * @memberof module:translator
 * @param {Object} obj - GoJS model JSON from myDiagram.model.toJson()
 * @returns {Object} Structured simulation-ready object.
 */
export function translate(obj) {
    var res = {
        "stocks": {},
        "converters": {},
        "variables": [],
        "influences": [],
        "valves": [],
        "labelsandkeys": []
    };

    class influence {
        to; toEq; from; tolabel; fromlabel;
    }

    // Maps node.key → node.label for every stock/conveyor/microwave node
    // (including ghost nodes, so flow wiring can find them).
    var stockKeyToName = {};

    // ── Pass 1: build res.stocks, res.converters, res.variables, res.valves ──
    for (var i = 0; i < obj.nodeDataArray.length; i++) {
        var node = obj.nodeDataArray[i];

        // ── Regular stock ────────────────────────────────────────────────────
        if (node.category === "stock") {
            res.labelsandkeys.push({ key: node.key, label: node.label });
            stockKeyToName[node.key] = node.label;
            if (node.label[0] === "$") continue;

            res.stocks[node.label] = {
                isNN:       !!node.checkbox,
                isConveyor: false,
                isMicrowave: false,
                values:     [],
                safeval:    null,
                equation:   node.equation,
                inflows:    {},
                outflows:   {}
            };
        }

        // ── Conveyor ─────────────────────────────────────────────────────────
        // Pipeline delay: material enters via user inflow, exits after transitTime.
        // Placed in res.stocks; engine uses stepConveyor() instead of dydt().
        if (node.category === "conveyor") {
            res.labelsandkeys.push({ key: node.key, label: node.label });
            stockKeyToName[node.key] = node.label;
            if (node.label[0] === "$") continue;

            var tt = parseFloat(node.transitTime);
            if (isNaN(tt) || tt <= 0) tt = 1;

            res.stocks[node.label] = {
                isNN:        !!node.checkbox,
                isConveyor:  true,
                isMicrowave: false,
                transitTime: tt,
                pipeline:    [],   // filled by initObjects()
                _slots:      0,    // filled by initObjects()
                values:      [],
                safeval:     null,
                equation:    node.equation,   // initial value
                inflows:     {},
                outflows:    {}
            };
        }

        // ── Microwave (oven) ─────────────────────────────────────────────────
        // Batch delay: material enters via user inflow, held for cookTime, then
        // the entire batch exits at once. Engine uses stepMicrowave().
        if (node.category === "microwave") {
            res.labelsandkeys.push({ key: node.key, label: node.label });
            stockKeyToName[node.key] = node.label;
            if (node.label[0] === "$") continue;

            var ct = parseFloat(node.cookTime);
            if (isNaN(ct) || ct <= 0) ct = 1;

            res.stocks[node.label] = {
                isNN:        !!node.checkbox,
                isConveyor:  false,
                isMicrowave: true,
                cookTime:    ct,
                batch:       null,   // { amount, stepsRemaining } — filled by initObjects()
                _cookSteps:  0,      // filled by initObjects()
                values:      [],
                safeval:     null,
                equation:    node.equation,   // initial value
                inflows:     {},
                outflows:    {}
            };
        }

        // ── Queue ────────────────────────────────────────────────────────────
        // STELLA-style queue: accumulates material with a user-defined capacity.
        // A normal outflow drains the queue via the user's valve equation.
        // An overflow outflow (flagged _isOverflow on the valve) fires automatically
        // when the queue level would exceed capacity, dumping the excess immediately.
        if (node.category === "queue") {
            res.labelsandkeys.push({ key: node.key, label: node.label });
            stockKeyToName[node.key] = node.label;
            if (node.label[0] === "$") continue;

            var cap = parseFloat(node.capacity);
            if (isNaN(cap) || cap <= 0) cap = 100;

            res.stocks[node.label] = {
                isNN:        !!node.checkbox,
                isConveyor:  false,
                isMicrowave: false,
                isQueue:     true,
                capacity:    cap,
                _lastOverflowRate: 0,
                values:      [],
                safeval:     null,
                equation:    node.equation,
                inflows:     {},
                outflows:    {}
            };
        }

        // ── Queue ───────────────────────────────────────────────────────────
        // Capacity queue: material enters via user inflows, accumulates up to
        // capacity. Normal outflows drain the queue by user equation. Overflow
        // outflow fires when inflow would push contents above capacity.
        if (node.category === "queue") {
            res.labelsandkeys.push({ key: node.key, label: node.label });
            stockKeyToName[node.key] = node.label;
            if (node.label[0] === "$") continue;

            var cap = parseFloat(node.capacity);
            if (isNaN(cap) || cap <= 0) cap = 100;

            res.stocks[node.label] = {
                isNN:        !!node.checkbox,
                isConveyor:  false,
                isMicrowave: false,
                isQueue:     true,
                capacity:    cap,
                values:      [],
                safeval:     null,
                equation:    node.equation,
                inflows:     {},
                outflows:    {}
            };
        }

        // ── Variable ─────────────────────────────────────────────────────────
        if (node.category === "variable") {
            res.labelsandkeys.push({ key: node.key, label: node.label });
            res.variables.push({ key: node.key, equation: node.equation, label: node.label });
            if (node.label[0] === "$") continue;

            res.converters[node.label] = {
                values:   [],
                equation: node.equation
            };
        }

        // ── Valve ────────────────────────────────────────────────────────────
        if (node.category === "valve") {
            res.valves.push({ equation: node.equation, label: node.label, key: node.key });
            res.labelsandkeys.push({ key: node.key, label: node.label });
        }
    }

    // ── Pass 2: wire flows ────────────────────────────────────────────────────
    for (var i = 0; i < obj.linkDataArray.length; i++) {
        var link = obj.linkDataArray[i];

        // ── Influence links ──────────────────────────────────────────────────
        if (link.category === "influence") {
            var inf = new influence();
            for (var h = 0; h < obj.nodeDataArray.length; h++) {
                if (obj.nodeDataArray[h].key === link.to) {
                    inf.to       = obj.nodeDataArray[h].key;
                    inf.toEq     = obj.nodeDataArray[h].equation;
                    inf.tolabel  = obj.nodeDataArray[h].label;
                }
                if (obj.nodeDataArray[h].key === link.from) {
                    inf.from      = obj.nodeDataArray[h].key;
                    inf.fromlabel = obj.nodeDataArray[h].label;
                }
            }
            res.influences.push(inf);
        }

        // ── Flow links (and overflow links) ──────────────────────────────────
        if (link.category === "flow" || link.category === "overflow") {
            if (!link.labelKeys || link.labelKeys.length === 0) continue;

            const valveKey  = link.labelKeys[0];
            const valveNode = obj.nodeDataArray.find(n => n.key === valveKey);
            if (!valveNode) {
                console.warn(`⚠️ Flow/overflow link missing valve ${valveKey}. Skipping.`);
                continue;
            }

            // Overflow links are engine-driven — use "0" as placeholder equation.
            // The engine replaces this with _lastOverflowRate at runtime.
            const isOverflowLink = link.category === "overflow" || !!(valveNode._isOverflow);

            let flowEq    = isOverflowLink ? "0" : (valveNode.equation || "0");
            let flowName  = isOverflowLink
                ? ("__overflow_" + link.from + "_" + link.to)   // synthetic unique key
                : valveNode.label.toString();
            let isUniflow = isOverflowLink ? false : !!valveNode.checkbox;

            // Ghost valve — resolve to real counterpart (normal flows only)
            if (!isOverflowLink && flowName[0] === "$") {
                const real = obj.nodeDataArray.find(n => n.label === flowName.substring(1));
                if (real) {
                    flowEq    = real.equation || "0";
                    flowName  = real.label.toString();
                    isUniflow = !!real.checkbox;
                }
            }

            if (isUniflow) {
                flowEq = "Math.max(0," + flowEq + ")";
            }

            // Identify the from/to node categories and labels
            const fromNode  = obj.nodeDataArray.find(n => n.key === link.from);
            const toNode    = obj.nodeDataArray.find(n => n.key === link.to);
            const fromCat   = fromNode ? fromNode.category : "";
            const toCat     = toNode   ? toNode.category   : "";

            // Resolve ghost labels to real labels for upstream stock lookup
            function realLabel(n) {
                if (!n) return null;
                return n.label.startsWith("$") ? n.label.substring(1) : n.label;
            }

            // ── Outflow side: link.from is a stock/conveyor/microwave/queue ────
            let fromName = stockKeyToName[link.from];
            if (fromName) {
                if (fromName[0] === "$") fromName = fromName.substring(1);
                if (res.stocks[fromName]) {
                    res.stocks[fromName].outflows[flowName] = {
                        equation:       flowEq,
                        values:         [],
                        _isTransitOut:  (fromCat === "conveyor"),
                        _isBatchOut:    (fromCat === "microwave"),
                        _isOverflowOut: isOverflowLink
                    };
                }
            }

            // ── Inflow side: link.to is a stock/conveyor/microwave/queue ─────
            let toName = stockKeyToName[link.to];
            if (toName) {
                if (toName[0] === "$") toName = toName.substring(1);
                if (res.stocks[toName]) {
                    const isTransitIn  = (fromCat === "conveyor");
                    const isBatchIn    = (fromCat === "microwave");
                    const isOverflowIn = isOverflowLink;
                    res.stocks[toName].inflows[flowName] = {
                        equation:       flowEq,
                        values:         [],
                        _isTransitIn:   isTransitIn,
                        _isBatchIn:     isBatchIn,
                        _isOverflowIn:  isOverflowIn,
                        _upstreamStock: (isTransitIn || isBatchIn || isOverflowIn) ? realLabel(fromNode) : null
                    };
                }
            }
        }
    }

    return res;
}
