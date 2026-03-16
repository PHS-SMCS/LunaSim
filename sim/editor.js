
/**
 * @fileoverview System Dynamics Editor using GoJS. This file uses the GoJS library to create a system dynamics editor.  Additionally, there is an equation editing table,
 *   which allows the user to edit the equations and characteristics of the objects in the model.
 * @module editor
 * @author Authors: Karthik S. Vedula, Sienna Simms, Ryan Chung, Arjun Mujudar, Akash Saran
 */

/**
 * Indicates whether the application is running in performance testing mode.
 * @type {boolean}
 * @default false
 * @memberof module:editor
 */
var PERFORMANCE_MODE = false;
export {PERFORMANCE_MODE};

/**
 * Font size (in points) used for all node and link labels in the diagram.
 * Controlled by the "Label Font Size" input in Theme Settings.
 * @type {number}
 * @default 11
 * @memberof module:editor
 */
let labelFontSize = 11;

/**
 * Pixel offset applied to polarity (+/−) labels on influence links.
 * Measured from the arrowhead tip in diagram coordinates.
 * Configurable via Theme Settings.
 * @type {number}
 * @memberof module:editor
 */
let polarityOffsetX = 0;
let polarityOffsetY = 0;

/**
 * Simulation engine handling model execution and time-stepping logic.
 * @memberof module:editor
 */
import {Simulation} from "./engine.js";
/**
 * Translation utility for language localization or string translation.
 * @memberof module:editor
 */
import {translate} from "./translator.js";
/**
 * Tool for reshaping curved links in the diagram.
 * @module CurvedLinkReshapingTool
 * @memberof module:editor
 */
import {CurvedLinkReshapingTool} from "./CurvedLinkReshapingTool.js";


/**
 * Global state object for the System Dynamics editor.
 * Holds the current UI mode, selected item type, and node counters.
 * @global
 * @type {Object}
 * @memberof module:editor
 */
var SD = {
    /**
     * Current interaction mode.
     * Can be `"pointer"`, `"node"`, or `"link"`.
     * @type {string}
     * @memberof module:editor
     */
    mode: "pointer", /**
     * Type of item to be created next.
     * Can be `"stock"`, `"cloud"`, `"variable"`, `"valve"`, etc.
     * @type {string}
     * @memberof module:editor
     */
    itemType: "pointer", /**
     * Counter for unique node naming or IDs by type.
     * @type {Object}
     * @memberof module:editor
     */

    nodeCounter: {stock: 0, cloud: 0, variable: 0, valve: 0, text: 0, conveyor: 0, queue: 0}
};

/**
 * Labels for all GoJS elements in the order they were created.
 * @memberof module:editor
 * @type {string[]}
 */
let GOJS_ELEMENT_LABELS = [];
/**
 * Set of labels for quick uniqueness checking.
 * @type {Set<string>}
 * @memberof module:editor
 */
let GOJS_ELEMENT_LABELS_SET = new Set();
// ── Model colour palette (persisted in localStorage) ──────────────────────
// Defined here so buildTemplates() can reference it at init time.
var _MC_DEFAULTS = {
    stock: '#cfcfcf', conveyor: '#cfcfcf', variable: '#cfcfcf',
    cloud: '#cfcfcf', flow: '#3489eb', influence: '#e3680e',
    microwave: '#cfcfcf', queue: '#cfcfcf', labelcolor: '#000000'
};
var _modelColors = (function() {
    try {
        var s = localStorage.getItem('lunaModelColors');
        return s ? Object.assign({}, _MC_DEFAULTS, JSON.parse(s)) : Object.assign({}, _MC_DEFAULTS);
    } catch(e) { return Object.assign({}, _MC_DEFAULTS); }
}());

/**
 * Tracks whether the simulation has successfully run using the "Run" button.
 * @type {boolean}
 * @memberof module:editor
 */
let simulationHasRunSuccessfully_button = false;
/**
 * Tracks whether the simulation has successfully run when switching to the simulation tab.
 * @type {boolean}
 * @memberof module:editor
 */
let simulationHasRunSuccessfully_tab = false;


/**
 * The main GoJS diagram instance. Declared globally.
 * @type {go.Diagram}
 * @memberof module:editor
 */
var myDiagram;
/**
 * The core simulation instance controlling the model logic.
 * @type {Simulation}
 * @memberof module:editor
 */
var sim = new Simulation();
/**
 * The current working model data.
 * @type {*}
 * @memberof module:editor
 */
var data;

/**
 * Timestamp of the last edit in the editor.
 * @type {Date}
 * @memberof module:editor
 */
var lastEditDate = new Date();
/**
 * Timestamp of last export
 * @type {Date}
 * @memberof module:editor
 */

var lastExportDate = new Date();

/**
 * Indicates whether there are unsaved edits in the model.
 * @type {boolean}
 * @memberof module:editor
 */
var unsavedEdits = false;

/**
 * Indicates whether the user has ever exported the model yet.
 * @type {boolean}
 * @memberof module:editor
 */

/**
 * Updates the save status display in the UI, showing whether there are unsaved edits
 * and the relative time since the last edit and last export.
 *
 * Uses global variables:
 * - `unsavedEdits`: {boolean} Whether there are unsaved edits.
 * - `lastEditDate`: {Date} Timestamp of the last edit.
 * - `hasExportedYet`: {boolean} Whether the content has been exported at least once.
 * - `lastExportDate`: {Date} Timestamp of the last export.
 *
 * Updates the inner HTML of the element with ID `saveStatus` to show:
 * - "Unsaved Edits!" or "No Unsaved Edits"
 * - Time since the last edit
 * - Time since the last export, or "-" if never exported
 *
 * @example
 * // If edits were made 2 minutes ago and exported 1 hour ago:
 * updateSaveStatus();
 * // Output in UI: "Unsaved Edits! (Last Edit: 2m ago)<br>Last Exported: 1h"
 * @function
 * @memberof module:editor
 */
var hasExportedYet = false;

function updateSaveStatus() {
    let current = new Date();
    document.getElementById("saveStatus").innerHTML =
        `${unsavedEdits ? "Unsaved Edits!" : "No Unsaved Edits"} (Last Edit: ${formatDeltaTime(current - lastEditDate)})<br>` +
        `Last Exported: ${hasExportedYet ? formatDeltaTime(current - lastExportDate) : "-"}`;
}

/**
 * Formats a time delta (in ms) into a human-readable string.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} A readable string like "Just Now", "5m ago", or "2h 15m ago".
 * @memberof module:editor
 */
function formatDeltaTime(ms) {
    let seconds = ms / 1000;
    if (seconds < 60) return `Just Now`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    minutes %= 60;
    if (minutes > 0) return `${hours}h ${minutes}m ago`;
    return `${hours}h`;
}

updateSaveStatus();
setInterval(updateSaveStatus, 10000);

/**
 * Initializes the GoJS diagram with custom tools, behaviors, and event listeners.
 * This function sets up interaction modes, tools for creating nodes and links,
 * and ensures proper behavior for simulation-specific logic like valve linking,
 * ghost cleanup, and node uniqueness.
 * @function
 * @memberof module:editor
 */
function init() {
    const $ = go.GraphObject.make;

    myDiagram = $(go.Diagram, "myDiagram", {
        "undoManager.isEnabled": true,
        allowLink: false,
        "animationManager.isEnabled": false,
        "allowTextEdit": true,
        "isReadOnly": false,

        "linkingTool.portGravity": 0,
        "linkingTool.doActivate": function () {
            const isFlowLike = SD.itemType === "flow" || SD.itemType === "overflow";
            this.temporaryLink.curve = isFlowLike ? go.Link.None : go.Link.Bezier;
            this.temporaryLink.path.stroke = isFlowLike ? (SD.itemType === "overflow" ? "#555555" : "blue") : "orange";
            this.temporaryLink.path.strokeWidth = isFlowLike ? 5 : 1;
            go.LinkingTool.prototype.doActivate.call(this);
        },

        "linkReshapingTool": new CurvedLinkReshapingTool(),

        /**
         * Override for linkingTool to enforce type-specific link rules.
         * Creates a label node (valve) for "flow" links.
         */
        "linkingTool.insertLink": function (fromnode, fromport, tonode, toport) {
            myDiagram.model.setCategoryForLinkData(this.archetypeLinkData, SD.itemType);
            this.archetypeLabelNodeData = (SD.itemType === "flow") ? {category: "valve"} : null;
            this.archetypeLinkData.text = SD.itemType;

            if (SD.itemType === "flow") {
                const from = fromnode.category;
                const to = tonode.category;
                const flowable = ["stock", "cloud", "conveyor", "microwave", "queue"];
                const valid = flowable.includes(from) && flowable.includes(to);

                const bothClouds = from === "cloud" && to === "cloud";

                if (!valid || bothClouds) {
                    return null;
                }
            }

            // Overflow links: only allowed FROM a queue.
            // If user tries to draw an overflow from a non-queue, silently cancel.
            // The valve node gets _isOverflow:true and an empty label (no equation row).
            if (SD.itemType === "overflow") {
                const from = fromnode.category;
                const to = tonode.category;
                const overflowTargets = ["stock", "cloud", "conveyor", "microwave", "queue"];
                if (from !== "queue" || !overflowTargets.includes(to)) {
                    return null;
                }
                // Use a dedicated "overflow" link category so it gets its own template
                myDiagram.model.setCategoryForLinkData(this.archetypeLinkData, "overflow");
                // Valve node flagged so updateTable / engine can identify it
                this.archetypeLabelNodeData = { category: "overflow-valve", _isOverflow: true, label: "" };
                this.archetypeLinkData.text = "overflow";
            }

            if (SD.itemType === "influence" && (tonode.category === "stock" || tonode.category === "cloud")) {
                return null;
            }

            return go.LinkingTool.prototype.insertLink.call(this, fromnode, fromport, tonode, toport);
        },

        "clickCreatingTool.archetypeNodeData": {},
        "clickCreatingTool.isDoubleClick": false,
        "clickCreatingTool.canStart": function () {
            return SD.mode === "node" && go.ClickCreatingTool.prototype.canStart.call(this);
        },
        "clickCreatingTool.insertPart": function (loc) {
            if (!(SD.itemType in SD.nodeCounter)) {
                SD.nodeCounter[SD.itemType] = 0;
            }
            SD.nodeCounter[SD.itemType] += 1;
            let newNodeId = SD.itemType + SD.nodeCounter[SD.itemType];

            while (myDiagram.model.findNodeDataForKey(newNodeId) !== null) {
                SD.nodeCounter[SD.itemType] += 1;
                newNodeId = SD.itemType + SD.nodeCounter[SD.itemType];
            }

            this.archetypeNodeData = {
                key: newNodeId, category: SD.itemType, label: newNodeId, color: getDefaultColor(SD.itemType),
                ...(SD.itemType === "conveyor"  ? { transitTime: "1" } : {}),
                ...(SD.itemType === "microwave" ? { cookTime: "1" }    : {}),
                ...(SD.itemType === "queue"     ? { capacity: "100" }  : {})
            };

            return go.ClickCreatingTool.prototype.insertPart.call(this, loc);
        }
    });

    myDiagram.toolManager.mouseMoveTools.insertAt(0, new NodeLabelDraggingTool());

    myDiagram.toolManager.dragSelectingTool.canStart = function () {
        const e = myDiagram.lastInput;
        return e.control && e.left;
    };
    myDiagram.toolManager.dragSelectingTool.isEnabled = true;

    myDiagram.toolManager.dragSelectingTool.box = $(go.Part, {layerName: "Tool"}, $(go.Shape, "Rectangle", {
        fill: null, stroke: "#3489eb", strokeWidth: 1
    }));
    myDiagram.toolManager.dragSelectingTool.doActivate = function () {
        this.diagram.currentCursor = "crosshair";
        go.DragSelectingTool.prototype.doActivate.call(this);
    };
    myDiagram.toolManager.dragSelectingTool.doDeactivate = function () {
        this.diagram.currentCursor = "";
        go.DragSelectingTool.prototype.doDeactivate.call(this);
    };

    /**
     * Listener for diagram changes to update the window title.
     * Triggers when diagram becomes "modified."
     */
    myDiagram.addDiagramListener("Modified", () => {
        document.title = document.title.replace(/\*.*/, "");
    });

    /**
     * Listener for model changes to manage ghost cleanup,
     * update timestamps, and refresh UI.
     */
    myDiagram.addModelChangedListener(e => {
        if (!e.isTransactionFinished) return;

        myDiagram.model.nodeDataArray.forEach(node => {
            if (node.category === "cloud" || !node.label || node.label[0] !== "$") return;

            const nonGhostExists = myDiagram.model.nodeDataArray.some(n => n.label === node.label.substring(1) && n.category === node.category);

            if (!nonGhostExists) {
                if (node.category === "valve" || node.category === "overflow-valve") {
                    myDiagram.model.linkDataArray.forEach(link => {
                        if ((link.category === "flow" || link.category === "overflow") && link.labelKeys?.[0] === node.key) {
                            myDiagram.model.removeLinkData(link);
                        }
                    });
                }
                myDiagram.model.removeNodeData(node);
                loadTableToDiagram();
            }
        });
        updateTable();

        if (myDiagram.model.nodeDataArray.length !== 0) {
            const oldModel = sessionStorage.modelData;
            const newModel = myDiagram.model.toJson();
            sessionStorage.modelData = newModel;

            if (oldModel !== newModel) {
                lastEditDate = new Date();
                unsavedEdits = true;
                updateSaveStatus();
            }
        }
    });

    /**
     * When a "flow" link is drawn, assign a unique valve label and update diagram+table.
     */
    myDiagram.addDiagramListener("LinkDrawn", e => {
        const link = e.subject;
        if (link.category === "flow") {
            myDiagram.startTransaction("updateNode");
            SD.nodeCounter.valve += 1;
            let newNodeId = "flow" + SD.nodeCounter.valve;

            while (!labelValidator(undefined, "", newNodeId)) {
                SD.nodeCounter.valve += 1;
                newNodeId = "flow" + SD.nodeCounter.valve;
            }

            const labelNode = link.labelNodes.first();
            myDiagram.model.setDataProperty(labelNode.data, "label", newNodeId);
            myDiagram.commitTransaction("updateNode");

            updateTable();
            loadTableToDiagram();
        }
        // Overflow links: ensure the valve label stays empty and don't add to table
        if (link.category === "overflow") {
            myDiagram.startTransaction("updateOverflowNode");
            const labelNode = link.labelNodes.first();
            if (labelNode) {
                myDiagram.model.setDataProperty(labelNode.data, "label", "");
                myDiagram.model.setDataProperty(labelNode.data, "_isOverflow", true);
            }
            myDiagram.commitTransaction("updateOverflowNode");
            updateTable();
            loadTableToDiagram();
        }
    });

    /**
     * Auto-delete any flow links whose label (valve node) was deleted.
     */
    myDiagram.addDiagramListener("SelectionDeleted", e => {
        const deletedParts = e.subject.toArray();
        const deletedValveKeys = deletedParts
            .filter(p => p instanceof go.Node && (p.data.category === "valve" || p.data.category === "overflow-valve"))
            .map(p => p.data.key);

        if (deletedValveKeys.length === 0) return;

        const linksToDelete = myDiagram.model.linkDataArray.filter(link =>
            (link.category === "flow" || link.category === "overflow") &&
            link.labelKeys?.some(labelKey => deletedValveKeys.includes(labelKey))
        );

        if (linksToDelete.length > 0) {
            myDiagram.model.startTransaction("delete flow links for removed valves");
            linksToDelete.forEach(link => myDiagram.model.removeLinkData(link));
            myDiagram.model.commitTransaction("delete flow links for removed valves");
        }
    });

    buildTemplates();

    // ── Diagram keyboard shortcuts: B = emphasis, P = polarity +, M = polarity - ──
    myDiagram.commandHandler.doKeyDown = (function(original) {
        return function() {
            const e = myDiagram.lastInput;
            const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
            if (tag !== "input" && tag !== "textarea" && !e.control && !e.meta && !e.alt) {
                var kb = window._keyBinds || {};
                var kdown = e.key.toLowerCase();
                if (kdown === (kb.emphasis || 'b')) {
                    myDiagram.model.startTransaction("toggle emphasis");
                    myDiagram.selection.each(function(part) {
                        if (part instanceof go.Node || part instanceof go.Link) {
                            myDiagram.model.setDataProperty(part.data, "emphasized", !part.data.emphasized);
                        }
                    });
                    myDiagram.model.commitTransaction("toggle emphasis");
                    return;
                }
                if (kdown === (kb['polarity-pos'] || 'p')) {
                    myDiagram.model.startTransaction("set polarity +");
                    myDiagram.selection.each(function(part) {
                        if (part instanceof go.Link && part.data.category === "influence") {
                            const cur = getPolarityLabelData(part);
                            setPolarityLabel(part, cur && cur.polarity === "+" ? null : "+");
                        }
                    });
                    myDiagram.model.commitTransaction("set polarity +");
                    return;
                }
                if (kdown === (kb['polarity-neg'] || 'm')) {
                    myDiagram.model.startTransaction("set polarity -");
                    myDiagram.selection.each(function(part) {
                        if (part instanceof go.Link && part.data.category === "influence") {
                            const cur = getPolarityLabelData(part);
                            setPolarityLabel(part, cur && cur.polarity === "-" ? null : "-");
                        }
                    });
                    myDiagram.model.commitTransaction("set polarity -");
                    return;
                }
            }
            original.call(this);
        };
    })(myDiagram.commandHandler.doKeyDown.bind(myDiagram.commandHandler));


    myDiagram.model = go.Model.fromJson(JSON.stringify({
        class: "GraphLinksModel", linkLabelKeysProperty: "labelKeys", nodeDataArray: [], linkDataArray: []
    }));

    setupLocalStoragePersistence(myDiagram);
}

/**
 * Replaces the current diagram model with a fresh instance of its current JSON state.
 * This is useful for forcing re-rendering or applying changes to templates or other bindings.
 * @memberof module:editor
 * @function
 */
