// sim/xmile.js

/**
 * Exports a LunaSim model JSON to XMILE Level 2 XML string.
 * @param {Object} lunaJson - The raw output of myDiagram.model.toJson()
 * @param {Object} simParams - {startTime, endTime, dt, integrationMethod}
 * @returns {string} - XMILE-compliant XML string
 */
export function lunaToXmile(lunaJson, simParams) {
    const nodes = lunaJson.nodeDataArray;
    const links = lunaJson.linkDataArray;

    // Build a lookup of valve labels → equations
    const valveMap = {};
    nodes.filter(n => n.category === "valve").forEach(v => {
        valveMap[v.key] = { label: v.label, equation: v.equation, checkbox: v.checkbox };
    });

    // Build stock inflow/outflow lookups from flow links
    const stockFlows = {}; // stockKey → { inflows: [], outflows: [] }
    links.filter(l => l.category === "flow").forEach(link => {
        const valveKey = link.labelKeys?.[0];
        if (!valveKey) return;
        const valve = valveMap[valveKey];
        if (!valve) return;

        if (link.from && !stockFlows[link.from]) stockFlows[link.from] = { inflows: [], outflows: [] };
        if (link.to && !stockFlows[link.to]) stockFlows[link.to] = { inflows: [], outflows: [] };

        if (link.from) stockFlows[link.from].outflows.push(valve.label);
        if (link.to) stockFlows[link.to].inflows.push(valve.label);
    });

    // Convert bracket-style references [VarName] to plain XMILE references
    function convertEqn(eqn) {
        if (!eqn) return "0";
        return eqn.replace(/\[([^\]]+)\]/g, '$1');
    }

    // Convert JS math functions to SMILE equivalents
    function convertFunctions(eqn) {
        return eqn
            .replace(/Math\.sqrt/g, 'SQRT')
            .replace(/Math\.abs/g, 'ABS')
            .replace(/Math\.sin/g, 'SIN')
            .replace(/Math\.cos/g, 'COS')
            .replace(/Math\.tan/g, 'TAN')
            .replace(/Math\.exp/g, 'EXP')
            .replace(/Math\.log/g, 'LN')
            .replace(/Math\.min/g, 'MIN')
            .replace(/Math\.max/g, 'MAX')
            .replace(/Math\.PI/g, '3.14159265358979')
            .replace(/Math\.E/g, '2.71828182845905');
    }

    function processEqn(eqn) {
        return convertFunctions(convertEqn(eqn || "0"));
    }

    // Convert GoJS "x y" loc string to x,y numbers
    function parseLoc(loc) {
        if (!loc) return { x: 100, y: 100 };
        const parts = loc.split(" ");
        return { x: parseFloat(parts[0]) || 100, y: parseFloat(parts[1]) || 100 };
    }

    const methodMap = { rk4: "RK4", euler: "Euler" };
    const method = methodMap[simParams.integrationMethod] || "RK4";

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<xmile version="1.0" xmlns="http://docs.oasis-open.org/xmile/ns/XMILE/v1.0">
  <header>
    <smile version="1.0" namespace="std, arrayed, shared"/>
    <name>LunaSim Model</name>
    <product version="1.0" lang="en">LunaSim</product>
  </header>
  <sim_specs method="${method}" time_units="Time">
    <start>${simParams.startTime}</start>
    <stop>${simParams.endTime}</stop>
    <dt>${simParams.dt}</dt>
  </sim_specs>
  <model>
    <variables>\n`;

    // Stocks
    nodes.filter(n => n.category === "stock" && !n.label.startsWith("$")).forEach(n => {
        const loc = parseLoc(n.loc);
        const flows = stockFlows[n.key] || { inflows: [], outflows: [] };
        xml += `      <stock name="${n.label}">\n`;
        xml += `        <eqn>${processEqn(n.equation)}</eqn>\n`;
        flows.inflows.forEach(f => xml += `        <inflow>${f}</inflow>\n`);
        flows.outflows.forEach(f => xml += `        <outflow>${f}</outflow>\n`);
        if (n.checkbox) xml += `        <non_negative/>\n`;
        xml += `        <display x="${loc.x}" y="${loc.y}"/>\n`;
        xml += `      </stock>\n`;
    });

    // Flows (valves)
    nodes.filter(n => n.category === "valve" && !n.label.startsWith("$")).forEach(n => {
        const loc = parseLoc(n.loc);
        xml += `      <flow name="${n.label}">\n`;
        xml += `        <eqn>${processEqn(n.equation)}</eqn>\n`;
        if (n.checkbox) xml += `        <non_negative/>\n`;
        xml += `        <display x="${loc.x}" y="${loc.y}"/>\n`;
        xml += `      </flow>\n`;
    });

    // Auxiliaries (variables)
    nodes.filter(n => n.category === "variable" && !n.label.startsWith("$")).forEach(n => {
        const loc = parseLoc(n.loc);
        xml += `      <aux name="${n.label}">\n`;
        xml += `        <eqn>${processEqn(n.equation)}</eqn>\n`;
        xml += `        <display x="${loc.x}" y="${loc.y}"/>\n`;
        xml += `      </aux>\n`;
    });

    xml += `    </variables>\n  </model>\n</xmile>`;
    return xml;
}


/**
 * Parses an XMILE XML string into a LunaSim-compatible model JSON.
 * @param {string} xmlString - Raw XMILE XML content
 * @returns {Object} - { lunaModel, simParams } where lunaModel is GoJS-loadable JSON
 */
export function xmileToLuna(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    const parseError = doc.querySelector("parsererror");
    if (parseError) throw new Error("Invalid XML: " + parseError.textContent);

    // Parse simulation specs
    const simSpecs = doc.querySelector("sim_specs");
    const simParams = {
        startTime: parseFloat(simSpecs?.querySelector("start")?.textContent || "0"),
        endTime: parseFloat(simSpecs?.querySelector("stop")?.textContent || "10"),
        dt: parseFloat(simSpecs?.querySelector("dt")?.textContent || "0.1"),
        integrationMethod: (simSpecs?.getAttribute("method") || "RK4").toLowerCase() === "euler" ? "euler" : "rk4"
    };

    // Convert SMILE equation syntax back to LunaSim bracket syntax
    function convertEqnFromXmile(eqn, allNames) {
        if (!eqn) return "";
        let result = eqn.trim();

        // Convert SMILE functions back to Math.* (safeEval handles the rest)
        result = result
            .replace(/\bSQRT\b/g, 'sqrt')
            .replace(/\bABS\b/g, 'abs')
            .replace(/\bSIN\b/g, 'sin')
            .replace(/\bCOS\b/g, 'cos')
            .replace(/\bTAN\b/g, 'tan')
            .replace(/\bEXP\b/g, 'exp')
            .replace(/\bLN\b/g, 'log')
            .replace(/\bMIN\b/g, 'min')
            .replace(/\bMAX\b/g, 'max');

        // Wrap variable references in brackets (sorted by length desc to avoid substring issues)
        const sortedNames = [...allNames].sort((a, b) => b.length - a.length);
        sortedNames.forEach(name => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'g');
            result = result.replace(regex, `[${name}]`);
        });

        return result;
    }

    const nodeDataArray = [];
    const linkDataArray = [];
    let keyCounter = 1;
    const nameToKey = {};

    // Collect all variable names first (needed for equation reference wrapping)
    const allVariableNames = [];
    doc.querySelectorAll("stock, flow, aux").forEach(el => {
        const name = el.getAttribute("name");
        if (name) allVariableNames.push(name);
    });

    // Helper to get display position
    function getDisplay(el) {
        const display = el.querySelector("display");
        if (display) {
            return `${display.getAttribute("x") || 100} ${display.getAttribute("y") || 100}`;
        }
        // Auto-layout fallback
        return `${100 + (keyCounter * 120) % 600} ${100 + Math.floor(keyCounter / 5) * 120}`;
    }

    // Parse stocks
    doc.querySelectorAll("stock").forEach(el => {
        const name = el.getAttribute("name");
        const eqnRaw = el.querySelector("eqn")?.textContent || "0";
        const isNN = !!el.querySelector("non_negative");
        const key = `stock${keyCounter++}`;
        nameToKey[name] = key;

        nodeDataArray.push({
            key, category: "stock", label: name,
            equation: convertEqnFromXmile(eqnRaw, allVariableNames),
            checkbox: isNN,
            loc: getDisplay(el),
            color: "#cfcfcf"
        });
    });

    // Parse flows
    const flowNodes = {};
    doc.querySelectorAll("flow").forEach(el => {
        const name = el.getAttribute("name");
        const eqnRaw = el.querySelector("eqn")?.textContent || "0";
        const isNN = !!el.querySelector("non_negative");
        const key = `valve${keyCounter++}`;
        nameToKey[name] = key;

        const valveNode = {
            key, category: "valve", label: name,
            equation: convertEqnFromXmile(eqnRaw, allVariableNames),
            checkbox: isNN,
            loc: getDisplay(el),
            color: "#3489eb"
        };
        nodeDataArray.push(valveNode);
        flowNodes[name] = key;
    });

    // Parse auxiliaries
    doc.querySelectorAll("aux").forEach(el => {
        const name = el.getAttribute("name");
        const eqnRaw = el.querySelector("eqn")?.textContent || "0";
        const key = `variable${keyCounter++}`;
        nameToKey[name] = key;

        nodeDataArray.push({
            key, category: "variable", label: name,
            equation: convertEqnFromXmile(eqnRaw, allVariableNames),
            loc: getDisplay(el),
            color: "#cfcfcf"
        });
    });

    // Build flow links from stock inflow/outflow declarations
    doc.querySelectorAll("stock").forEach(stockEl => {
        const stockName = stockEl.getAttribute("name");
        const stockKey = nameToKey[stockName];

        stockEl.querySelectorAll("inflow").forEach(inf => {
            const flowName = inf.textContent.trim();
            const valveKey = flowNodes[flowName];
            if (!valveKey || !stockKey) return;
            const linkKey = `link${keyCounter++}`;
            linkDataArray.push({
                key: linkKey, category: "flow",
                from: null, // source is a cloud (implicit)
                to: stockKey,
                labelKeys: [valveKey]
            });
        });

        stockEl.querySelectorAll("outflow").forEach(outf => {
            const flowName = outf.textContent.trim();
            const valveKey = flowNodes[flowName];
            if (!valveKey || !stockKey) return;
            const linkKey = `link${keyCounter++}`;
            linkDataArray.push({
                key: linkKey, category: "flow",
                from: stockKey,
                to: null, // sink is a cloud
                labelKeys: [valveKey]
            });
        });
    });

    const lunaModel = {
        class: "GraphLinksModel",
        linkLabelKeysProperty: "labelKeys",
        nodeDataArray,
        linkDataArray,
        simulationParameters: simParams
    };

    return { lunaModel, simParams };
}