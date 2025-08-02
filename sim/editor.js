
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

    nodeCounter: {stock: 0, cloud: 0, variable: 0, valve: 0}
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
            this.temporaryLink.curve = (SD.itemType === "flow") ? go.Link.None : go.Link.Bezier;
            this.temporaryLink.path.stroke = (SD.itemType === "flow") ? "blue" : "orange";
            this.temporaryLink.path.strokeWidth = (SD.itemType === "flow") ? 5 : 1;
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
                const valid = (from === "stock" || from === "cloud") &&
                    (to === "stock" || to === "cloud");

                const bothClouds = from === "cloud" && to === "cloud";

                if (!valid || bothClouds) {
                    return null;
                }
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
                key: newNodeId, category: SD.itemType, label: newNodeId, color: getDefaultColor(SD.itemType)
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
            if (node.category === "cloud" || node.label[0] !== "$") return;

            const nonGhostExists = myDiagram.model.nodeDataArray.some(n => n.label === node.label.substring(1) && n.category === node.category);

            if (!nonGhostExists) {
                if (node.category === "valve") {
                    myDiagram.model.linkDataArray.forEach(link => {
                        if (link.category === "flow" && link.labelKeys?.[0] === node.key) {
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
    });

    /**
     * Auto-delete any flow links whose label (valve node) was deleted.
     */
    myDiagram.addDiagramListener("SelectionDeleted", e => {
        const deletedParts = e.subject.toArray();
        const deletedValveKeys = deletedParts
            .filter(p => p instanceof go.Node && p.data.category === "valve")
            .map(p => p.data.key);

        if (deletedValveKeys.length === 0) return;

        const linksToDelete = myDiagram.model.linkDataArray.filter(link => link.category === "flow" && link.labelKeys?.some(labelKey => deletedValveKeys.includes(labelKey)));

        if (linksToDelete.length > 0) {
            myDiagram.model.startTransaction("delete flow links for removed valves");
            linksToDelete.forEach(link => myDiagram.model.removeLinkData(link));
            myDiagram.model.commitTransaction("delete flow links for removed valves");
        }
    });

    buildTemplates();

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
            layerName: "Background",
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
            stroke: textColor, font: "bold 11pt helvetica, bold arial, sans-serif", margin: 2, editable: true
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
        return "#cfcfcf";
    }).makeTwoWay(), {
        desiredSize: new go.Size(50, 30)
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 30), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify))));


    myDiagram.nodeTemplateMap.add("cloud", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Auto", $(go.Shape, {
            figure: "Cloud",
            fill: null,
            stroke: "dodgerblue",
            strokeWidth: 3,
            scale: 0.9,
            desiredSize: new go.Size(30, 30)
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "color").makeTwoWay(), {
        figure: "Cloud", desiredSize: new go.Size(30, 30), fill: "#f0f0f0"
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
                new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify)
            )
        )
    );

    myDiagram.nodeTemplateMap.add("variable", $(go.Node, nodeStyle(), {
        selectionAdornmentTemplate: $(go.Adornment, "Spot", $(go.Shape, "Ellipse", {
            fill: null, stroke: "dodgerblue", strokeWidth: 15, scale: 0.25
        }), $(go.Placeholder))
    }, $(go.Shape, shapeStyle(), new go.Binding("fill", "", function (data) {
        if (data.label && data.label.startsWith('$')) return "white";
        return "#cfcfcf";
    }).makeTwoWay(), {
        figure: "Ellipse", desiredSize: new go.Size(25, 25)
    }), $(go.TextBlock, textStyle(), {
        _isNodeLabel: true, alignment: new go.Spot(0.5, 0.5, 0, 30), isMultiline: false, textValidation: labelValidator
    }, new go.Binding("alignment", "label_offset", go.Spot.parse).makeTwoWay(go.Spot.stringify))));

    myDiagram.linkTemplateMap.add("flow",
        $(go.Link,
            {
                toShortLength: 10,
                layerName: "Foreground",
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

            $(go.Shape, {
                stroke: "#3489eb",
                strokeWidth: 5
            }),

            $(go.Shape, {
                fill: "#3489eb",
                stroke: "#3489eb",
                toArrow: "Standard",
                scale: 2.0
            }),

            $(go.Shape,
                new go.Binding("visible", "", isBiflow),
                new go.Binding("stroke", "", function(_, shape) {
                    return shape.part.isSelected ? "#3489eb" : "#808080";
                }).ofObject(),
                new go.Binding("fill", "", function(_, shape) {
                    return shape.part.isSelected ? "#3489eb" : "#808080";
                }).ofObject(),
                {
                    fromArrow: "Backward",
                    scale: 2.0
                }
            )
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
        curve: go.Link.Bezier, toShortLength: 8, reshapable: true
    }, new go.Binding("curviness", "curviness").makeTwoWay(), $(go.Shape, {strokeWidth: 1.5}, new go.Binding("stroke", "isSelected", sel => sel ? "#3489eb" : "orange").ofObject()), $(go.Shape, {
        stroke: null, toArrow: "Standard", scale: 1.5
    }, new go.Binding("fill", "isSelected", sel => sel ? "#3489eb" : "orange").ofObject())));
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

        $(this).removeData('migrated');


        $.each(json.nodeDataArray, function (i, item) {
            if (item.label === name) {
                item.equation = equation;
                item.checkbox = checkbox;
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

                const node = myDiagram.model.nodeDataArray.find(n => n.label === name);
                if (node) {
                    myDiagram.model.setDataProperty(node, 'equation', equation);
                    myDiagram.model.setDataProperty(node, 'checkbox', checkbox);
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
                (item.category === "stock" || item.category === "variable" || item.category === "valve")
            )
            .sort((a, b) => {
                const order = { stock: 0, valve: 1, variable: 2 };
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

            if (category === "stock" || category === "flow") {
                const $checkbox = $('<input>')
                    .attr({ type: 'checkbox', name: 'checkbox', class: 'nncheckbox' })
                    .prop('checked', !!item.checkbox)
                    .on('change', () => loadTableToDiagram());
                $tr.append($('<td>').append($checkbox));
            } else {
                $tr.append($('<td>'));
            }

            const colorClass = category === "stock" ? "eqStockBox"
                : category === "flow" ? "eqFlowBox"
                    : "eqVariableBox";

            $tr.find('td').slice(0, 3).addClass(colorClass);

            $tbody.append($tr);
        });
    });

    GOJS_ELEMENT_LABELS = myDiagram.model.nodeDataArray
        .filter(n => n.label && !n.label.startsWith('$') && n.category !== "cloud")
        .map(n => n.label);

    // Ensure popup styling stays consistent after table update
    const popup = document.getElementById("equationEditorPopup");
    const popupContent = document.getElementById("equationEditorPopupContent");

    if (popup && popup.style.display !== "none") {
        const clonedTable = document.querySelector("#eqTable").cloneNode(true);
        popupContent.innerHTML = ""; // Clear old
        popupContent.appendChild(clonedTable); // Re-append
    }

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
    for (var node of myDiagram.model["nodeDataArray"]) {
        if (node.key === labelKey) {
            var flowName = node.label;
        }
    }

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
    if (newstr === "") return false;
    if (!isNaN(newstr)) return false;



    if (isGhost(newstr)) {
        const targetLabel = newstr.substring(1);
        const realNodeCount = myDiagram.model.nodeDataArray.filter(node => node.label === targetLabel && node.label !== oldstr && !isGhost(node.label)).length;

        return realNodeCount >= 1;
    }

    const $tbody = $('#eqTableBody');
    $tbody.find('tr').each(function () {
        const $row = $(this);
        const name = $row.find('input[name="name"]').val();
        if (name === oldstr) {
            const equation = $row.find('input[name="equation"]').val();
            const checkbox = $row.find('input[name="checkbox"]').is(':checked');
            $row.find('input[name="name"]').val(newstr);

            GOJS_ELEMENT_LABELS_SET.delete(oldstr);
            GOJS_ELEMENT_LABELS_SET.add(newstr);
            const index = GOJS_ELEMENT_LABELS.indexOf(oldstr);
            if (index !== -1) GOJS_ELEMENT_LABELS[index] = newstr;

            $row.data('migrated', {equation, checkbox});
        }
    });

    for (let i = 0; i < myDiagram.model.nodeDataArray.length; i++) {
        if (myDiagram.model.nodeDataArray[i].label === newstr) {
            return false;
        }
    }

    return true;
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
        "integrationMethod": document.getElementById("integrationMethod").value == "euler" ? "euler" : "rk4"
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
            } else {
                document.getElementById("startTime").value = 0;
                document.getElementById("endTime").value = 10;
                document.getElementById("dt").value = 0.1;
                document.getElementById("integrationMethod").value = "rk4";
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
const JAVA_MATH_FUNCTIONS = ['sin()', 'cos()', 'tan()', 'asin()', 'acos()', 'atan()', 'atan2()', 'sinh()', 'cosh()', 'tanh()', 'exp()', 'log()', 'log10()', 'sqrt()', 'cbrt()', 'abs()', 'ceil()', 'floor()', 'round()', 'pow()', 'max()', 'min()', 'sign()', 'random()', 'hypot()', 'expm1()', 'log1p()'];

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
        // Show first 5 elements in creation order
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
            message: `The name "${newName}" is invalid or already in use.\nIt will be reset to "${oldName}".`,
            onConfirm: () => {

            },
        });
        $input.val(oldName);
        return;
    }

    const escapeRegExp = (string) =>
        string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    myDiagram.model.commit(() => {
        const nodeData = myDiagram.model.nodeDataArray.find(n => n.label === oldName);
        if (nodeData) {
            myDiagram.model.setDataProperty(nodeData, 'label', newName);
            if (nodeData.key === oldName) {
                myDiagram.model.setDataProperty(nodeData, 'key', newName);
            }
        }

        const pattern = new RegExp(`\\[${escapeRegExp(oldName)}\\]`, 'g');
        myDiagram.model.nodeDataArray.forEach(n => {
            if (typeof n.equation === 'string') {
                const updated = n.equation.replace(pattern, `[${newName}]`);
                if (updated !== n.equation) {
                    myDiagram.model.setDataProperty(n, 'equation', updated);
                }
            }
        });

        updateTable(true);
    }, 'Rename node and update references');

    $input.data('oldName', newName); // Set for future renames
    updateTable(true);
    myDiagram.requestUpdate();
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
        case "stock":
            return "#f0f0f0";
        case "variable":
            return "#f0f0f0";
        case "valve":
            return "#3489eb";
        case "flow":
            return "#3489eb";
        case "influence":
            return "#e3680e";
        default:
            return "#f0f0f0";
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