function refreshGoJsModel() {
    const newModelData = JSON.parse(myDiagram.model.toJson());

    if (!myDiagram || !newModelData) {
        console.error("Diagram or new model data is missing.");
        return;
    }

    myDiagram.startTransaction("refresh model");
    const newModel = go.Model.fromJson(newModelData);
    myDiagram.model = newModel;
    myDiagram.commitTransaction("refresh model");
}

/**
 * Builds and defines all GoJS node and link templates used in the diagram.
 * These include "stock", "cloud", "valve", "variable" node templates, and
 * "flow" and "influence" link templates.
 *
 * Template appearance and color vary depending on the dark mode session flag.
 * Called once during initialization.
 * @memberof module:editor
 * @function
 */
function buildTemplates() {
    var fillColor = "#f0f0f0";
    var textColor = "black";
    if (sessionStorage.getItem("darkMode") == "true") {
        fillColor = "#888888";
        textColor = "white";
    }

    const $ = go.GraphObject.make;

    /**
     * Returns a shared style array for GoJS node definitions.
     *
     * Includes basic panel configuration and two-way binding for the node's location.
     * Used as the base style for all node templates in the diagram.
     *
     * @function
     * @memberof module:editor
     * @returns {Array} An array of GoJS GraphObject style properties and bindings.
     * @example
     * const stockNode = $(go.Node, nodeStyle(), ...);
     */

    function nodeStyle() {
        return [{
            type: go.Panel.Spot,
            layerName: "",
            locationObjectName: "SHAPE",
            selectionObjectName: "SHAPE",
            locationSpot: go.Spot.Center
        }, new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify)];
    }
    /**
     * Returns the default style object for the shape component of GoJS nodes.
     *
     * Applies common port-related settings like linkability and shape naming.
     * Used in node templates to standardize appearance and behavior.
     *
     * @function
     * @memberof module:editor
     * @returns {Object} A style object defining shape properties for GoJS nodes.
     * @example
     * const shape = $(go.Shape, shapeStyle(), ...);
     */

    function shapeStyle() {3
        return {
            name: "SHAPE", stroke: "black", fill: fillColor, portId: "",
            fromLinkable: true, toLinkable: true
        };
    }
    /**
     * Returns the default text style array for GoJS TextBlock elements.
     *
     * Applies font, color, margin, and sets up two-way binding to the `label` property.
     * Used in node templates to standardize label appearance and enable editing.
     *
     * @function
     * @memberof module:editor
     * @returns {Array} An array of text styling properties and bindings for GoJS TextBlocks.
     * @example
     * const text = $(go.TextBlock, textStyle(), ...);
     */

    function textStyle() {
        return [{
            stroke: textColor, font: `bold ${labelFontSize}pt helvetica, bold arial, sans-serif`, margin: 2, editable: true
        }, new go.Binding("text", "label").makeTwoWay()];
    }

    myDiagram.nodeTemplateMap.add("stock", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Auto", $(go.Shape, {
            figure: "rectangle",
            fill: null,
            stroke: "dodgerblue",
            strokeWidth: 5,
            scale: 0.9,
            desiredSize: new go.Size(50, 30)
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "", function (data) {
        if (data.label && data.label.startsWith('$')) return "white";
        return data.color || _modelColors.stock || '#cfcfcf';
    }).makeTwoWay(),
    new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "black"; }),
    new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 4 : 1; }), {
        desiredSize: new go.Size(50, 30)
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 30), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify),
    new go.Binding("stroke", "labelColor").makeTwoWay(),
    new go.Binding("font", "labelSize", function(sz) {
        var pt = parseFloat(sz) || labelFontSize;
        return "bold " + pt + "pt helvetica, bold arial, sans-serif";
    }).makeTwoWay(function(font) {
        var m = font.match(/bold\s+[\d.]+pt/);
        return m ? parseFloat(m[1].replace('bold ','').replace('pt','')) : labelFontSize;
    })
    )));


    myDiagram.nodeTemplateMap.add("conveyor",
        $(go.Node, nodeStyle(), {
            selectionAdornmentTemplate: $(go.Adornment, "Auto",
                $(go.Shape, {
                    figure: "rectangle",
                    fill: null,
                    stroke: "dodgerblue",
                    strokeWidth: 5,
                    scale: 0.9,
                    desiredSize: new go.Size(50, 30)
                }),
                $(go.Placeholder)
            )
        },
        // ── Main body panel (rectangle + divider lines overlaid) ──────────────
        $(go.Panel, "Spot",
            // Green rectangle — this is the port/link anchor (portId: "")
            $(go.Shape, "Rectangle", {
                name: "SHAPE",
                portId: "",
                fromLinkable: true,
                toLinkable: true,
                stroke: "black",
                desiredSize: new go.Size(50, 30)
            },
            new go.Binding("fill", "", function(data) {
                if (data.label && data.label.startsWith("$")) return "white";
                return data.color || _modelColors.conveyor || '#cfcfcf';
            }).makeTwoWay(),
            new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "black"; }),
            new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 4 : 1; })
            ),
            // Divider lines drawn as a Position panel laid over the rectangle.
            // The rectangle is 50 wide; 4 lines divide it into 5 equal columns (spacing = 10px).
            $(go.Panel, "Position",
                { desiredSize: new go.Size(50, 30), pickable: false },
                $(go.Shape, "LineV", {
                    position: new go.Point(10, 3),
                    desiredSize: new go.Size(0, 24),
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 1.2,
                    pickable: false
                }),
                $(go.Shape, "LineV", {
                    position: new go.Point(20, 3),
                    desiredSize: new go.Size(0, 24),
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 1.2,
                    pickable: false
                }),
                $(go.Shape, "LineV", {
                    position: new go.Point(30, 3),
                    desiredSize: new go.Size(0, 24),
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 1.2,
                    pickable: false
                }),
                $(go.Shape, "LineV", {
                    position: new go.Point(40, 3),
                    desiredSize: new go.Size(0, 24),
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 1.2,
                    pickable: false
                })
            )
        ),
        // ── Node name label (above the rectangle, same pattern as stock) ──────
        $(go.TextBlock, textStyle(), {
            _isNodeLabel: true,
            alignment: new go.Spot(0.5, 0.5, 0, 30),
            isMultiline: false,
            textValidation: labelValidator
        },
        new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify),
    new go.Binding("stroke", "labelColor").makeTwoWay(),
    new go.Binding("font", "labelSize", function(sz) {
        var pt = parseFloat(sz) || labelFontSize;
        return "bold " + pt + "pt helvetica, bold arial, sans-serif";
    }).makeTwoWay(function(font) {
        var m = font.match(/bold\s+([\d.]+)pt/);
        return m ? parseFloat(m[1]) : labelFontSize;
    })
        )
        // Transit time is now edited via the Element Control Panel (bottom of canvas)
    ));

    myDiagram.nodeTemplateMap.add("cloud", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Auto", $(go.Shape, {
            figure: "Cloud",
            fill: null,
            stroke: "dodgerblue",
            strokeWidth: 3,
            scale: 0.9,
            desiredSize: new go.Size(30, 30)
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "", function(data) {
        return data.color || _modelColors.cloud || '#d4e4f7';
    }).makeTwoWay(),
    new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "black"; }),
    new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 4 : 1; }), {
        figure: "Cloud", desiredSize: new go.Size(30, 30)
    })));

    myDiagram.nodeTemplateMap.add("valve",
        $(go.Node, nodeStyle(), {
                movable: false,
                deletable: false,
                layerName: "Foreground",
                selectable: true,
                pickable: true,
                alignmentFocus: go.Spot.None,

                selectionAdornmentTemplate:
                    $(go.Adornment, "Auto",
                        $(go.Shape, "Circle",
                            {
                                fill: null,
                                stroke: "dodgerblue",
                                strokeWidth: 3,
                                desiredSize: new go.Size(50, 50)
                            })
                    )
            },
            $(go.Shape, shapeStyle(),
                new go.Binding("fill", "color").makeTwoWay(),
                new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : null; }),
                new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 3.5 : 1; }),
                {
                    figure: "Circle",
                    desiredSize: new go.Size(18, 18),
                    fill: "#3489eb",
                    stroke: null
                }),
            $(go.TextBlock, textStyle(),
                {
                    _isNodeLabel: true,
                    alignment: new go.Spot(0.5, 0.5, 0, 20),
                    isMultiline: false,
                    textValidation: labelValidator
                },
                new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify),
    new go.Binding("stroke", "labelColor").makeTwoWay(),
    new go.Binding("font", "labelSize", function(sz) {
        var pt = parseFloat(sz) || labelFontSize;
        return "bold " + pt + "pt helvetica, bold arial, sans-serif";
    }).makeTwoWay(function(font) {
        var m = font.match(/bold\s+([\d.]+)pt/);
        return m ? parseFloat(m[1]) : labelFontSize;
    })
            )
        )
    );

    myDiagram.nodeTemplateMap.add("variable", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Spot", $(go.Shape, "Ellipse", {
            fill: null, stroke: "dodgerblue", strokeWidth: 15, scale: 0.25
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "", function (data) {
        if (data.label && data.label.startsWith('$')) return "white";
        return data.color || _modelColors.variable || '#cfcfcf';
    }).makeTwoWay(),
    new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "black"; }),
    new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 4 : 1; }), {
        figure: "Ellipse", desiredSize: new go.Size(25, 25)
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 30), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify),
    new go.Binding("stroke", "labelColor").makeTwoWay(),
    new go.Binding("font", "labelSize", function(sz) {
        var pt = parseFloat(sz) || labelFontSize;
        return "bold " + pt + "pt helvetica, bold arial, sans-serif";
    }).makeTwoWay(function(font) {
        var m = font.match(/bold\s+[\d.]+pt/);
        return m ? parseFloat(m[1].replace('bold ','').replace('pt','')) : labelFontSize;
    })
    )));

    myDiagram.linkTemplateMap.add("flow",
        $(go.Link,
            {
                toShortLength: 10,
                layerName: "Background",
                selectionAdornmentTemplate:
                    $(go.Adornment,
                        $(go.Shape,
                            {
                                isPanelMain: true,
                                stroke: "#3489eb",
                                strokeWidth: 7
                            })
                    )
            },
            new go.Binding("curviness", "curviness").makeTwoWay(),

            new go.Binding("fromShortLength", "", function(data) {
                return isBiflow(data) ? 8 : 0;
            }),

            $(go.Shape,
                new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 11 : 5; }),
                new go.Binding("stroke", "emphasized", function(e, shape) {
                    if (e) return "#E8000D";
                    var d = shape.part ? shape.part.data : null;
                    return (d && d.flowColor) || _modelColors.flow || "#3489eb";
                }), {
                stroke: _modelColors.flow || "#3489eb",
                strokeWidth: 5
            }),

            $(go.Shape,
                new go.Binding("fill", "emphasized", function(e, shape) {
                    if (e) return "#E8000D";
                    var d = shape.part ? shape.part.data : null;
                    return (d && d.flowHeadColor) || _modelColors.flowhead || _modelColors.flow || "#3489eb";
                }),
                new go.Binding("stroke", "emphasized", function(e, shape) {
                    if (e) return "#E8000D";
                    var d = shape.part ? shape.part.data : null;
                    return (d && d.flowHeadColor) || _modelColors.flowhead || _modelColors.flow || "#3489eb";
                }), {
                fill: _modelColors.flow || "#3489eb",
                stroke: _modelColors.flow || "#3489eb",
                toArrow: "Standard",
                scale: 2.0
            }),

            $(go.Shape,
                new go.Binding("visible", "", isBiflow),
                new go.Binding("stroke", "", function(_, shape) {
                    return shape.part && shape.part.isSelected ? (_modelColors.flow || "#3489eb") : "#808080";
                }).ofObject(),
                new go.Binding("fill", "", function(_, shape) {
                    return shape.part && shape.part.isSelected ? (_modelColors.flow || "#3489eb") : "#808080";
                }).ofObject(),
                {
                    fromArrow: "Backward",
                    scale: 2.0
                }
            )
        )
    );

    // ── Overflow link template ───────────────────────────────────────────────
    // Visually like a flow but with dark gray body and light-red arrowhead.
    // The valve node uses the "overflow-valve" category so it renders differently.
    myDiagram.linkTemplateMap.add("overflow",
        $(go.Link,
            {
                toShortLength: 10,
                layerName: "Background",
                selectionAdornmentTemplate:
                    $(go.Adornment,
                        $(go.Shape,
                            {
                                isPanelMain: true,
                                stroke: "#555555",
                                strokeWidth: 7
                            })
                    )
            },
            new go.Binding("curviness", "curviness").makeTwoWay(),
            // Body: dark gray
            $(go.Shape, {
                stroke: "#555555",
                strokeWidth: 5
            },
            new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 11 : 5; }),
            new go.Binding("stroke", "emphasized", function(e) {
                return e ? "#E8000D" : "#555555";
            })),
            // Arrowhead: light red
            $(go.Shape, {
                fill: "#e07070",
                stroke: "#e07070",
                toArrow: "Standard",
                scale: 2.0
            },
            new go.Binding("fill", "emphasized", function(e) { return e ? "#E8000D" : "#e07070"; }),
            new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "#e07070"; }))
        )
    );

    // ── Overflow valve node template ─────────────────────────────────────────
    // A small light-red circle (no label) that rides on the overflow link.
    // Not deletable directly — deleting the link removes it.
    myDiagram.nodeTemplateMap.add("overflow-valve",
        $(go.Node, nodeStyle(), {
                movable: false,
                deletable: false,
                layerName: "Foreground",
                selectable: true,
                pickable: true,
                alignmentFocus: go.Spot.None,
                selectionAdornmentTemplate:
                    $(go.Adornment, "Auto",
                        $(go.Shape, "Circle", {
                            fill: null,
                            stroke: "dodgerblue",
                            strokeWidth: 3,
                            desiredSize: new go.Size(28, 28)
                        })
                    )
            },
            $(go.Shape, {
                figure: "Circle",
                desiredSize: new go.Size(18, 18),
                fill: "#e07070",
                stroke: "#c04040",
                strokeWidth: 1.5,
                portId: "",
                fromLinkable: false,
                toLinkable: false
            },
            new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "#c04040"; }),
            new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 3.5 : 1.5; }))
            // No TextBlock — overflow valves have no label
        )
    );

    myDiagram.nodeTemplateMap.add("text",
        new go.Part()
            .add(
                $(go.TextBlock, textStyle(),
                    { text: "Text",
                        background: "transparent",
                        editable: true
                        })
            )
    );

    myDiagram.linkTemplateMap.add("influence", $(go.Link, {
        curve: go.Link.Bezier, toShortLength: 8, reshapable: true, layerName: "Background"
    }, new go.Binding("curviness", "curviness").makeTwoWay(),
    $(go.Shape,
        new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 8 : 1.5; }),
        {strokeWidth: 1.5},
        new go.Binding("stroke", "isSelected", function(sel) { return sel ? "#3489eb" : (_modelColors.influence || "#e3680e"); }).ofObject()),
    $(go.Shape,
        new go.Binding("scale", "emphasized", function(e) { return e ? 2.5 : 1.5; }),
        { stroke: null, toArrow: "Standard", scale: 1.5 },
        new go.Binding("fill", "isSelected", function(sel) { return sel ? "#3489eb" : (_modelColors.influence || "#e3680e"); }).ofObject())
    ));

    // Polarity label nodes (isLinkLabel:true) — GoJS's native mechanism for
    // labels that reliably track a specific point along a link route.
    myDiagram.nodeTemplateMap.add("polarityLabel",
        $(go.Node, {
            isLinkLabel: true,
            selectable: false,
            avoidable: false,
            cursor: "default",
            // segmentIndex omitted → defaults to NaN.
            // With NaN, GoJS measures segmentFraction along the full VISUAL
            // path length of the bezier, not along internal control-point
            // segments.  segmentFraction:1 therefore lands at the arrowhead end.
            segmentFraction: 1,
            segmentOffset: new go.Point(polarityOffsetX, polarityOffsetY)
        },
        $(go.TextBlock, {
            stroke: "black",
            font: `bold ${labelFontSize}pt helvetica, bold arial, sans-serif`,
            textAlign: "center"
        },
        new go.Binding("text", "polarity"),
        new go.Binding("font", "polarity", function() {
            return `bold ${labelFontSize}pt helvetica, bold arial, sans-serif`;
        })))
    );

    // ── Microwave node template ──────────────────────────────────────────────
    // Visually: outer rectangle (50x30) with inner inscribed rectangle (36x18).
    // Supports: color, labelColor, labelSize, cookTime, emphasized.
    myDiagram.nodeTemplateMap.add("microwave",
        $(go.Node, nodeStyle(), {
            selectionAdornmentTemplate: $(go.Adornment, "Auto",
                $(go.Shape, {
                    figure: "rectangle",
                    fill: null,
                    stroke: "dodgerblue",
                    strokeWidth: 5,
                    scale: 0.9,
                    desiredSize: new go.Size(50, 30)
                }),
                $(go.Placeholder)
            )
        },
        $(go.Panel, "Spot",
            // Outer rectangle (port anchor)
            $(go.Shape, "Rectangle", {
                name: "SHAPE",
                portId: "",
                fromLinkable: true,
                toLinkable: true,
                desiredSize: new go.Size(50, 30),
                stroke: "black",
                strokeWidth: 1
            },
            new go.Binding("fill", "", function(data) {
                if (data.label && data.label.startsWith("$")) return "white";
                return data.color || _modelColors.microwave || '#ffb3c6';
            }).makeTwoWay(),
            new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "black"; }),
            new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 4 : 1; })
            ),
            // Inner inscribed rectangle (decorative, not interactive)
            $(go.Shape, "Rectangle", {
                desiredSize: new go.Size(36, 18),
                fill: "transparent",
                stroke: "rgba(0,0,0,0.4)",
                strokeWidth: 1.5,
                pickable: false
            })
        ),
        // Label below the node (same alignment as stock/conveyor)
        $(go.TextBlock, textStyle(), {
            _isNodeLabel: true,
            alignment: new go.Spot(0.5, 0.5, 0, 30),
            isMultiline: false,
            textValidation: labelValidator
        },
        new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify),
        new go.Binding("stroke", "labelColor").makeTwoWay(),
        new go.Binding("font", "labelSize", function(sz) {
            var pt = parseFloat(sz) || labelFontSize;
            return "bold " + pt + "pt helvetica, bold arial, sans-serif";
        }).makeTwoWay(function(font) {
            var m = font.match(/bold\s+([\d.]+)pt/);
            return m ? parseFloat(m[1]) : labelFontSize;
        })
        )
    ));

    // ── Queue node template ──────────────────────────────────────────────────
    // Visually: yellow rectangle (50x30) with 2 evenly spaced horizontal lines
    // at y=10 and y=20, dividing it into 3 equal bands.
    // Supports: color, labelColor, labelSize, capacity, emphasized.
    myDiagram.nodeTemplateMap.add("queue",
        $(go.Node, nodeStyle(), {
            selectionAdornmentTemplate: $(go.Adornment, "Auto",
                $(go.Shape, {
                    figure: "rectangle",
                    fill: null,
                    stroke: "dodgerblue",
                    strokeWidth: 5,
                    scale: 0.9,
                    desiredSize: new go.Size(50, 30)
                }),
                $(go.Placeholder)
            )
        },
        $(go.Panel, "Spot",
            // Outer rectangle (port anchor)
            $(go.Shape, "Rectangle", {
                name: "SHAPE",
                portId: "",
                fromLinkable: true,
                toLinkable: true,
                desiredSize: new go.Size(50, 30),
                stroke: "black",
                strokeWidth: 1
            },
            new go.Binding("fill", "", function(data) {
                if (data.label && data.label.startsWith("$")) return "white";
                return data.color || _modelColors.queue || '#ffe066';
            }).makeTwoWay(),
            new go.Binding("stroke", "emphasized", function(e) { return e ? "#E8000D" : "black"; }),
            new go.Binding("strokeWidth", "emphasized", function(e) { return e ? 4 : 1; })
            ),
            // Two horizontal divider lines at 1/3 and 2/3 height
            $(go.Panel, "Position",
                { desiredSize: new go.Size(50, 30), pickable: false },
                $(go.Shape, "LineH", {
                    position: new go.Point(3, 10),
                    desiredSize: new go.Size(44, 0),
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 1.2,
                    pickable: false
                }),
                $(go.Shape, "LineH", {
                    position: new go.Point(3, 20),
                    desiredSize: new go.Size(44, 0),
                    stroke: "rgba(0,0,0,0.45)",
                    strokeWidth: 1.2,
                    pickable: false
                })
            )
        ),
        // Label below the node (same alignment as stock/conveyor/microwave)
        $(go.TextBlock, textStyle(), {
            _isNodeLabel: true,
            alignment: new go.Spot(0.5, 0.5, 0, 30),
            isMultiline: false,
            textValidation: labelValidator
        },
        new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify),
        new go.Binding("stroke", "labelColor").makeTwoWay(),
        new go.Binding("font", "labelSize", function(sz) {
            var pt = parseFloat(sz) || labelFontSize;
            return "bold " + pt + "pt helvetica, bold arial, sans-serif";
        }).makeTwoWay(function(font) {
            var m = font.match(/bold\s+([\d.]+)pt/);
            return m ? parseFloat(m[1]) : labelFontSize;
        })
        )
    ));

    // ── Image node template ──────────────────────────────────────────────────
    // A freely-resizable, draggable image node. The user picks a PNG/JPG from
    // disk; it is stored as a base64 data URL in node.imageData.
    // Resize handles are enabled via resizable:true on the node.
    // The node is selectable and movable but not linkable (no portId).
    myDiagram.nodeTemplateMap.add("image",
        $(go.Node,
            {
                resizable:         true,
                resizeObjectName:  "PIC",
                selectable:        true,
                movable:           true,
                fromLinkable:      false,
                toLinkable:        false,
                locationSpot:      go.Spot.Center,
                selectionAdornmentTemplate: $(go.Adornment, "Auto",
                    $(go.Shape, {
                        fill: null,
                        stroke: "dodgerblue",
                        strokeWidth: 2,
                        strokeDashArray: [4, 3]
                    }),
                    $(go.Placeholder)
                )
            },
            new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
            $(go.Picture,
                {
                    name: "PIC",
                    desiredSize: new go.Size(50, 50),
                    imageStretch: go.GraphObject.Uniform,
                    errorFunction: function(pic, e) { pic.source = ""; }
                },
                new go.Binding("source", "imageData"),
                new go.Binding("desiredSize", "imgSize", go.Size.parse).makeTwoWay(go.Size.stringify)
            )
        )
    );

    myDiagram.nodeTemplateMap.add("textbox",
        $(go.Node, nodeStyle(),
            {
                selectionAdornmentTemplate: $(go.Adornment, "Auto",
                    $(go.Shape, {
                        fill: null,
                        stroke: "dodgerblue",
                        strokeWidth: 3
                    }),
                    $(go.Placeholder)
                )
            },
            $(go.Panel, "Auto",
                $(go.Shape, {
                    fill: "white",
                    stroke: "#ccc",
                    strokeWidth: 1,
                    name: "SHAPE"
                },
                new go.Binding("fill", "tbBg").makeTwoWay(),
                new go.Binding("stroke", "tbBorder").makeTwoWay()
                ),
                $(go.TextBlock, textStyle(),
                    {
                        margin: 6,
                        isMultiline: true,
                        minSize: new go.Size(100, 40),
                        wrap: go.TextBlock.WrapFit,
                        editable: true
                    },
                    new go.Binding("text", "label").makeTwoWay(),
                    new go.Binding("stroke", "tbLabelColor").makeTwoWay(),
                    new go.Binding("font", "tbLabelSize", function(sz) {
                        var pt = parseFloat(sz) || labelFontSize;
                        return "bold " + pt + "pt helvetica, bold arial, sans-serif";
                    }).makeTwoWay(function(font) {
                        var m = font.match(/bold\s+([\d.]+)pt/);
                        return m ? parseFloat(m[1]) : labelFontSize;
                    })
                )
            )
        )
    );

}

/**
 * Updates the current interaction mode of the diagram (pointer, node, or link).
 * Also updates the visual state of mode buttons.
 *
 * @param {string} mode - The interaction mode to activate ("pointer", "node", or "link").
 * @param {string} itemType - The type of item associated with the mode (e.g., "stock", "flow").
 * @memberof module:editor
 * @function
 */
function setMode(mode, itemType) {
    myDiagram.startTransaction();
    document.getElementById(SD.itemType + "_button").className = SD.mode + "_normal";
    document.getElementById(itemType + "_button").className = mode + "_selected";
    SD.mode = mode;
    SD.itemType = itemType;
    if (mode === "pointer") {
        myDiagram.allowLink = false;
        myDiagram.nodes.each(n => n.port.cursor = "");
    } else if (mode === "node") {
        myDiagram.allowLink = false;
        myDiagram.nodes.each(n => n.port.cursor = "");
    } else if (mode === "link") {
        myDiagram.allowLink = true;
        myDiagram.nodes.each(n => n.port.cursor = "pointer");
    }
    myDiagram.commitTransaction("mode changed");
}

/**
 * Synchronizes the GoJS model with the values from the equation table.
 * Called whenever the user updates the table.
 *
 * Updates each node’s `equation` and `checkbox` fields in the model,
 * and reinitializes the model while preserving the diagram’s position.
 * Also sets `unsavedEdits` and updates sessionStorage.
 * @memberof module:editor
 * @function
 */

function loadTableToDiagram() {
    var data = myDiagram.model.toJson();
    var json = JSON.parse(data);

    var $tbody = $('#eqTableBody');

    $tbody.find('tr').each(function () {
        var name = $(this).find('input[name="name"]').val();
        let migrated = $(this).data('migrated');
        let equation = migrated ? migrated.equation : $(this).find('input[name="equation"]').val();
        let checkbox = migrated ? migrated.checkbox : $(this).find('input[name="checkbox"]').is(':checked');
        let units = migrated ? (migrated.units || '') : ($(this).find('input[name="units"]').val() || '');

        $(this).removeData('migrated');


        $.each(json.nodeDataArray, function (i, item) {
            if (item.label === name) {
                item.equation = equation;
                item.checkbox = checkbox;
                item.units = units;
            }
        });
    });

    var pos = myDiagram.position;

    myDiagram.model = go.Model.fromJson(JSON.stringify(json));

    let oldModel = sessionStorage.modelData;
    let newModel = myDiagram.model.toJson();
    sessionStorage.modelData = newModel;
    if (oldModel != newModel) {
        lastEditDate = new Date();
        unsavedEdits = true;
        updateSaveStatus();
    }

    myDiagram.initialPosition = pos;
}

/**
 * Synchronizes the HTML equation table with the current GoJS model.
 *
 * Adds any new items from the model to the table, populates equations and
 * checkboxes if `load` is true, and removes any table entries that no
 * longer exist in the model.
 *
 * @param {boolean} [load=false] - Whether to load equation/checkbox values into the table.
 * @memberof module:editor
 * @function
 */

function updateTable(load = false) {
    const containers = ['#eqTableBody', '#equationEditorPopupContent'];

    containers.forEach(selector => {
        const $tbody = $(selector);

        if (!load) {
            $tbody.find('tr').each(function () {
                const name = $(this).find('input[name="name"]').val();
                const equation = $(this).find('input[name="equation"]').val();
                const checkbox = $(this).find('input[name="checkbox"]').prop('checked');
                const units = $(this).find('input[name="units"]').val() || '';

                const node = myDiagram.model.nodeDataArray.find(n => n.label === name);
                if (node) {
                    myDiagram.model.setDataProperty(node, 'equation', equation);
                    myDiagram.model.setDataProperty(node, 'checkbox', checkbox);
                    myDiagram.model.setDataProperty(node, 'units', units);
                }
            });
        }

        const data = myDiagram.model.toJson();
        const json = JSON.parse(data);

        $tbody.empty();

        const sortedItems = json.nodeDataArray
            .filter(item =>
                item.label !== undefined &&
                !isGhost(item.label) &&
                (item.category === "stock" || item.category === "variable" || item.category === "valve" || item.category === "conveyor" || item.category === "microwave" || item.category === "queue") &&
                item.category !== "text" && item.category !== "textbox" &&
                !(item.category === "valve" && item._isOverflow) &&
                item.category !== "overflow-valve"
            )

            .sort((a, b) => {
                const order = { stock: 0, conveyor: 0, microwave: 0, queue: 0, valve: 1, variable: 2 };
                return order[a.category] - order[b.category];
            });

        sortedItems.forEach(item => {
            const label = item.label;
            const category = item.category === "valve" ? "flow" : item.category;

            const $tr = $('<tr>');

            $tr.append($('<td>').append(
                $('<input class="eqTableInputBox" readonly>').attr({ type: 'text', name: 'type', value: category })
            ));

            const $nameInput = $('<input class="eqTableInputBox">')
                .attr({ type: 'text', name: 'name', value: label })
                .data('oldName', label)
                .on('blur', finalizeRename)
                .on('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        $(this).blur();
                    }
                });

            $tr.append($('<td>').append($nameInput));

            const $eqInput = $('<input class="eqTableInputBox" style="width: inherit;">')
                .attr({ type: 'text', name: 'equation' })
                .css('width', '99%')
                .val(load ? (item.equation || "") : (item.equation || ""));

            $tr.append($('<td>').append($eqInput));

            // ── Units cell ──────────────────────────────────────────────────
            const unitVal = (item.units && item.units.trim() !== '') ? item.units : '';
            const $unitWrapper = $('<td class="eq-col-units">').css('position', 'relative');
            const $unitInput = $('<input class="eqTableInputBox units-input">')
                .attr({ type: 'text', name: 'units', autocomplete: 'off' })
                .css('width', '99%')
                .val(load ? unitVal : unitVal);
            $unitWrapper.append($unitInput);
            $tr.append($unitWrapper);

            if (category === "stock" || category === "conveyor" || category === "flow" || category === "microwave" || category === "queue") {
                const $checkbox = $('<input>')
                    .attr({ type: 'checkbox', name: 'checkbox', class: 'nncheckbox' })
                    .prop('checked', !!item.checkbox)
                    .on('change', () => loadTableToDiagram());
                $tr.append($('<td>').append($checkbox));
            } else {
                $tr.append($('<td>'));
            }

            const colorClass = category === "stock" ? "eqStockBox"
                : category === "conveyor" ? "eqConveyorBox"
                : category === "microwave" ? "eqMicrowaveBox"
                : category === "queue" ? "eqQueueBox"
                : category === "flow" ? "eqFlowBox"
                : "eqVariableBox";

            $tr.find('td').slice(0, 3).addClass(colorClass);

            $tbody.append($tr);
        });
    });

    GOJS_ELEMENT_LABELS = myDiagram.model.nodeDataArray
        .filter(n =>
            n.label &&
            n.label !== '' &&
            !n.label.startsWith('$') &&
            n.category !== "cloud" &&
            n.category !== "text" &&
            n.category !== "textbox" &&
            n.category !== "polarityLabel" &&
            n.category !== "overflow-valve"
        )
        .map(n => n.label);

    // Ensure popup styling stays consistent after table update
    const popup = document.getElementById("equationEditorPopup");
    const popupContent = document.getElementById("equationEditorPopupContent");

    if (popup && popup.style.display !== "none") {
        const clonedTable = document.querySelector("#eqTable").cloneNode(true);
        popupContent.innerHTML = ""; // Clear old
        popupContent.appendChild(clonedTable); // Re-append
    }

    // Re-sync ECP so panel reflects latest model state
    if (typeof window._ecpSync === 'function') window._ecpSync();

}




/**
 * Determines whether a flow is a biflow (bidirectional) or uniflow (unidirectional)
 * based on the corresponding checkbox in the equation table.
 *
 * @memberof module:editor
 * @function
 *
 * @param {Object} data - The link data object, includes label keys.
 * @param {*} _ - Unused parameter (required by GoJS binding signature).
 * @returns {boolean} True if biflow, false if uniflow.
 */
function isBiflow(data, _) {
    var $tbody = $('#eqTableBody');
    var biflow = false;

    var labelKey = data.labelKeys[0];
    var flowName;
    for (var node of myDiagram.model["nodeDataArray"]) {
        if (node.key === labelKey) {
            flowName = node.label;
        }
    }

    // Overflow valves have no label — they are never biflow
    if (!flowName || flowName === '') return false;

    if (flowName[0] === '$') {
        flowName = flowName.substring(1);
    }

    $tbody.find('tr').each(function () {
        var name = $(this).find('input[name="name"]').val();
        var checkbox = $(this).find('input[name="checkbox"]').is(':checked');

        if (name === flowName) {
            biflow = !checkbox;
        }
    });

    return biflow;
}

/**
 * Checks whether a given label represents a ghost node.
 * Ghost nodes are identified by a '$' prefix in their label.
 * @memberof module:editor
 * @function
 * @param {string} label - The label to check.
 * @returns {boolean} True if the label is a ghost label.
 */
function isGhost(label) {
    return label[0] === '$';
}

/**
 * Validates the renaming of a label in the diagram.
 * Ensures new names are not numeric or empty, are unique,
 * and if ghosting, ensures a corresponding real node exists.
 * @memberof module:editor
 * @function
 * @param {Object} textblock - The GoJS TextBlock.
 * @param {string} oldstr - The original string.
 * @param {string} newstr - The new string input by the user.
 * @returns {boolean} True if valid, false if invalid.
 */

function labelValidator(textblock, oldstr, newstr) {
    if (newstr === oldstr) return true;
    if (!newstr || !isNaN(newstr)) return false;

    if (isGhost(newstr)) {
        const targetLabel = newstr.substring(1);
        const realNodeCount = myDiagram.model.nodeDataArray
            .filter(node => node.label === targetLabel && !isGhost(node.label)).length;
        return realNodeCount >= 1;
    }

    // Ensure uniqueness
    return !myDiagram.model.nodeDataArray.some(n => n.label === newstr);
}

/**
 * Displays the simulation error popup panel in the UI.
 *
 * Opens the popup element with ID `simErrorPopup` using the `openSettings` utility.
 * Typically, triggered when simulation validation fails.
 *
 * @function
 * @memberof module:editor
 */

function showSimErrorPopup() {
    openSettings(event, 'simErrorPopup');
}

document.getElementById("simErrorPopupDismiss").addEventListener("click", closeSimErrorPopup);

function showConfirmPopup({ title, message, onConfirm, onCancel }) {
    const popup = document.getElementById("customConfirmPopup");
    const overlay = document.getElementById("overlay");

    document.getElementById("customConfirmTitle").textContent = title;
    document.getElementById("customConfirmMessage").textContent = message;

    // Enable both buttons
    document.getElementById("customConfirmCancelBtn").style.display = "inline-block";
    document.getElementById("customConfirmOkBtn").textContent = "Continue";

    popup.classList.remove("hidden");
    overlay.classList.remove("hidden");

    requestAnimationFrame(() => {
        popup.classList.add("show");
        overlay.classList.add("show");
    });

    // Assign click behavior
    document.getElementById("customConfirmCancelBtn").onclick = () => {
        closePopup();
        if (onCancel) onCancel();
    };
    document.getElementById("customConfirmOkBtn").onclick = () => {
        closePopup();
        if (onConfirm) onConfirm();
    };
}

function showAlertPopup({ title, message, onContinue }) {
    const popup = document.getElementById("customConfirmPopup");
    const overlay = document.getElementById("overlay");

    document.getElementById("customConfirmTitle").textContent = title;
    document.getElementById("customConfirmMessage").textContent = message;

    // Hide Cancel
    document.getElementById("customConfirmCancelBtn").style.display = "none";
    document.getElementById("customConfirmOkBtn").textContent = "OK";

    popup.classList.remove("hidden");
    overlay.classList.remove("hidden");

    requestAnimationFrame(() => {
        popup.classList.add("show");
        overlay.classList.add("show");
    });

    document.getElementById("customConfirmOkBtn").onclick = () => {
        closePopup();
        if (onContinue) onContinue();
    };
}

// Utility to clean up both buttons and overlay
function closePopup() {
    const popup = document.getElementById("customConfirmPopup");
    const overlay = document.getElementById("overlay");

    popup.classList.remove("show");
    overlay.classList.remove("show");

    setTimeout(() => {
        popup.classList.add("hidden");
        overlay.classList.add("hidden");

        // Clean up handlers to prevent multiple triggers
        document.getElementById("customConfirmOkBtn").onclick = null;
        document.getElementById("customConfirmCancelBtn").onclick = null;
    }, 100);
}

// Enable closing the popup when clicking outside
document.getElementById("overlay").addEventListener("click", () => {
    closePopup();
});




/**
 * Closes the simulation error popup and hides the gray overlay effect.
 * @memberof module:editor
 * @function
 */
function closeSimErrorPopup() {
    document.getElementById("simErrorPopup").style.display = "none";
    document.getElementById("grayEffectDiv").style.display = "none";
}

/* Resets the Simulation Error Popup (Unused)
function resetSimErrorPopup() {
    document.getElementById("simErrorPopupTitle").innerHTML = "<b>Oops, Simulation Error! :(<b>"
    document.getElementById("simErrorPopupDesc").innerHTML = "Placeholder Message"
    document.getElementById("simErrorPopupDismiss").innerHTML = "Dismiss"
}*/

/**
 * Extracts all references from a given equation string.
 * References are enclosed in square brackets, e.g., [Stock1].
 * @memberof module:editor
 * @function
 * @param {string} equation - The equation string.
 * @param {*} data - Unused (placeholder for interface compatibility).
 * @returns {string[]} Array of reference names found in the equation.
 */
function containsReference(equation, data) {
    const matches = [];
    const regex = /\[(.*?)\]/g;
    if(equation == null){
        return matches;
    }
    const allMatches = equation.matchAll(regex);

    for (const match of allMatches) {
        matches.push(match[1]);
    }

    return matches;
}

/**
 * The main entry point for running the simulation.
 * Loads diagram data, validates structure, extracts references and influences,
 * performs error checks on time parameters, and runs the simulation engine.
 *
 * Steps:
 * 1. Load table data into diagram.
 * 2. Translate diagram model to simulation engine format.
 * 3. Validate influences and references.
 * 4. Perform input validation (start, end, dt, method).
 * 5. Handle high step-count warnings.
 * 6. Attempt simulation execution and handle errors.
 * @memberof module:editor
 * @function
 */

function run() {
    window.simulationHasRunSuccessfully_tab = false;
    loadTableToDiagram();
    if (!Array.isArray(myDiagram.model.nodeDataArray) || myDiagram.model.nodeDataArray.length === 0) {
        document.getElementById("simErrorPopupDesc").innerHTML = "The model is empty. Please add at least one stock, variable, or flow before running the simulation.";
        showSimErrorPopup();
        return;
    }

    var json = JSON.parse(myDiagram.model.toJson());
    var engineJson = translate(json);

    console.log(engineJson);
    for(var i =0; i<engineJson.influences.length; i++) {
        if(engineJson.influences[i].tolabel.startsWith("$")){
            var tarlab = engineJson.influences[i].tolabel.substring(1);
            for(var j =0; j<engineJson.labelsandkeys.length; j++){
                if(engineJson.labelsandkeys[j].label == tarlab){
                    engineJson.influences[i].to = engineJson.labelsandkeys[j].key;
                }
            }
        }
        if(engineJson.influences[i].fromlabel.startsWith("$")){
            var tarlab = engineJson.influences[i].fromlabel.substring(1);
            for(var j =0; j<engineJson.labelsandkeys.length; j++){
                if(engineJson.labelsandkeys[j].label == tarlab){
                    engineJson.influences[i].from = engineJson.labelsandkeys[j].key;
                }
            }
        }
    }

    for (var i = 0; i < engineJson.variables.length; i++) {
        var variable = engineJson.variables[i];
        var references = containsReference(variable.equation);
        var newReferences = [];

        for (var t = 0; t < references.length; t++) {
            var found = false;
            for (var c = 0; c < engineJson.labelsandkeys.length; c++) {
                const ref = references[t];
                const label = engineJson.labelsandkeys[c].label;
                const key = engineJson.labelsandkeys[c].key;

                if (ref == label) {
                    console.log(`Match found: '${ref}' => '${key}'`);
                    newReferences.push(key);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log(`No match for '${references[t]}', keeping original`);
                newReferences.push(references[t]);
            }
        }
        if (newReferences.length > 0) {
            for (var h = 0; h < newReferences.length; h++) {
                var currentKey = "";

                var exists = false;
                for (var j = 0; j < engineJson.influences.length; j++) {
                    if (engineJson.influences[j].to === variable.key && engineJson.influences[j].from === newReferences[h]) {
                        exists = true;
                    }
                    if (engineJson.influences[j].to === variable.key && !newReferences.includes(engineJson.influences[j].from)) {
                        console.log(engineJson.influences[j].from);
                        console.log(newReferences);
                        document.getElementById("simErrorPopupDesc").innerHTML = "Incorrect influence from " + engineJson.influences[j].fromlabel + " to " + engineJson.influences[j].tolabel;
                        showSimErrorPopup();
                        window.simulationHasRunSuccessfully_tab = false;
                        return;
                    }
                }
                if (!exists) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "Missing an influence from " + references[h] + " to " + variable.label;
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        } else {
            for (var j = 0; j < engineJson.influences.length; j++) {
                if (engineJson.influences[j].to === variable.key) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "No references in equation for " + variable.label + ", but influence from " + engineJson.influences[j].from + " exists.";
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        }
    }

    for (var i = 0; i < engineJson.valves.length; i++) {
        var valve = engineJson.valves[i];
        var references = containsReference(valve.equation);
        console.log(references);
        console.log(engineJson.labelsandkeys);
        var newReferences = [];

        for (var t = 0; t < references.length; t++) {
            var found = false;
            for (var c = 0; c < engineJson.labelsandkeys.length; c++) {
                const ref = references[t];
                const label = engineJson.labelsandkeys[c].label;
                const key = engineJson.labelsandkeys[c].key;

                if (ref == label) {
                    console.log(`Match found: '${ref}' => '${key}'`);
                    newReferences.push(key);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log(`No match for '${references[t]}', keeping original`);
                newReferences.push(references[t]);
            }
        }
        console.log(engineJson.influences);
        console.log(newReferences);
        if (newReferences.length > 0) {
            for (var j = 0; j < newReferences.length; j++) {
                var exists = false;
                for (var h = 0; h < engineJson.influences.length; h++) {
                    console.log(engineJson.influences[h].to == newReferences[j] && engineJson.influences[h].from == valve.key);
                    if ((engineJson.influences[h].to == newReferences[j] && engineJson.influences[h].from == valve.key) || (engineJson.influences[h].to == valve.key && engineJson.influences[h].from == newReferences[j])) {
                        exists = true;
                    }
                    if (engineJson.influences[h].to == valve.key && !newReferences.includes(engineJson.influences[h].from)) {
                        console.log(engineJson.influences[h]);
                        document.getElementById("simErrorPopupDesc").innerHTML = "Incorrect influence from " + engineJson.influences[h].from + " to " + engineJson.influences[h].to;
                        showSimErrorPopup();
                        window.simulationHasRunSuccessfully_tab = false;
                        return;
                    }
                }
                if (!exists) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "Missing an influence from " + references[j] + " to " + valve.label;
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        } else {
            for (var j = 0; j < engineJson.influences.length; j++) {
                if (engineJson.influences[j].to == valve.key) {
                    document.getElementById("simErrorPopupDesc").innerHTML = "No references in equation for " + valve.label + ", but influence from " + engineJson.influences[j].from + " exists.";
                    showSimErrorPopup();
                    window.simulationHasRunSuccessfully_tab = false;
                    return;
                }
            }
        }
    }


    var startTime = document.getElementById("startTime").value;
    var endTime = document.getElementById("endTime").value;
    var dt = document.getElementById("dt").value;
    var integrationMethod = document.getElementById("integrationMethod").value == "euler" ? "euler" : "rk4";
    var trigMode = document.getElementById("trigMode").value == "radian" ? "radian" : "degree";

    document.getElementById("startTime").classList = "settings-input simParamsInput";
    document.getElementById("endTime").classList = "settings-input simParamsInput";
    document.getElementById("dt").classList = "settings-input simParamsInput";

    var errors = [];
    if (isNaN(Number(startTime))) {
        errors.push("- The start time must be a number");
        document.getElementById("startTime").classList = "simParamsInput simParamsInputError";
    }
    if (isNaN(Number(endTime))) {
        errors.push("- The end time must be a number");
        document.getElementById("endTime").classList = "simParamsInput simParamsInputError";
    }
    if (isNaN(Number(dt))) {
        errors.push("- The dt must be a number");
        document.getElementById("dt").classList = "simParamsInput simParamsInputError";
    }

    if (errors.length != 0) {
        window.scroll({
            top: document.body.scrollHeight, behavior: "smooth",
        });
        document.getElementById("simErrorPopupDesc").innerHTML = "There are errors with the simulation parameters:<br><br>" + errors.join("<br>");
        showSimErrorPopup();
        window.simulationHasRunSuccessfully_tab = false;
        return;
    }

    if (Number(startTime) >= Number(endTime)) {
        errors.push("- The end time must be greater than the start time");
        document.getElementById("endTime").classList = "simParamsInput simParamsInputError";
    }

    if (Number(dt) > Number(endTime) - Number(startTime)) {
        errors.push("- The dt must be less than or equal to the duration.");
        document.getElementById("dt").classList = "simParamsInput simParamsInputError";
    }

    if (Number(dt) <= 0) {
        errors.push("- The dt must be positive");
        document.getElementById("dt").classList = "simParamsInput simParamsInputError";
    }

    if (errors.length != 0) {
        window.scroll({
            top: document.body.scrollHeight, behavior: "smooth",
        });
        document.getElementById("simErrorPopupDesc").innerHTML = "There are errors with the simulation parameters:<br><br>" + errors.join("<br>");
        showSimErrorPopup();
        window.simulationHasRunSuccessfully_tab = false;
        return;
    }

    if ((Number(endTime) - Number(startTime)) / Number(dt) >= 1000) {
        if (!document.getElementById("simParamHighStepCount").checked) {
            document.getElementById("dt").classList = "simParamsInput simParamsInputWarning";
            window.scroll({
                top: document.body.scrollHeight, behavior: "smooth",
            });
            document.getElementById("simErrorPopupDesc").innerHTML = "This simulation contains 1000+ steps; as such, running it may lead to lag or the website freezing. Please adjust dt or enable high step-count simulations.<br><br>If you proceed with the simulation, it may be wise to export your LunaSim project in case the website crashes.";
            showSimErrorPopup();
            window.simulationHasRunSuccessfully_tab = false;
            return;
        }
    }


    engineJson.start_time = parseFloat(startTime);
    engineJson.end_time = parseFloat(endTime);
    engineJson.dt = parseFloat(dt);
    engineJson.integration_method = integrationMethod;
    engineJson.trigMode = trigMode;


    try {
        sim.setData(engineJson);

        if (PERFORMANCE_MODE === true) console.time('Simulation Runtime');
        data = sim.run();
        if (PERFORMANCE_MODE === true) console.timeEnd('Simulation Runtime');

        sim.reset();

        window.simulationHasRunSuccessfully_button = true;

        window.scroll({top: 0, behavior: "smooth"});
        document.getElementById("secondaryOpen").click();

        const modelViewer = document.querySelector('.modelViewer');
        const chartViewer = document.querySelector('.chartViewer');
        const modelBtn = document.getElementById('modelBtn');
        const chartBtn = document.getElementById('chartBtn');

        if (chartViewer.classList.contains('hidden')) {
            chartViewer.classList.remove('hidden');
            modelViewer.classList.add('hidden');
            chartBtn.classList.add('active');
            modelBtn.classList.remove('active');
        }

    } catch (err) {
        console.error("Simulation failed:", err);
        document.getElementById("simErrorPopupDesc").innerHTML = "Simulation Error: " + err.message;
        showSimErrorPopup();

        window.simulationHasRunSuccessfully_tab = false;
    }


}

/**
 * Changes the active tool button's visual state by toggling the "active" class.
 * Removes "active" class from all elements with class "tool",
 * then adds the "active" class to the clicked button.
 * @memberof module:editor
 * @function
 * @param {Event} evt - The click event triggered by selecting a tool button.
 * @property {HTMLCollectionOf<Element>} tablinks - Elements with class "tool" (tool buttons).
 */
function toolSelect(evt) {
    var i, tabcontent, tablinks;
    tablinks = document.getElementsByClassName("tool");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    evt.currentTarget.className += " active";
}

/**
 * Changes the displayed tab content and updates the active tab button styling.
 * Hides all elements with class "tabContent", removes "active" class from all tab buttons,
 * then shows the selected tab content and marks the clicked tab button as active.
 * @memberof module:editor
 * @function
 * @param {Event} evt - The click event triggered by selecting a tab button.
 * @param {string} tabName - The id of the tab content element to show.
 * @property {HTMLCollectionOf<Element>} tabcontent - Elements with class "tabContent" (tab panels).
 * @property {HTMLCollectionOf<Element>} tablinks - Elements with class "tablinks" (tab buttons).
 */

function opentab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabContent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

/**
 * Exports the current diagram data and simulation parameters to a downloadable file.
 * Converts the diagram model to JSON, adds simulation parameters from UI inputs,
 * then triggers a download of the JSON data as a file named after the model.
 * Updates export-related status flags and timestamps.
 * @memberof module:editor
 * @function
 */

function exportData() {
    var filename = document.getElementById("model_name").value;
    loadTableToDiagram();
    var json = JSON.parse(myDiagram.model.toJson());

    json.simulationParameters = {
        "startTime": parseFloat(document.getElementById("startTime").value),
        "endTime": parseFloat(document.getElementById("endTime").value),
        "dt": parseFloat(document.getElementById("dt").value),
        "integrationMethod": document.getElementById("integrationMethod").value == "euler" ? "euler" : "rk4",
        "trigMode": document.getElementById("trigMode").value == "radian" ? "radian" : "degree"
    };

    download(`${filename}.luna`, JSON.stringify(json));

    lastExportDate = new Date();
    hasExportedYet = true;
    unsavedEdits = false;
    updateSaveStatus();
}

/**
 * Creates and triggers a download of a text file with the given filename and content.
 * Uses a temporary anchor element and simulates a click event to start the download.
 * @memberof module:editor
 * @function
 * @param {string} filename - The name of the file to be downloaded.
 * @param {string} text - The text content to include in the downloaded file.
 */
function download(filename, text) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        pom.dispatchEvent(event);
    } else {
        pom.click();
    }
}

/**
 * Loads a diagram model from a selected file input event.
 * Parses the file content as JSON, validates it, and updates UI and diagram accordingly.
 * Loads simulation parameters if present; resets to defaults otherwise.
 * Handles blank model warnings and resets save/export statuses.
 * @memberof module:editor
 * @function
 * @param {Event} evt - The file input change event containing the selected file.
 */
function loadModel(evt) {
    const file = evt.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        let parsedJson;
        try {
            parsedJson = JSON.parse(e.target.result);
        } catch (err) {
            showAlertPopup({
                title: "Invalid File Format",
                message: `Something went wrong while parsing this file. It may not be a valid LunaSim model.\n\nDetails:\n${err.message}`,
                onContinue: () => {}
            });
            return;
        }

        const isBlank = Array.isArray(parsedJson.Pc) && parsedJson.Pc.length === 0;

        const applyModel = () => {
            // Set simulation parameters
            if (parsedJson.simulationParameters) {
                document.getElementById("startTime").value = parsedJson.simulationParameters.startTime;
                document.getElementById("endTime").value = parsedJson.simulationParameters.endTime;
                document.getElementById("dt").value = parsedJson.simulationParameters.dt;
                document.getElementById("integrationMethod").value = parsedJson.simulationParameters.integrationMethod;
                document.getElementById("trigMode").value = parsedJson.simulationParameters.trigMode;
            } else {
                document.getElementById("startTime").value = 0;
                document.getElementById("endTime").value = 10;
                document.getElementById("dt").value = 0.1;
                document.getElementById("integrationMethod").value = "rk4";
                document.getElementById("trigMode").value = "radian";
            }

            // Reset model & table
            myDiagram.model = go.Model.fromJson(`{
        "class": "GraphLinksModel",
        "linkLabelKeysProperty": "labelKeys",
        "nodeDataArray": [],
        "linkDataArray": []
      }`);
            $('#eqTableBody').empty();

            // Load new model
            myDiagram.model = go.Model.fromJson(parsedJson);
            updateTable(true);
            loadTableToDiagram();
            myDiagram.initialPosition = myDiagram.position;

            if (file.name) {
                document.getElementById("model_name").value = file.name.replace(/\.[^/.]+$/, "");
            }

            lastEditDate = new Date();
            unsavedEdits = false;
            lastExportDate = new Date();
            hasExportedYet = false;
            updateSaveStatus();
        };

        if (isBlank) {
            showConfirmPopup({
                title: "Load Blank Model?",
                message: "This model appears to be blank! Are you sure you want to load it?",
                onConfirm: applyModel,
                onCancel: () => {
                    console.log("User cancelled blank model load.");
                }
            });

            return;
        }

        applyModel();
    };

    reader.readAsText(file);
}




/**
 * Toggles the dark theme stylesheet on or off.
 * Saves the dark mode status in sessionStorage.
 * Shows a popup notification suggesting the user refresh the page to apply all theme changes.
 * @memberof module:editor
 * @function
 * @param {boolean} orig - If true, suppresses the popup notification (used on page load).
 */
function switch_theme(orig) {
    var dark = document.getElementById("darkThemeCSS");
    if (dark.disabled) {
        dark.disabled = false;
        sessionStorage.setItem("darkMode", true);
    } else {
        dark.disabled = true;
        sessionStorage.setItem("darkMode", false);
    }

    if (!orig) {
        var popupNotif = document.getElementById("popupNotif");
        var popupNotifText = document.getElementById("popupNotifText");
        popupNotifText.innerHTML = "Refresh to apply all theme changes";
        popupNotif.style.visibility = "visible";
    }
}

document.getElementById("switchThemeButton").addEventListener("click", function () {
    switch_theme(false)
});
document.getElementById("popupNotifClose").addEventListener("click", function () {
    popupNotif.style.visibility = "hidden";
});

document.getElementById("labelFontSizeInput").addEventListener("change", function () {
    const val = parseFloat(this.value);
    if (!isNaN(val) && val > 0) {
        labelFontSize = val;
        const newFont = `bold ${val}pt helvetica, bold arial, sans-serif`;

        // Rebuild templates so any newly-added nodes use the updated size.
        buildTemplates();

        // GoJS reuses existing Part objects when the model data is unchanged,
        // so swapping the model won't repaint existing TextBlocks.
        // Instead, walk the visual tree and update every TextBlock directly.
        function applyFontToObj(obj) {
            if (obj instanceof go.TextBlock) {
                obj.font = newFont;
            }
            if (obj instanceof go.Panel) {
                obj.elements.each(function(child) { applyFontToObj(child); });
            }
        }

        myDiagram.commit(function(diag) {
            diag.nodes.each(function(node) { applyFontToObj(node); });
            diag.links.each(function(link) { applyFontToObj(link); });
        }, "update font size");
    }
});

/** Returns the polarityLabel node data attached to an influence link, or null. */
function getPolarityLabelData(link) {
    const keys = link.data.labelKeys || [];
    for (let i = 0; i < keys.length; i++) {
        const nd = myDiagram.model.findNodeDataForKey(keys[i]);
        if (nd && nd.category === "polarityLabel") return nd;
    }
    return null;
}

/**
 * Creates, updates, or removes the polarityLabel node for an influence link.
 * @param {go.Link} link
 * @param {string|null} polarity "+" | "-" | null (null removes the label)
 */
function setPolarityLabel(link, polarity) {
    const existing = getPolarityLabelData(link);
    if (!polarity) {
        if (existing) {
            const newKeys = (link.data.labelKeys || []).filter(function(k) { return k !== existing.key; });
            myDiagram.model.setDataProperty(link.data, "labelKeys", newKeys);
            myDiagram.model.removeNodeData(existing);
        }
    } else if (existing) {
        myDiagram.model.setDataProperty(existing, "polarity", polarity);
    } else {
        // Generate the key before addNodeData so labelKeys never gets undefined.
        const newKey = "pl_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
        const labelData = { key: newKey, category: "polarityLabel", polarity: polarity };
        myDiagram.model.addNodeData(labelData);
        const newKeys = (link.data.labelKeys || []).concat([newKey]);
        myDiagram.model.setDataProperty(link.data, "labelKeys", newKeys);
    }
}

function applyPolarityOffset() {
    buildTemplates(); // so newly-added label nodes use the updated offset
    myDiagram.commit(function(diag) {
        diag.nodes.each(function(node) {
            if (node.data && node.data.category === "polarityLabel") {
                node.segmentOffset = new go.Point(polarityOffsetX, polarityOffsetY);
            }
        });
    }, "update polarity offset");
}

document.getElementById("polarityOffsetX").addEventListener("change", function () {
    const val = parseFloat(this.value);
    if (!isNaN(val)) { polarityOffsetX = val; applyPolarityOffset(); }
});
document.getElementById("polarityOffsetY").addEventListener("change", function () {
    const val = parseFloat(this.value);
    if (!isNaN(val)) { polarityOffsetY = val; applyPolarityOffset(); }
});

document.getElementById("clearEmphasisButton").addEventListener("click", function () {
    myDiagram.model.startTransaction("clear emphasis");
    myDiagram.nodes.each(function(node) {
        myDiagram.model.setDataProperty(node.data, "emphasized", false);
    });
    myDiagram.links.each(function(link) {
        myDiagram.model.setDataProperty(link.data, "emphasized", false);
    });
    myDiagram.model.commitTransaction("clear emphasis");
});

window.onload = function () {
    if (sessionStorage.modelData) {
        myDiagram.model = go.Model.fromJson(sessionStorage.modelData);

        console.log("here");
        updateTable(true);
        loadTableToDiagram();
    }
    if (sessionStorage.getItem("darkMode") == "true") {
        switch_theme(true);
    }
}

document.getElementById("loadButton").addEventListener("click", function () {
    if (unsavedEdits) {
        showConfirmPopup({
            title: "Unsaved Changes Detected",
            message: "You've made changes to this model. If you load a new one now without exporting, your changes will be lost! Continue?",
            onConfirm: () => {
                document.getElementById("load-actual-button").click();
                closePopup();
            }
        });
    } else {
        document.getElementById("load-actual-button").click();
    }
});



init();

myDiagram.toolManager.textEditingTool.doActivate = function() {
    const tb = this.textBlock;
    if (tb) tb.opacity = 0;
    go.TextEditingTool.prototype.doActivate.call(this);
};

myDiagram.toolManager.textEditingTool.doDeactivate = function() {
    const tb = this.textBlock;
    if (tb) tb.opacity = 1;
    go.TextEditingTool.prototype.doDeactivate.call(this);
};


document.getElementById("centerModelBtn").addEventListener("click", function () {
    myDiagram.zoomToFit();

    const diagramBounds = myDiagram.documentBounds;
    const viewBounds = myDiagram.viewportBounds;

    const diagramCenter = diagramBounds.center;
    const viewCenter = viewBounds.center;

    const offset = diagramCenter.subtract(viewCenter);
    myDiagram.position = myDiagram.position.copy().add(offset);
});


document.getElementById("pointer_button").addEventListener("click", function () {
    setMode("pointer", "pointer");
    toolSelect(event);
});
document.getElementById("stock_button").addEventListener("click", function () {
    setMode("node", "stock");
    toolSelect(event);
});
document.getElementById("cloud_button").addEventListener("click", function () {
    setMode("node", "cloud");
    toolSelect(event);
});
document.getElementById("variable_button").addEventListener("click", function () {
    setMode("node", "variable");
    toolSelect(event);
});
document.getElementById("flow_button").addEventListener("click", function () {
    setMode("link", "flow");
    toolSelect(event);
});
document.getElementById("influence_button").addEventListener("click", function () {
    setMode("link", "influence");
    toolSelect(event);
});
document.getElementById("pointer_button").click();

document.getElementById("defaultOpen").addEventListener("click", function () {
    opentab(event, "modalView");
});
document.getElementById("secondaryOpen").addEventListener("click", function () {
    opentab(event, "chartsTables");
});
document.getElementById("defaultOpen").click();


document.getElementById("load-actual-button").addEventListener("change", loadModel);
document.getElementById("runButton").addEventListener("click", function () {
    run();
});
document.getElementById("exportButton").addEventListener("click", function () {
    exportData();
});

document.getElementById("text_button").addEventListener("click", function () {
    setMode("node", "text");
    toolSelect(event);
});

document.getElementById("conveyor_button").addEventListener("click", function () {
    setMode("node", "conveyor");
    toolSelect(event);
});

document.getElementById("microwave_button").addEventListener("click", function () {
    setMode("node", "microwave");
    toolSelect(event);
});

document.getElementById("queue_button").addEventListener("click", function () {
    setMode("node", "queue");
    toolSelect(event);
});

document.getElementById("overflow_button").addEventListener("click", function () {
    setMode("link", "overflow");
    toolSelect(event);
});

// ── Image button: open file picker, read as base64, place node on canvas ──────
(function () {
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png, image/jpeg, image/jpg";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    document.getElementById("image_button").addEventListener("click", function (e) {
        e.preventDefault();
        // Return to pointer mode immediately — image placement is one-shot
        setMode("pointer", "pointer");
        fileInput.value = "";      // allow re-selecting the same file
        fileInput.click();
    });

    fileInput.addEventListener("change", function () {
        var file = fileInput.files[0];
        if (!file) return;

        // Warn on large files (> 2 MB)
        if (file.size > 2 * 1024 * 1024) {
            if (!confirm("This image is larger than 2 MB and may slow down saving/loading. Continue?")) {
                return;
            }
        }

        var reader = new FileReader();
        reader.onload = function (evt) {
            var dataUrl = evt.target.result;

            // Place the image in the centre of the current viewport
            var vb = myDiagram.viewportBounds;
            var cx = vb.centerX;
            var cy = vb.centerY;

            myDiagram.model.commit(function (m) {
                var nodeData = {
                    category: "image",
                    imageData: dataUrl,
                    imgSize:   "50 50",          // default: stock-sized (50x50)
                    loc: cx + " " + cy
                };
                m.addNodeData(nodeData);
            }, "insert image");
        };
        reader.readAsDataURL(file);
    });
}());

document.getElementById("clearButton").addEventListener("click", function () {
    showConfirmPopup({
        title: "Clear Model?",
        message: "Do you want to clear this model and start a new one? Your current project will be wiped!",
        onConfirm: () => {
            closePopup(); // Hide first popup

            setTimeout(() => {
                showConfirmPopup({
                    title: "Final Confirmation",
                    message: "Are you REALLY sure? If you want to save the project you're working on, press CANCEL and export it first. Otherwise, the data will be cleared. You've been warned!",
                    onConfirm: () => {
                        closePopup(); // Hide second popup

                        // ✅ Clear Model Logic
                        document.getElementById("model_name").value = "New Project";
                        document.getElementById("startTime").value = 0;
                        document.getElementById("endTime").value = 10;
                        document.getElementById("dt").value = 0.1;
                        document.getElementById("integrationMethod").value = "rk4";
                        document.getElementById("trigMode").value = "radian";

                        myDiagram.model = go.Model.fromJson(`{
              "class": "GraphLinksModel",
              "linkLabelKeysProperty": "labelKeys",
              "nodeDataArray": [],
              "linkDataArray": []
            }`);

                        $('#eqTableBody').empty();

                        lastEditDate = new Date();
                        unsavedEdits = false;
                        lastExportDate = new Date();
                        hasExportedYet = false;
                        updateSaveStatus();
                    }
                });
            }, 150); // 🔁 match fade-out duration of first popup
        }
    });
});

window.addEventListener('beforeunload', function (e) {
    if (unsavedEdits) e.preventDefault();
});

export {data};

/**
 * Returns the unit string for a given node label, or null if N/A / not set.
 * Used by tabsManagement to annotate chart series and table columns.
 * @param {string} name - The node label to look up.
 * @returns {string|null} The unit string, or null if none.
 * @memberof module:editor
 */
function getUnitForName(name) {
    if (!myDiagram) return null;
    const nodeData = myDiagram.model.nodeDataArray.find(n => n.label === name);
    if (!nodeData) return null;
    const u = nodeData.units;
    return (u && u.trim() !== '' && u.trim() !== 'N/A') ? u.trim() : null;
}
export { getUnitForName };
const JAVA_MATH_FUNCTIONS = [
  'sin()', 'cos()', 'tan()', 'asin()', 'acos()', 'atan()', 'atan2()',
  'sinh()', 'cosh()', 'tanh()', 'exp()', 'log()', 'log10()', 'sqrt()', 'cbrt()',
  'abs()', 'ceil()', 'floor()', 'round()', 'pow()', 'max()', 'min()', 'sign()',
  'random()', 'hypot()', 'expm1()', 'log1p()', 'sec()', 'csc()', 'cot()'
];

/**
 * Default units available in the units autocomplete dropdown.
 * Users may also type custom units freely.
 * @memberof module:editor
 * @type {string[]}
 */
const UNITS_LIST = [
  // SI base units
  'second', 'meter', 'kilogram', 'kelvin', 'ampere', 'mole', 'candela',
  // SI time
  'seconds', 'minute', 'minutes', 'hour', 'hours',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  // SI mass
  'kg', 'g', 'mg', 'tonne', 'ton', 'lb', 'oz',
  // SI length
  'meters', 'm', 'km', 'cm', 'mm', 'mile', 'miles', 'ft', 'inch',
  // SI derived - energy
  'Joule', 'joules', 'J', 'kJ', 'MJ', 'kWh', 'cal', 'kcal', 'BTU',
  // SI derived - power
  'Watt', 'watts', 'W', 'kW', 'MW', 'GW',
  // SI derived - force/pressure
  'Newton', 'N', 'Pascal', 'Pa', 'atm', 'bar', 'psi', 'kPa',
  // SI derived - electricity
  'Coulomb', 'C', 'Volt', 'V', 'Ampere', 'A', 'Ohm', 'Hertz', 'Hz',
  // population / social
  'people', 'person', 'individuals', 'population', 'household', 'households',
  'births', 'deaths', 'workers', 'employees',
  // economics
  'dollar', 'dollars', 'USD', 'EUR', 'GBP', 'JPY',
  // volume
  'liter', 'liters', 'L', 'mL', 'gallon', 'gallons',
  // generic
  'unit', 'units', 'item', 'items',
  // rates
  'people/year', 'people/day', 'people/hour',
  'kg/s', 'kg/year', 'kg/day',
  'USD/year', 'USD/day', 'items/day', 'items/year',
  'births/year', 'deaths/year',
  'm/s', 'km/hr', 'mph', 'fps',
  // dimensionless
  '%', 'percent', 'fraction', 'ratio', 'dimensionless',
  // temperature
  '°C', '°F', 'K',
];


/*
// Auto-enhance inputs in the 3rd column (Equation)
function enhanceExistingInputs() {
    document.querySelectorAll('#eqTableBody tr').forEach(row => {
        const equationCell = row.children[2];
        if (equationCell) {
            const input = equationCell.querySelector('input');
            if (input) enhanceExistingInputs(input);
        }
    });
}

// Watch for new rows in the equation editor
const observer = new MutationObserver(() => {
    enhanceExistingInputs();
});
observer.observe(document.getElementById('eqTableBody'), {
    childList: true,
    subtree: true
});
*/

/**
 * Returns the top 5 matching Java math function suggestions based on input.
 * Used for autocomplete suggestions in the equation editor.
 * @memberof module:editor
 * @function
 * @param {string} input - The partial function name input by the user.
 * @returns {string[]} An array of suggested function names starting with the input.
 */
function getTopMathMatches(input) {
    const lowerInput = input.toLowerCase();
    return JAVA_MATH_FUNCTIONS
        .filter(func => func.toLowerCase().startsWith(lowerInput))
        .slice(0, 5);
}

/**
 * Determines whether the cursor position inside a text input is currently within brackets [].
 * Checks for unmatched opening bracket '[' before the cursor without a closing bracket ']'.
 * @memberof module:editor
 * @function
 * @param {string} text - The full text string in the input field.
 * @param {number} cursorPos - The cursor position index in the text.
 * @returns {boolean} True if the cursor is inside unmatched brackets, false otherwise.
 */
function isCursorInsideBrackets(text, cursorPos) {
    const before = text.slice(0, cursorPos);
    const open = before.lastIndexOf("[");
    const close = before.lastIndexOf("]");
    return open > close; // True if last unmatched bracket is open
}

/**
 * Returns the top 5 matching GoJS element labels for autocomplete suggestions.
 * If fragment is empty, returns the first 5 default labels.
 * @memberof module:editor
 * @function
 * @param {string} fragment - The partial text input to match against.
 * @returns {string[]} Array of suggested GoJS element labels matching the fragment.
 */
function getTopBracketMatches(fragment) {
    const lower = fragment.toLowerCase();

    if (fragment === "") {
        return GOJS_ELEMENT_LABELS.slice(0, 5);
    }

    return GOJS_ELEMENT_LABELS
        .filter(label => label.toLowerCase().startsWith(lower))
        .slice(0, 5); // best 5 matches
}
function finalizeRename() {
    const $input = $(this);
    const newName = $input.val();
    const oldName = $input.data('oldName');

    if (!oldName || newName === oldName) return;

    if (!labelValidator(null, oldName, newName)) {
        showAlertPopup({
            title: "Invalid or Duplicate Name",
            message: `The name "${newName}" is invalid or already in use.\nIt will be reset to "${oldName}".`
        });
        $input.val(oldName);
        return;
    }

    const tableState = {};
    $('#eqTableBody').find('tr').each(function () {
        const rowName = $(this).find('input[name="name"]').val();
        tableState[rowName] = {
            equation: $(this).find('input[name="equation"]').val(),
            checkbox: $(this).find('input[name="checkbox"]').is(':checked'),
            units: $(this).find('input[name="units"]').val() || ''
        };
    });

    const $row = $input.closest('tr');
    const equation = $row.find('input[name="equation"]').val();
    const checkbox = $row.find('input[name="checkbox"]').is(':checked');

    myDiagram.model.commit(() => {
        // Find the node being renamed
        const nodeData = myDiagram.model.nodeDataArray.find(n => n.label === oldName);
        if (nodeData) {
            myDiagram.model.setDataProperty(nodeData, 'label', newName);
            if (nodeData.key === oldName) {
                myDiagram.model.setDataProperty(nodeData, 'key', newName);
            }
            myDiagram.model.setDataProperty(nodeData, 'equation', equation);
            myDiagram.model.setDataProperty(nodeData, 'checkbox', checkbox);
        }

        const pattern = new RegExp(`\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g');
        myDiagram.model.nodeDataArray.forEach(n => {
            if (typeof n.equation === 'string') {
                const updated = n.equation.replace(pattern, `[${newName}]`);
                if (updated !== n.equation) {
                    myDiagram.model.setDataProperty(n, 'equation', updated);
                }
            }
        });
    }, 'Rename node');

    myDiagram.model.commit(() => {
        Object.keys(tableState).forEach(origName => {
            const targetLabel = (origName === oldName) ? newName : origName;
            const node = myDiagram.model.nodeDataArray.find(n => n.label === targetLabel);
            if (node) {
                myDiagram.model.setDataProperty(node, 'equation', tableState[origName].equation);
                myDiagram.model.setDataProperty(node, 'checkbox', tableState[origName].checkbox);
                myDiagram.model.setDataProperty(node, 'units', tableState[origName].units || '');
            }
        });
    }, 'Reapply table edits after rename');

    $input.data('oldName', newName);

    updateTable(true);
}



/**
 * Sets up autocomplete functionality for all equation input fields in the equation table body.
 * Handles showing suggestions on input, keyboard navigation, selection insertion,
 * and closing the autocomplete dropdown on blur or outside clicks.
 * @memberof module:editor
 * @function
 */
function setupAutocompleteForInputs() {
    const $tbody = $('#eqTableBody');
    const $tpopupbody = $('#equationEditorPopupContent');

    [$tbody, $tpopupbody].forEach($container => {
        // === Autocomplete for equation fields ===
        $container.on('input', 'input[name="equation"]', function (e) {
            if (e.originalEvent && ["ArrowUp", "ArrowDown", "Tab"].includes(e.originalEvent.key)) return;
            showAutocomplete($(this));
        });

        $container.on('keydown', 'input[name="equation"]', function (e) {
            const $input = $(this);
            const dropdown = $('.autocomplete-list');
            const items = dropdown.find('.autocomplete-item');
            let selected = items.filter('.selected');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selected.length === 0) {
                    items.first().addClass('selected');
                } else {
                    const next = selected.removeClass('selected').next();
                    (next.length ? next : items.first()).addClass('selected');
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selected.length === 0) {
                    items.last().addClass('selected');
                } else {
                    const prev = selected.removeClass('selected').prev();
                    (prev.length ? prev : items.last()).addClass('selected');
                }
                return;
            }

            if ((e.key === 'Tab' || e.key === 'Enter') && selected.length > 0) {
                e.preventDefault();
                e.stopPropagation();

                const cursorPos = $input[0].selectionStart;
                const fullText = $input.val();

                const isInBrackets = isCursorInsideBrackets(fullText, cursorPos);
                let before = fullText.slice(0, cursorPos);
                const after = fullText.slice(cursorPos);
                const replacement = selected.text();
                let updated, newCursor;

                if (isInBrackets) {
                    before = before.replace(/\[([^\[\]]*)$/, `[${replacement}`);
                    if (after.trim().startsWith("]")) {
                        updated = before + after;
                        newCursor = before.length;
                    } else {
                        updated = before + "]" + after;
                        newCursor = before.length + 1;
                    }
                } else {
                    const match = before.match(/(\w+)$/);
                    const currentFragment = match ? match[1] : "";
                    const fragmentStart = cursorPos - currentFragment.length;

                    const funcName = selected.text();
                    const withParens = funcName.endsWith("()") ? funcName : funcName + "()";

                    before = fullText.slice(0, fragmentStart);
                    updated = before + withParens + after;
                    newCursor = before.length + withParens.indexOf("()") + 1;
                }

                $input.val(updated);
                $input[0].setSelectionRange(newCursor, newCursor);
                $('.autocomplete-list').remove();
            }
        });

        // === Autocomplete for units fields ===
        $container.on('input focus', 'input[name="units"]', function () {
            showUnitsAutocomplete($(this));
        });

        $container.on('keydown', 'input[name="units"]', function (e) {
            const $input = $(this);
            const dropdown = $('.units-autocomplete-list');
            const items = dropdown.find('.units-autocomplete-item');
            let selected = items.filter('.selected');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selected.length === 0) items.first().addClass('selected');
                else { const next = selected.removeClass('selected').next(); (next.length ? next : items.first()).addClass('selected'); }
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selected.length === 0) items.last().addClass('selected');
                else { const prev = selected.removeClass('selected').prev(); (prev.length ? prev : items.last()).addClass('selected'); }
                return;
            }
            if ((e.key === 'Tab' || e.key === 'Enter') && selected.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                $input.val(selected.text());
                $('.units-autocomplete-list').remove();
                loadTableToDiagram();
            }
            if (e.key === 'Escape') {
                $('.units-autocomplete-list').remove();
            }
        });

        $container.on('blur', 'input[name="units"]', function () {
            setTimeout(() => {
                if (!$(':hover').hasClass('units-autocomplete-item')) {
                    $('.units-autocomplete-list').remove();
                }
                // Save when user leaves the units field
                loadTableToDiagram();
            }, 150);
        });

        // === Track original name when editing starts ===
        $container.on('focusin', 'input[name="name"]', function () {
            $(this).data('oldName', $(this).val());
        });

        // === Trigger rename logic on blur ===
        $container.on('blur', 'input[name="name"]', function () {
            finalizeRename.call(this);
        });

        // === Also trigger rename on Enter ===
        $container.on('keydown', 'input[name="name"]', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                $(this).blur(); // blur triggers finalizeRename
            }
        });

        // === Cleanup autocomplete list on blur ===
        $container.on('blur', 'input[name="equation"]', function () {
            setTimeout(() => {
                if (!$(':hover').hasClass('autocomplete-item')) {
                    $('.autocomplete-list').remove();
                }
            }, 150);
        });
    });

    // === Dismiss autocomplete dropdown on outside click ===
    $(document).on('mousedown', function (e) {
        if (!$(e.target).closest('.autocomplete-list, input[name="equation"]').length) {
            $('.autocomplete-list').remove();
        }
        if (!$(e.target).closest('.units-autocomplete-list, input[name="units"]').length) {
            $('.units-autocomplete-list').remove();
        }
    });
}


/**
 * Shows an autocomplete dropdown for the given jQuery input element.
 * Detects the current cursor position and extracts the relevant fragment
 * either inside brackets [] or as a word to suggest completions.
 * Inserts the selected autocomplete item into the input field on click.
 * @memberof module:editor
 * @function
 * @param {JQuery} $input - jQuery-wrapped input element to show autocomplete for.
 */

function showAutocomplete($input) {
    const cursorPos = $input[0].selectionStart;
    const fullText = $input.val();

    const isInBrackets = isCursorInsideBrackets(fullText, cursorPos);

    let currentFragment = "";
    if (isInBrackets) {
        const match = fullText.slice(0, cursorPos).match(/\[([^\[\]]*)$/);
        currentFragment = match ? match[1] : "";
    } else {
        const match = fullText.slice(0, cursorPos).match(/(?:^|\W)(\w+)$/);
        currentFragment = match ? match[1] : "";
    }

    $('.autocomplete-list').remove();

    if (!currentFragment && !isInBrackets) return;

    const matches = isInBrackets ? getTopBracketMatches(currentFragment) : getTopMathMatches(currentFragment);

    if (matches.length === 0) return;

    const dropdown = $('<div class="autocomplete-list"></div>');
    matches.forEach(match => {
        const item = $('<div class="autocomplete-item"></div>').text(match);
        item.on('mousedown', function (e) {
            e.preventDefault();

            let before = fullText.slice(0, cursorPos);
            let after = fullText.slice(cursorPos);
            let updated, newCursor;

            if (isInBrackets) {
                before = before.replace(/\[([^\[\]]*)$/, `[${match}`);
                if (after.trim().startsWith("]")) {
                    updated = before + after;
                    newCursor = before.length;
                } else {
                    updated = before + "]" + after;
                    newCursor = before.length + 1;
                }

            } else {
                const funcName = match;
                const withParens = funcName.endsWith("()") ? funcName : funcName + "()";
                before = before.replace(/(\w+)$/, withParens);
                updated = before + after;
                newCursor = before.length - 1;
            }


            $input.val(updated);
            $input[0].setSelectionRange(newCursor, newCursor);
            $('.autocomplete-list').remove();
        });
        dropdown.append(item);
    });

    const offset = $input.offset();
    dropdown.css({
        position: "absolute", top: offset.top + $input.outerHeight(), left: offset.left, width: $input.outerWidth()
    });

    $('body').append(dropdown);

    setTimeout(() => {
        const firstItem = dropdown.find('.autocomplete-item').first();
        if (firstItem.length) {
            $('.autocomplete-item').removeClass('selected');
            firstItem.addClass('selected');
        }
    }, 0);
}


/**
 * Shows an autocomplete dropdown for the units input field.
 * Filters UNITS_LIST by what the user has typed so far.
 * @memberof module:editor
 * @function
 * @param {JQuery} $input - jQuery-wrapped units input element.
 */
function showUnitsAutocomplete($input) {
    $('.units-autocomplete-list').remove();

    const fragment = ($input.val() || '').toLowerCase();

    let matches;
    if (fragment === '') {
        matches = UNITS_LIST.slice(0, 8);
    } else {
        matches = UNITS_LIST.filter(u => u.toLowerCase().startsWith(fragment));
        // Also include contains-matches after startsWith
        const contains = UNITS_LIST.filter(u =>
            !u.toLowerCase().startsWith(fragment) && u.toLowerCase().includes(fragment)
        );
        matches = [...matches, ...contains].slice(0, 8);
    }

    if (matches.length === 0) return;

    const dropdown = $('<div class="units-autocomplete-list"></div>');
    matches.forEach((unit, idx) => {
        const item = $('<div class="units-autocomplete-item"></div>').text(unit);
        if (idx === 0) item.addClass('selected');
        item.on('mousedown', function (e) {
            e.preventDefault();
            $input.val(unit);
            $('.units-autocomplete-list').remove();
            loadTableToDiagram();
        });
        dropdown.append(item);
    });

    const offset = $input.offset();
    dropdown.css({
        position: 'absolute',
        top: offset.top + $input.outerHeight(),
        left: offset.left,
        width: Math.max($input.outerWidth(), 140)
    });

    $('body').append(dropdown);
}


/**
 * Saves the given GoJS diagram as a PNG image file with optional margin.
 * Uses the diagram's makeImageData API to get image Blob and triggers a download.
 * @memberof module:editor
 * @function
 * @param {go.Diagram} diagram - The GoJS diagram instance to export.
 * @param {string} [filename="diagram.png"] - The filename to save as.
 * @param {number} [margin=15] - Margin in pixels around the diagram in the exported image.
 */

function saveDiagramAsPng(diagram, filename = "diagram.png", margin = 15) {
    diagram.makeImageData({
        background: "white", scale: 1, padding: margin,
        returnType: "blob", callback: function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}

/**
 * Saves the given GoJS diagram as a JPG image file with optional margin.
 * Uses the diagram's makeImageData API to get image Blob and triggers a download.
 * @memberof module:editor
 * @function
 * @param {go.Diagram} diagram - The GoJS diagram instance to export.
 * @param {string} [filename="diagram.jpg"] - The filename to save as.
 * @param {number} [margin=15] - Margin in pixels around the diagram in the exported image.
 */
function saveDiagramAsJpg(diagram, filename = "diagram.jpg", margin = 15) {
    diagram.makeImageData({
        background: "white", scale: 1, padding: margin,
        returnType: "blob", callback: function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}

/**
 * Saves the given GoJS diagram as a TIFF image file with optional margin.
 * Uses the diagram's makeImageData API to get image Blob and triggers a download.
 * @memberof module:editor
 * @function
 * @param {go.Diagram} diagram - The GoJS diagram instance to export.
 * @param {string} [filename="diagram.tiff"] - The filename to save as.
 * @param {number} [margin=15] - Margin in pixels around the diagram in the exported image.
 */
function saveDiagramAsTiff(diagram, filename = "diagram.tiff", margin = 15) {
    diagram.makeImageData({
        background: "white", scale: 1, padding: margin,
        returnType: "blob", callback: function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
}


/**
 * Generates and downloads a PDF report of the current LunaSim model.
 * Uses jsPDF + jspdf-autotable. Called by the Download PDF button.
 */
function generatePDF() {
    const { jsPDF } = window.jspdf;

    const modelName    = (document.getElementById("model_name").value || "LunaSim Model").trim();
    const fontChoice   = document.getElementById("pdfFont").value || "helvetica";
    const description  = document.getElementById("pdfDescription").value.trim();
    const inclDiagram  = document.getElementById("pdfIncludeDiagram").checked;
    const inclStocks   = document.getElementById("pdfIncludeStocks").checked;
    const inclFlows    = document.getElementById("pdfIncludeFlows").checked;
    const inclVars     = document.getElementById("pdfIncludeVariables").checked;
    const inclQueues   = document.getElementById("pdfIncludeQueues").checked;
    const inclSim      = document.getElementById("pdfIncludeSimSettings").checked;

    // Colour palette
    const C_HEADER_BG  = [40, 52, 88];    // dark navy
    const C_HEADER_FG  = [255, 255, 255];
    const C_ROW_ALT    = [240, 244, 255];  // light blue-grey
    const C_ROW_NORM   = [255, 255, 255];
    const C_ACCENT     = [98, 123, 192];   // LunaSim blue
    const C_TEXT       = [30,  40,  70];

    const PAGE_W = 210;  // A4 mm
    const MARGIN = 15;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    // Extract model data from GoJS model
    loadTableToDiagram();
    const modelJson = JSON.parse(myDiagram.model.toJson());
    const nodes = modelJson.nodeDataArray || [];

    const stocks    = nodes.filter(n => n.category === "stock");
    const queues    = nodes.filter(n => n.category === "queue");
    const conveyors = nodes.filter(n => n.category === "conveyor");
    const microwaves= nodes.filter(n => n.category === "microwave");
    const flows     = nodes.filter(n => n.category === "valve" && !String(n.label).startsWith("$"));
    const variables = nodes.filter(n => n.category === "variable" && !String(n.label).startsWith("$"));

    const simParams = {
        startTime:  document.getElementById("startTime").value,
        endTime:    document.getElementById("endTime").value,
        dt:         document.getElementById("dt").value,
        method:     document.getElementById("integrationMethod").value === "euler" ? "Euler" : "RK4",
        trig:       document.getElementById("trigMode").value === "radian" ? "Radians" : "Degrees"
    };

    // ── Helper: captures the GoJS diagram as a data URL, then calls back ────
    function withDiagramImage(cb) {
        myDiagram.makeImageData({
            background: "white",
            scale: 2,
            padding: 20,
            returnType: "blob",
            callback: function(blob) {
                const reader = new FileReader();
                reader.onload = function(e) { cb(e.target.result); };
                reader.readAsDataURL(blob);
            }
        });
    }

    function buildPDF(diagramDataUrl) {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        doc.setFont(fontChoice);

        let y = MARGIN;

        // ── Title bar ────────────────────────────────────────────────────────
        doc.setFillColor(...C_HEADER_BG);
        doc.roundedRect(MARGIN, y, CONTENT_W, 14, 3, 3, "F");
        doc.setTextColor(...C_HEADER_FG);
        doc.setFontSize(16);
        doc.setFont(fontChoice, "bold");
        doc.text(modelName, MARGIN + CONTENT_W / 2, y + 9.5, { align: "center" });
        y += 18;

        // ── Description ──────────────────────────────────────────────────────
        if (description) {
            doc.setFont(fontChoice, "italic");
            doc.setFontSize(10);
            doc.setTextColor(...C_TEXT);
            const lines = doc.splitTextToSize(description, CONTENT_W);
            doc.text(lines, MARGIN, y);
            y += lines.length * 5 + 4;
        }

        // ── Section heading helper ────────────────────────────────────────────
        function sectionHeading(title) {
            if (y > 260) { doc.addPage(); y = MARGIN; }
            doc.setFillColor(...C_ACCENT);
            doc.rect(MARGIN, y, CONTENT_W, 0.5, "F");
            y += 3;
            doc.setFont(fontChoice, "bold");
            doc.setFontSize(12);
            doc.setTextColor(...C_HEADER_BG);
            doc.text(title, MARGIN, y + 4);
            y += 9;
        }

        // ── autoTable wrapper ────────────────────────────────────────────────
        function addTable(head, body) {
            if (body.length === 0) body = [Array(head[0].length).fill("—")];
            doc.autoTable({
                startY: y,
                margin: { left: MARGIN, right: MARGIN },
                head: head,
                body: body,
                styles: {
                    font: fontChoice,
                    fontSize: 9,
                    textColor: C_TEXT,
                    cellPadding: 2.5,
                    overflow: "linebreak",
                    lineColor: [200, 210, 230],
                    lineWidth: 0.2
                },
                headStyles: {
                    fillColor: C_HEADER_BG,
                    textColor: C_HEADER_FG,
                    fontStyle: "bold",
                    fontSize: 9
                },
                alternateRowStyles: { fillColor: C_ROW_ALT },
                rowStyles:          { fillColor: C_ROW_NORM },
                tableWidth: CONTENT_W,
                didDrawPage: (data) => { y = data.cursor.y + 6; }
            });
            y = doc.lastAutoTable.finalY + 6;
        }

        // ── Diagram image ────────────────────────────────────────────────────
        if (inclDiagram && diagramDataUrl) {
            sectionHeading("Model Diagram");
            // Fit image to page width, preserve aspect ratio
            const imgProps = doc.getImageProperties(diagramDataUrl);
            const imgW  = CONTENT_W;
            const imgH  = (imgProps.height / imgProps.width) * imgW;
            const maxH  = 120;
            const finalH = Math.min(imgH, maxH);
            const finalW = finalH === maxH ? (imgProps.width / imgProps.height) * maxH : imgW;
            const xOff  = MARGIN + (CONTENT_W - finalW) / 2;
            if (y + finalH > 280) { doc.addPage(); y = MARGIN; }
            doc.addImage(diagramDataUrl, "PNG", xOff, y, finalW, finalH);
            y += finalH + 8;
        }

        // ── Queues table ──────────────────────────────────────────────────────
        if (inclQueues && queues.length > 0) {
            sectionHeading("Queues");
            addTable(
                [["Name", "Initial Value", "Capacity", "Units", "Non-Negative"]],
                queues.map(n => [
                    n.label    || "",
                    n.equation || "0",
                    n.capacity !== undefined ? String(n.capacity) : "100",
                    n.units    || "",
                    n.checkbox ? "Yes" : "No"
                ])
            );
        }

        // ── Stocks table ─────────────────────────────────────────────────────
        if (inclStocks) {
            if (stocks.length > 0) {
                sectionHeading("Stocks");
                addTable(
                    [["Name", "Initial Value", "Units", "Non-Negative"]],
                    stocks.map(n => [
                        n.label || "",
                        n.equation || "0",
                        n.units    || "",
                        n.checkbox ? "Yes" : "No"
                    ])
                );
            }

            if (conveyors.length > 0) {
                sectionHeading("Conveyors");
                addTable(
                    [["Name", "Initial Value", "Transit Time", "Units", "Non-Negative"]],
                    conveyors.map(n => [
                        n.label       || "",
                        n.equation    || "0",
                        n.transitTime !== undefined ? String(n.transitTime) : "1",
                        n.units       || "",
                        n.checkbox    ? "Yes" : "No"
                    ])
                );
            }

            if (microwaves.length > 0) {
                sectionHeading("Microwaves");
                addTable(
                    [["Name", "Initial Value", "Cook Time", "Units", "Non-Negative"]],
                    microwaves.map(n => [
                        n.label    || "",
                        n.equation || "0",
                        n.cookTime !== undefined ? String(n.cookTime) : "1",
                        n.units    || "",
                        n.checkbox ? "Yes" : "No"
                    ])
                );
            }

            if (stocks.length === 0 && conveyors.length === 0 && microwaves.length === 0) {
                sectionHeading("Stocks, Conveyors & Microwaves");
                doc.setFont(fontChoice, "italic");
                doc.setFontSize(9);
                doc.setTextColor(160, 160, 160);
                doc.text("No elements in this category.", MARGIN, y);
                y += 8;
            }
        }

        // ── Flows table ───────────────────────────────────────────────────────
        if (inclFlows) {
            sectionHeading("Flows");
            addTable(
                [["Name", "Equation", "Units", "Uniflow"]],
                flows.length > 0 ? flows.map(n => [
                    n.label    || "",
                    n.equation || "0",
                    n.units    || "",
                    n.checkbox ? "Yes" : "No"
                ]) : [["—", "—", "—", "—"]]
            );
        }

        // ── Variables table ───────────────────────────────────────────────────
        if (inclVars) {
            sectionHeading("Variables");
            addTable(
                [["Name", "Equation", "Units"]],
                variables.length > 0 ? variables.map(n => [
                    n.label    || "",
                    n.equation || "0",
                    n.units    || ""
                ]) : [["—", "—", "—"]]
            );
        }

        // ── Simulation settings table ─────────────────────────────────────────
        if (inclSim) {
            sectionHeading("Simulation Settings");
            addTable(
                [["Parameter", "Value"]],
                [
                    ["Start Time",          simParams.startTime],
                    ["End Time",            simParams.endTime],
                    ["Time Step (dt)",      simParams.dt],
                    ["Integration Method",  simParams.method],
                    ["Trigonometry Mode",   simParams.trig]
                ]
            );
        }

        // ── Footer on every page ──────────────────────────────────────────────
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont(fontChoice, "normal");
            doc.setFontSize(8);
            doc.setTextColor(160, 170, 200);
            doc.text(
                `Generated by LunaSim  •  Page ${i} of ${pageCount}`,
                PAGE_W / 2, 295, { align: "center" }
            );
        }

        doc.save(`${modelName}.pdf`);

        lastExportDate = new Date();
        hasExportedYet = true;
        unsavedEdits   = false;
        updateSaveStatus();
        closeSettings("exportPopup");
    }

    // Capture diagram then build — or build immediately if diagram not included
    if (inclDiagram) {
        withDiagramImage(buildPDF);
    } else {
        buildPDF(null);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("downloadPdfButton").addEventListener("click", generatePDF);
});


/**
 * Event listener for the "Download Image" button.
 * Reads user-selected export format and margin, and triggers the appropriate
 * diagram image export function.
 * Updates export and save status flags accordingly.
 * @memberof module:editor
 * @function
 */
document.getElementById("downloadImageButton").addEventListener("click", function () {
    const type = document.getElementById("fileSelect").value;
    const marginInput = parseInt(document.getElementById("imageMargin").value);
    const margin = isNaN(marginInput) ? 15 : marginInput;
    const filename = (document.getElementById("model_name").value || "diagram").trim();

    if (!myDiagram) {
        showAlertPopup({
            title: "Export Error",
            message: "Diagram is not initialized. Unable to proceed with export.",
            onConfirm: () => {}
        });
        return;
    }

    switch (type) {
        case ".png":
            saveDiagramAsPng(myDiagram, filename + ".png", margin);
            break;
        case ".jpg":
            saveDiagramAsJpg(myDiagram, filename + ".jpg", margin);
            break;
        case ".tiff":
            saveDiagramAsTiff(myDiagram, filename + ".tiff", margin);
            break;
        default:
            showAlertPopup({
                title: "Unsupported Export Type",
                message: `The selected export format (${type}) is not supported.`,
                onConfirm: () => {},
            });
            return;

    }

    lastExportDate = new Date();
    hasExportedYet = true;
    unsavedEdits = false;
    updateSaveStatus();
});

/**
 * Initializes autocomplete functionality on all relevant input fields
 * when the document is ready.
 * @memberof module:editor
 * @function
 */
$(document).ready(() => {
    setupAutocompleteForInputs();
});

/**
 * Returns the default color string (hex) for a given diagram element type.
 * Used for setting default node/link colors on creation.
 * @memberof module:editor
 * @function
 * @param {string} type - The element type (e.g., "stock", "variable", "valve", "flow", "influence").
 * @returns {string} The corresponding hex color code.
 */
function getDefaultColor(type) {
    switch (type) {
        case "stock":     return _modelColors.stock     || '#cfcfcf';
        case "conveyor":  return _modelColors.conveyor  || '#cfcfcf';
        case "variable":  return _modelColors.variable  || '#cfcfcf';
        case "valve":     return _modelColors.flow      || '#3489eb';
        case "flow":      return _modelColors.flow      || '#3489eb';
        case "microwave": return _modelColors.microwave  || '#cfcfcf';
        case "queue":     return _modelColors.queue      || '#cfcfcf';
        case "influence": return _modelColors.influence || '#e3680e';
        default:          return '#f0f0f0';
    }
}

/**
 * Sets up localStorage persistence for the diagram.
 * Loads saved diagram model from localStorage if present.
 * Registers an event listener on window unload to save the current model back to localStorage.
 * @memberof module:editor
 * @function
 * @param {go.Diagram} diagram - The GoJS diagram instance to persist.
 */
function setupLocalStoragePersistence(diagram) {
    const savedModel = localStorage.getItem("model");
    if (savedModel) {
        try {
            myDiagram.model = go.Model.fromJson(savedModel);
            updateTable(true);
            loadTableToDiagram();
        } catch (e) {
            console.error("Failed to parse saved diagram model:", e);
        }
    }

    window.addEventListener("beforeunload", () => {
        loadTableToDiagram();
        const json = myDiagram.model.toJson();
        localStorage.setItem("model", json);
    });
}

const modelNameInput = document.getElementById('model_name');

const savedName = localStorage.getItem('model_name');
if (savedName) {
    modelNameInput.value = savedName;
}

modelNameInput.addEventListener('input', () => {
    localStorage.setItem('model_name', modelNameInput.value);
});

// ── Resizable panels ────────────────────────────────────────────────────────
// Makes the gap between two adjacent flex panels draggable so the user can
// resize them.  The resizer div itself keeps its fixed 1vw width; only the
// neighbouring panels grow or shrink.
(function () {
    /**
     * Wires up a col-resize drag handle between two adjacent flex children.
     * @param {string} resizerId - id of the .panel-resizer div
     * @param {string} leftSel   - CSS selector for the left panel
     * @param {string} rightSel  - CSS selector for the right panel
     * @param {object} [opts]    - optional limits: { leftMin, leftMax, rightMin, rightMax }
     */
    function makeResizer(resizerId, leftSel, rightSel, opts) {
        const resizer = document.getElementById(resizerId);
        if (!resizer) return;

        opts = opts || {};

        let startX, startLeftW, startRightW, defaultRightW;

        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();

            const leftEl  = document.querySelector(leftSel);
            const rightEl = document.querySelector(rightSel);
            if (!leftEl || !rightEl) return;

            startX      = e.clientX;
            startLeftW  = leftEl.getBoundingClientRect().width;
            startRightW = rightEl.getBoundingClientRect().width;

            // Capture the natural right-panel width the first time, as a fallback min.
            if (!defaultRightW) {
                defaultRightW = startRightW;
            }

            const vw = window.innerWidth;
            const leftMin  = opts.leftMin  !== undefined ? opts.leftMin  : 160;
            const leftMax  = opts.leftMax  !== undefined ? opts.leftMax  : Infinity;
            const rightMin = opts.rightMin !== undefined ? opts.rightMin : defaultRightW;
            const rightMax = opts.rightMax !== undefined ? opts.rightMax : vw * 0.60;

            resizer.classList.add('dragging');
            document.body.style.cursor     = 'col-resize';
            document.body.style.userSelect = 'none';

            function onMove(e) {
                const dx = e.clientX - startX;

                let newLeft  = startLeftW  + dx;
                let newRight = startRightW - dx;

                // Clamp left panel
                if (newLeft < leftMin) {
                    newLeft  = leftMin;
                    newRight = startLeftW + startRightW - leftMin;
                }
                if (newLeft > leftMax) {
                    newLeft  = leftMax;
                    newRight = startLeftW + startRightW - leftMax;
                }
                // Clamp right panel
                if (newRight < rightMin) {
                    newRight = rightMin;
                    newLeft  = startLeftW + startRightW - rightMin;
                }
                if (newRight > rightMax) {
                    newRight = rightMax;
                    newLeft  = startLeftW + startRightW - rightMax;
                }

                leftEl.style.flex  = 'none';
                leftEl.style.width = newLeft + 'px';

                rightEl.style.flex  = 'none';
                rightEl.style.width = newRight + 'px';

                if (window.myDiagram) window.myDiagram.requestUpdate();
            }

            function onUp() {
                resizer.classList.remove('dragging');
                document.body.style.cursor     = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',   onUp);
                if (window.myDiagram) window.myDiagram.requestUpdate();
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Toolbar ↔ Canvas: toolbar expands from 72px (collapsed) to 128px (2-col).
        // Canvas shrinks to compensate but never below 160px.
        makeResizer('toolbarResizer',    '.toolbar',      '.modelCanvas', {
            leftMin:  72,
            leftMax:  128,
            rightMin: 160
        });
        // Chart Sidebar ↔ Chart Canvas: same treatment as toolbar resizer.
        makeResizer('chartSidebarResizer', '.chartSidebar', '.chartCanvas', {
            leftMin:  72,
            leftMax:  128,
            rightMin: 160
        });
        makeResizer('modelPanelResizer', '.modelCanvas', '#eqEditor');
        makeResizer('chartPanelResizer', '.chartCanvas', '.chartEditor');
    });
}());
// ── Model color customization & theme tab switching ──────────────────────────

var MC_DEFAULTS = {
    stock:      '#cfcfcf',
    conveyor:   '#cfcfcf',
    variable:   '#cfcfcf',
    cloud:      '#d4e4f7',
    flow:       '#3489eb',
    influence:  '#e3680e',
    microwave:  '#cfcfcf',
    queue:      '#cfcfcf',
    labelcolor: '#000000',
    canvasbg:   '#ffffff'
};

function mcLoad() {
    try {
        var s = localStorage.getItem('lunaModelColors');
        return s ? Object.assign({}, MC_DEFAULTS, JSON.parse(s)) : Object.assign({}, MC_DEFAULTS);
    } catch(e) { return Object.assign({}, MC_DEFAULTS); }
}

function mcSave(c) {
    localStorage.setItem('lunaModelColors', JSON.stringify(c));
}

function mcSyncUI(c) {
    Object.keys(MC_DEFAULTS).forEach(function(k) {
        var picker = document.getElementById('mc-' + k);
        if (picker) picker.value = c[k] || MC_DEFAULTS[k];
    });
}

function mcApplyAll(c) {
    if (!window.myDiagram) return;
    // Update the live global so buildTemplates() reads the new colours
    Object.assign(_modelColors, c);
    myDiagram.model.commit(function() {
        myDiagram.model.nodeDataArray.forEach(function(node) {
            if (node.label && node.label.startsWith('$')) return;
            var cat = node.category;
            if (cat === 'stock')     myDiagram.model.setDataProperty(node, 'color', c.stock);
            if (cat === 'conveyor')  myDiagram.model.setDataProperty(node, 'color', c.conveyor);
            if (cat === 'variable')  myDiagram.model.setDataProperty(node, 'color', c.variable);
            if (cat === 'cloud')     myDiagram.model.setDataProperty(node, 'color', c.cloud);
            if (cat === 'valve')     myDiagram.model.setDataProperty(node, 'color', c.flow);
            if (cat === 'microwave') myDiagram.model.setDataProperty(node, 'color', c.microwave);
            if (cat === 'queue')     myDiagram.model.setDataProperty(node, 'color', c.queue);
            // Apply default label color to any node without a per-node override
            if (['stock','conveyor','variable','valve','microwave','queue'].indexOf(cat) >= 0) {
                if (!node.labelColor) myDiagram.model.setDataProperty(node, 'labelColor', c.labelcolor || '#000000');
            }
        });
        // Clear per-link flow color overrides so all flows use the new palette color
        myDiagram.model.linkDataArray.forEach(function(link) {
            if (link.category === 'flow') {
                myDiagram.model.setDataProperty(link, 'flowColor', null);
                myDiagram.model.setDataProperty(link, 'flowHeadColor', null);
            }
        });
    }, 'apply model colors');
    // Rebuild templates so new nodes + links also pick up updated colours
    buildTemplates();
    myDiagram.requestUpdate();
}

document.addEventListener('DOMContentLoaded', function() {
    // Sync the global _modelColors from localStorage on page load
    Object.assign(_modelColors, mcLoad());
    var modelColors = _modelColors;

    // --- tab switching (scoped per popup container) ---
    function initTabBar(container) {
        if (!container) return;
        container.querySelectorAll('.theme-tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                container.querySelectorAll('.theme-tab-btn').forEach(function(b) { b.classList.remove('active'); });
                container.querySelectorAll('.theme-tab-content').forEach(function(c) { c.style.display = 'none'; });
                btn.classList.add('active');
                var target = document.getElementById(btn.getAttribute('data-tab'));
                if (target) target.style.display = 'flex';
            });
        });
    }
    initTabBar(document.getElementById('themePopup'));
    initTabBar(document.getElementById('settingsPopup'));

    // --- sync pickers to stored colours ---
    mcSyncUI(modelColors);

    // --- live preview on change (picker is its own swatch) ---
    Object.keys(MC_DEFAULTS).forEach(function(k) {
        var picker = document.getElementById('mc-' + k);
        if (!picker) return;
        picker.addEventListener('input', function() {
            modelColors[k] = picker.value;
        });
    });

    // --- Apply to All button ---
    var applyBtn = document.getElementById('mc-apply-all');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            mcSave(modelColors);
            mcApplyAll(modelColors);
        });
    }

    // --- Reset button ---
    var resetBtn = document.getElementById('mc-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            modelColors = Object.assign({}, MC_DEFAULTS);
            mcSave(modelColors);
            mcSyncUI(modelColors);
            mcApplyAll(modelColors);
        });
    }

    // Re-sync whenever theme popup is opened so saved colours always show
    var paletteBtn = document.querySelector('a[onclick*="themePopup"]');
    if (paletteBtn) {
        paletteBtn.addEventListener('click', function() {
            modelColors = mcLoad();
            mcSyncUI(modelColors);
        });
    }
});

// ── Element Control Panel ─────────────────────────────────────────────────────
(function () {

    function ecpEl(id) { return document.getElementById(id); }

    function setVisible(el, vis) {
        if (!el) return;
        if (vis) el.classList.add('visible');
        else     el.classList.remove('visible');
    }

    function resolveCategory(part) {
        if (!part) return null;
        if (part instanceof go.Link) return part.data.category || 'flow';
        var cat = part.data.category;
        if (cat === 'valve') return 'flow';
        if (cat === 'overflow-valve') return 'overflow';
        return cat;
    }

    function valveNodeForLink(link) {
        if (!link.labelNodes) return null;
        return link.labelNodes.first();
    }

    function linkForValve(valveNode) {
        var key = valveNode.data.key;
        var ld = myDiagram.model.linkDataArray.find(function(l) {
            return (l.category === 'flow' || l.category === 'overflow') &&
                   l.labelKeys && l.labelKeys.indexOf(key) >= 0;
        });
        return ld ? myDiagram.findLinkForData(ld) : null;
    }

    function ecpSetPanelVisible(vis) {
        var panel = ecpEl('elemControlPanel');
        if (!panel) return;
        if (vis) panel.classList.add('ecp-visible');
        else     panel.classList.remove('ecp-visible');
    }

    function ecpEnabled() {
        var cb = ecpEl('settingShowECP');
        return !cb || cb.checked;
    }

    // Walk a GoJS node's visual tree to find label TextBlocks and update a property.
    // This forces an immediate visual repaint on top of the data binding update.
    function walkNodeLabels(node, fn) {
        if (!node || !node.elements) return;
        node.elements.each(function(el) {
            if (el instanceof go.TextBlock && el._isNodeLabel) fn(el);
            if (el instanceof go.Panel) {
                el.elements.each(function(child) {
                    if (child instanceof go.TextBlock && child._isNodeLabel) fn(child);
                    // textbox puts its TextBlock one level deeper in an Auto panel
                    if (child instanceof go.Panel) {
                        child.elements.each(function(gc) {
                            if (gc instanceof go.TextBlock) fn(gc);
                        });
                    }
                });
            }
        });
    }

    // ── Sync UI from selected part ─────────────────────────────────────────────
    window._ecpSync = function() {
        if (!ecpEnabled()) { ecpSetPanelVisible(false); return; }

        var sel = myDiagram.selection.first();

        var ALL_ROWS = ['ecpName','ecpColorRow','ecpFlowColorRow','ecpTransitRow',
                        'ecpCookTimeRow','ecpCapacityRow','ecpLabelColorRow','ecpLabelSizeRow'];
        ALL_ROWS.forEach(function(id) { setVisible(ecpEl(id), false); });

        if (!sel) { ecpSetPanelVisible(false); return; }

        var cat = resolveCategory(sel);
        var ignoreCats = ['polarityLabel', 'influence', 'overflow', 'overflow-valve'];
        if (ignoreCats.indexOf(cat) >= 0) { ecpSetPanelVisible(false); return; }

        ecpSetPanelVisible(true);

        // Resolve data refs
        var nodeData = null, linkData = null;
        if (sel instanceof go.Link) {
            linkData = sel.data;
            var vn = valveNodeForLink(sel);
            if (vn) nodeData = vn.data;
        } else {
            nodeData = sel.data;
            if (cat === 'flow') {
                var fl = linkForValve(sel);
                if (fl) linkData = fl.data;
            }
        }

        // Name
        var nameEl = ecpEl('ecpName');
        if (nameEl) {
            nameEl.textContent = nodeData ? (nodeData.label || '—') : '—';
            setVisible(nameEl, true);
        }

        // Body fill (stock, conveyor, variable, cloud, microwave)
        var fillCats = ['stock','conveyor','variable','cloud','microwave','queue'];
        if (fillCats.indexOf(cat) >= 0 && nodeData) {
            setVisible(ecpEl('ecpColorRow'), true);
            var cp = ecpEl('ecpColorPicker');
            if (cp) cp.value = nodeData.color || _modelColors[cat] || '#cfcfcf';
        }

        // Flow body color
        if (cat === 'flow') {
            if (!linkData && sel.data && sel.data.category === 'valve') {
                var fl2 = linkForValve(sel);
                if (fl2) linkData = fl2.data;
            }
            if (linkData) {
                setVisible(ecpEl('ecpFlowColorRow'), true);
                var bp = ecpEl('ecpFlowBodyColor');
                if (bp) bp.value = linkData.flowColor || _modelColors.flow || '#3489eb';
            }
        }

        // Transit time (conveyor)
        if (cat === 'conveyor' && nodeData) {
            setVisible(ecpEl('ecpTransitRow'), true);
            var tt = ecpEl('ecpTransitTime');
            if (tt) tt.value = nodeData.transitTime !== undefined ? nodeData.transitTime : '1';
        }

        // Cook time (microwave)
        if (cat === 'microwave' && nodeData) {
            setVisible(ecpEl('ecpCookTimeRow'), true);
            var ct = ecpEl('ecpCookTime');
            if (ct) ct.value = nodeData.cookTime !== undefined ? nodeData.cookTime : '1';
        }

        // Capacity (queue)
        if (cat === 'queue' && nodeData) {
            setVisible(ecpEl('ecpCapacityRow'), true);
            var cap = ecpEl('ecpCapacity');
            if (cap) cap.value = nodeData.capacity !== undefined ? nodeData.capacity : '100';
        }

        // Label color + size
        var labelCats = ['stock','conveyor','variable','flow','textbox','microwave','queue'];
        if (labelCats.indexOf(cat) >= 0 && nodeData) {
            setVisible(ecpEl('ecpLabelColorRow'), true);
            setVisible(ecpEl('ecpLabelSizeRow'), true);
            var lc = ecpEl('ecpLabelColor');
            var ls = ecpEl('ecpLabelSize');
            var mc = typeof mcLoad === 'function' ? mcLoad() : {};
            var defaultLabelColor = (mc.labelcolor) || (_modelColors && _modelColors.labelcolor) || '#000000';
            if (lc) lc.value = nodeData.labelColor || defaultLabelColor;
            if (ls) ls.value = nodeData.labelSize  || labelFontSize;
        }
    };

    // ── Wire after DOM ready ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {

        var attempts = 0;
        var iv = setInterval(function () {
            attempts++;
            if (window.myDiagram && myDiagram.addDiagramListener) {
                clearInterval(iv);
                myDiagram.addDiagramListener('ChangedSelection', function() { window._ecpSync(); });
                myDiagram.addModelChangedListener(function(e) {
                    if (!e.isTransactionFinished) return;
                    if (myDiagram.selection.count > 0) window._ecpSync();
                });
            }
            if (attempts > 100) clearInterval(iv);
        }, 50);

        var settingCb = ecpEl('settingShowECP');
        if (settingCb) {
            settingCb.addEventListener('change', function() {
                if (!settingCb.checked) ecpSetPanelVisible(false);
                else window._ecpSync();
            });
        }

        // ── Body fill color ────────────────────────────────────────────────────
        var cp = ecpEl('ecpColorPicker');
        if (cp) {
            cp.addEventListener('change', function () {
                var sel = myDiagram.selection.first();
                if (!sel || sel instanceof go.Link) return;
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(sel.data, 'color', cp.value);
                }, 'set node color');
            });
        }
        var resetBtn = ecpEl('ecpResetColor');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                var sel = myDiagram.selection.first();
                if (!sel || sel instanceof go.Link) return;
                var cat = resolveCategory(sel);
                var def = _modelColors[cat] || '#cfcfcf';
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(sel.data, 'color', def);
                }, 'reset node color');
                if (cp) cp.value = def;
            });
        }

        // ── Flow body color ────────────────────────────────────────────────────
        var bp = ecpEl('ecpFlowBodyColor');
        function getActiveLinkData() {
            var sel = myDiagram.selection.first();
            if (!sel) return null;
            if (sel instanceof go.Link) return sel.data;
            if (sel.data && sel.data.category === 'valve') {
                var fl = linkForValve(sel);
                return fl ? fl.data : null;
            }
            return null;
        }
        if (bp) {
            bp.addEventListener('change', function () {
                var ld = getActiveLinkData();
                if (!ld) return;
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(ld, 'flowColor', bp.value);
                }, 'set flow body color');
            });
        }
        var flowResetBtn = ecpEl('ecpFlowResetColor');
        if (flowResetBtn) {
            flowResetBtn.addEventListener('click', function () {
                var ld = getActiveLinkData();
                if (!ld) return;
                var def = _modelColors.flow || '#3489eb';
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(ld, 'flowColor', null);
                }, 'reset flow color');
                if (bp) bp.value = def;
            });
        }

        // ── Capacity (queue) ──────────────────────────────────────────────────
        var capInp = ecpEl('ecpCapacity');
        if (capInp) {
            function applyCapacity() {
                var sel = myDiagram.selection.first();
                if (!sel || sel instanceof go.Link) return;
                if (resolveCategory(sel) !== 'queue') return;
                var val = parseFloat(capInp.value);
                if (isNaN(val) || val <= 0) return;
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(sel.data, 'capacity', val);
                }, 'set capacity');
            }
            capInp.addEventListener('change', applyCapacity);
            capInp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); applyCapacity(); capInp.blur(); }
            });
        }

        // ── Transit time (conveyor) ────────────────────────────────────────────
        var ttInp = ecpEl('ecpTransitTime');
        if (ttInp) {
            function applyTT() {
                var sel = myDiagram.selection.first();
                if (!sel || sel instanceof go.Link) return;
                var val = parseFloat(ttInp.value);
                if (isNaN(val) || val <= 0) return;
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(sel.data, 'transitTime', val);
                }, 'set transit time');
            }
            ttInp.addEventListener('change', applyTT);
            ttInp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); applyTT(); ttInp.blur(); }
            });
        }

        // ── Cook time (microwave) ──────────────────────────────────────────────
        var ctInp = ecpEl('ecpCookTime');
        if (ctInp) {
            function applyCookTime() {
                var sel = myDiagram.selection.first();
                if (!sel || sel instanceof go.Link) return;
                if (resolveCategory(sel) !== 'microwave') return;
                var val = parseFloat(ctInp.value);
                if (isNaN(val) || val <= 0) return;
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(sel.data, 'cookTime', val);
                }, 'set cook time');
            }
            ctInp.addEventListener('change', applyCookTime);
            ctInp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); applyCookTime(); ctInp.blur(); }
            });
        }

        // ── Label color ────────────────────────────────────────────────────────
        // FIX: write to model data AND force a live repaint via walkNodeLabels.
        // GoJS makeTwoWay() should handle the repaint, but since textStyle() sets
        // an initial stroke at build time, the binding can be stale until the next
        // full template rebuild. walkNodeLabels forces the TextBlock.stroke update
        // immediately so the user sees the change without needing a refresh.
        var lcPicker = ecpEl('ecpLabelColor');
        if (lcPicker) {
            lcPicker.addEventListener('change', function () {
                var sel = myDiagram.selection.first();
                if (!sel) return;
                // Resolve node data — for a flow link resolve to the valve node
                var nd = (sel instanceof go.Link) ? (function(){
                    var vn = valveNodeForLink(sel); return vn ? vn.data : null;
                }()) : sel.data;
                if (!nd) return;
                var color = lcPicker.value;
                // Commit to model data (binding will persist this across saves)
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(nd, 'labelColor', color);
                }, 'set label color');
                // Force immediate visual repaint
                var visualNode = (sel instanceof go.Link) ? valveNodeForLink(sel) : sel;
                if (visualNode) {
                    myDiagram.commit(function() {
                        walkNodeLabels(visualNode, function(tb) { tb.stroke = color; });
                    }, null);
                }
            });
        }

        // ── Label size ─────────────────────────────────────────────────────────
        var lsPicker = ecpEl('ecpLabelSize');
        if (lsPicker) {
            function applyLabelSize() {
                var sel = myDiagram.selection.first();
                if (!sel) return;
                var nd = (sel instanceof go.Link) ? (function(){
                    var vn = valveNodeForLink(sel); return vn ? vn.data : null;
                }()) : sel.data;
                if (!nd) return;
                var pt = parseFloat(lsPicker.value);
                if (isNaN(pt) || pt <= 0) return;
                var font = 'bold ' + pt + 'pt helvetica, bold arial, sans-serif';
                myDiagram.model.commit(function () {
                    myDiagram.model.setDataProperty(nd, 'labelSize', pt);
                }, 'set label size');
                var visualNode = (sel instanceof go.Link) ? valveNodeForLink(sel) : sel;
                if (visualNode) {
                    myDiagram.commit(function() {
                        walkNodeLabels(visualNode, function(tb) { tb.font = font; });
                    }, null);
                }
            }
            lsPicker.addEventListener('change', applyLabelSize);
            lsPicker.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); applyLabelSize(); lsPicker.blur(); }
            });
        }

    }); // end DOMContentLoaded

}()); // end ECP IIFE



// ── Settings popup — Visual tab, Key Binds tab, Canvas/Textbox colors ────────
(function () {

    // ── Default key binds ─────────────────────────────────────────────────────
    var KB_DEFAULTS = {
        pointer:      'p',
        stock:        's',
        cloud:        'c',
        variable:     'v',
        flow:         'f',
        influence:    'i',
        text:         't',
        conveyor:     'n',
        microwave:    'w',
        queue:        'q',
        'polarity-pos': 'p',
        'polarity-neg': 'm',
        emphasis:     'b'
    };

    function kbLoad() {
        try {
            var s = localStorage.getItem('lunaKeyBinds');
            return s ? Object.assign({}, KB_DEFAULTS, JSON.parse(s)) : Object.assign({}, KB_DEFAULTS);
        } catch(e) { return Object.assign({}, KB_DEFAULTS); }
    }
    function kbSave(kb) {
        localStorage.setItem('lunaKeyBinds', JSON.stringify(kb));
    }

    // Expose globally so keydown handlers in HTML and editor can read it
    window._keyBinds = kbLoad();

    // ── Canvas background persistence ─────────────────────────────────────────
    function applyCanvasBg(color) {
        var el = document.getElementById('myDiagram');
        if (el) el.style.backgroundColor = color;
        if (window.myDiagram) {
            myDiagram.div.style.backgroundColor = color;
            // Also set the canvas background so GoJS renders on it correctly
            myDiagram.documentBounds; // force layout
        }
    }

    function loadCanvasBg() {
        var mc = mcLoad();
        if (mc.canvasbg) applyCanvasBg(mc.canvasbg);
    }

    // ── Textbox defaults: apply to all textbox nodes that have no override ────
    function applyTextboxDefaults(mc) {
        if (!window.myDiagram) return;
        myDiagram.model.commit(function() {
            myDiagram.model.nodeDataArray.forEach(function(node) {
                if (node.category !== 'textbox') return;
                if (!node.tbBg)     myDiagram.model.setDataProperty(node, 'tbBg',     mc.textboxbg);
                if (!node.tbBorder) myDiagram.model.setDataProperty(node, 'tbBorder', mc.textboxborder);
                if (!node.tbLabelColor) myDiagram.model.setDataProperty(node, 'tbLabelColor', mc.textboxtext);
            });
        }, 'apply textbox defaults');
    }

    document.addEventListener('DOMContentLoaded', function () {

        // ── Init keybinds UI ──────────────────────────────────────────────────
        var kb = window._keyBinds;

        document.querySelectorAll('.keybind-input').forEach(function(inp) {
            var action = inp.getAttribute('data-action');
            if (action && kb[action]) inp.value = kb[action].toUpperCase();

            inp.addEventListener('focus', function() {
                inp.value = '';
                inp.classList.remove('conflict');
            });

            inp.addEventListener('keydown', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // Ignore modifier-only keys
                if (['Control','Alt','Shift','Meta','Tab','Escape'].indexOf(e.key) >= 0) {
                    inp.value = (kb[action] || '').toUpperCase();
                    inp.blur();
                    return;
                }

                var newKey = e.key.toLowerCase();

                // Check for conflicts among tool binds
                var toolActions = ['pointer','stock','cloud','variable','flow','influence','text','conveyor','microwave','queue'];
                var actionIsTool = toolActions.indexOf(action) >= 0;
                var conflict = false;
                if (actionIsTool) {
                    toolActions.forEach(function(a) {
                        if (a !== action && (kb[a] || '') === newKey) conflict = true;
                    });
                }

                if (conflict) {
                    inp.classList.add('conflict');
                    setTimeout(function() {
                        inp.value = (kb[action] || '').toUpperCase();
                        inp.classList.remove('conflict');
                        inp.blur();
                    }, 700);
                    return;
                }

                kb[action] = newKey;
                window._keyBinds = kb;
                kbSave(kb);
                inp.value = newKey.toUpperCase();
                inp.blur();
            });
        });

        // ── Visual tab: center button toggle ──────────────────────────────────
        var centerCb = document.getElementById('settingShowCenterBtn');
        var centerBtn = document.getElementById('centerModelBtn');
        if (centerCb && centerBtn) {
            // Restore saved preference
            var saved = localStorage.getItem('lunaCenterBtnVisible');
            if (saved === 'false') {
                centerCb.checked = false;
                centerBtn.style.display = 'none';
            }
            centerCb.addEventListener('change', function() {
                localStorage.setItem('lunaCenterBtnVisible', centerCb.checked);
                centerBtn.style.display = centerCb.checked ? '' : 'none';
            });
        }

        // ── Canvas background picker (in Model Colors tab) ────────────────────
        var canvasPicker = document.getElementById('mc-canvasbg');
        if (canvasPicker) {
            // Init value from stored colors
            var mc0 = mcLoad();
            canvasPicker.value = mc0.canvasbg || '#ffffff';
            applyCanvasBg(canvasPicker.value);

            canvasPicker.addEventListener('input', function() {
                applyCanvasBg(canvasPicker.value);
            });
            canvasPicker.addEventListener('change', function() {
                var mc = mcLoad();
                mc.canvasbg = canvasPicker.value;
                mcSave(mc);
                applyCanvasBg(canvasPicker.value);
            });
        }

        // ── Textbox default color pickers ─────────────────────────────────────
        ['textboxbg','textboxborder','textboxtext'].forEach(function(key) {
            var picker = document.getElementById('mc-' + key);
            if (!picker) return;
            var mc0 = mcLoad();
            picker.value = mc0[key] || MC_DEFAULTS[key];
            picker.addEventListener('change', function() {
                var mc = mcLoad();
                mc[key] = picker.value;
                mcSave(mc);
            });
        });

        // When "Apply to All" is clicked, also repaint textboxes and canvas bg
        var origApply = document.getElementById('mc-apply-all');
        if (origApply) {
            origApply.addEventListener('click', function() {
                var mc = mcLoad();
                applyCanvasBg(mc.canvasbg || '#ffffff');
                applyTextboxDefaults(mc);
            });
        }

        // Apply canvas bg on load (after diagram initialises)
        var attempts = 0;
        var iv = setInterval(function() {
            attempts++;
            if (window.myDiagram) {
                clearInterval(iv);
                loadCanvasBg();
            }
            if (attempts > 100) clearInterval(iv);
        }, 50);

        // Re-sync canvasbg picker when theme popup opens
        var paletteBtn = document.querySelector('a[onclick*="themePopup"]');
        if (paletteBtn) {
            paletteBtn.addEventListener('click', function() {
                var mc = mcLoad();
                var cp = document.getElementById('mc-canvasbg');
                if (cp) cp.value = mc.canvasbg || '#ffffff';
                ['textboxbg','textboxborder','textboxtext'].forEach(function(key) {
                    var p = document.getElementById('mc-' + key);
                    if (p) p.value = mc[key] || MC_DEFAULTS[key];
                });
            });
        }

    }); // end DOMContentLoaded

}()); // end settings/keybinds IIFE
