#target illustrator
/*
 * Fillinger for Adobe Illustrator 30.8.1
 * Modernized from the original Fillinger / Circle Fill script.
 * Original concept: A Jongware; modification and refactoring: Alexander Ladygin.
 * Copyright (c) 2018 Alexander Ladygin.
 * Released under the MIT License; see reference/LICENSE-original-MIT.txt.
 */

(function () {
    var SCRIPT_NAME = "Fillinger 30.8.1";
    var SETTINGS_VERSION = "2";
    var CURVE_FLATTEN_STEPS = 12;
    var GEOMETRY_EPSILON = 0.0001;
    var RADIUS_STEP_FACTOR = 0.667;
    var MAX_ATTEMPTS_PER_RADIUS = 1000;
    var MAX_GENERATED_ITEMS = 2000;
    var UI_UPDATE_INTERVAL = 50;
    var APP_FOLDER_NAME = "AdobeIllustratorFillinger";
    var createdItems = [];
    var logger = null;
    var activeProgressWindow = null;

    var DEFAULTS = {
        maxSize: 10,
        minSize: 4,
        minDistance: 0,
        resize: 70,
        rotationMode: "random",
        rotationValue: 0,
        boundaryMode: "topmost",
        groupResult: false,
        randomFillers: false,
        removeBoundary: false
    };

    function safeString(value) {
        try { return String(value); } catch (ignore) { return "<unavailable>"; }
    }

    function nowText() {
        var d = new Date();
        function two(n) { return n < 10 ? "0" + n : String(n); }
        return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) +
            " " + two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
    }

    function ensureFolder(folder) {
        if (!folder.exists) { return folder.create(); }
        return true;
    }

    function createLogger() {
        var result = { write: function () {} };
        try {
            var root = new Folder(Folder.userData.fsName + "/" + APP_FOLDER_NAME);
            var logs = new Folder(root.fsName + "/logs");
            if (!ensureFolder(root) || !ensureFolder(logs)) { return result; }
            var file = new File(logs.fsName + "/fillinger.log");
            result.write = function (message) {
                try {
                    file.encoding = "UTF-8";
                    if (file.open("a")) {
                        file.writeln("[" + nowText() + "] " + safeString(message));
                        file.close();
                    }
                } catch (ignoreWrite) {}
            };
        } catch (ignoreLogger) {}
        return result;
    }

    function logEnvironment() {
        logger.write("start script=" + SCRIPT_NAME);
        logger.write("Illustrator version=" + safeString(app.version));
        logger.write("ExtendScript version=" + safeString($.version) + " build=" + safeString($.build));
        logger.write("OS=" + safeString($.os));
    }

    function parseNumber(value, defaultValue, min, max) {
        var parsed = parseFloat(value);
        if (isNaN(parsed) || !isFinite(parsed)) { parsed = defaultValue; }
        if (parsed < min) { parsed = min; }
        if (parsed > max) { parsed = max; }
        return parsed;
    }

    function parseBoolean(value, defaultValue) {
        if (value === "true") { return true; }
        if (value === "false") { return false; }
        return defaultValue;
    }

    function copyDefaults() {
        return {
            maxSize: DEFAULTS.maxSize, minSize: DEFAULTS.minSize,
            minDistance: DEFAULTS.minDistance, resize: DEFAULTS.resize,
            rotationMode: DEFAULTS.rotationMode, rotationValue: DEFAULTS.rotationValue,
            boundaryMode: DEFAULTS.boundaryMode, groupResult: DEFAULTS.groupResult,
            randomFillers: DEFAULTS.randomFillers, removeBoundary: DEFAULTS.removeBoundary
        };
    }

    function settingsFile() {
        var folder = new Folder(Folder.userData.fsName + "/" + APP_FOLDER_NAME);
        if (!ensureFolder(folder)) { return null; }
        return new File(folder.fsName + "/settings.txt");
    }

    function loadSettings() {
        var result = copyDefaults();
        var file;
        var lines;
        var i;
        var splitAt;
        var key;
        var value;
        try {
            file = settingsFile();
            if (file === null || !file.exists) { return result; }
            file.encoding = "UTF-8";
            if (!file.open("r")) { return result; }
            lines = file.read().split(/\r?\n/);
            file.close();
            for (i = 0; i < lines.length; i++) {
                splitAt = lines[i].indexOf("=");
                if (splitAt < 1) { continue; }
                key = lines[i].substring(0, splitAt);
                value = lines[i].substring(splitAt + 1);
                if (key === "maxSize") { result.maxSize = parseNumber(value, result.maxSize, 0.01, 100); }
                else if (key === "minSize") { result.minSize = parseNumber(value, result.minSize, 0.01, 100); }
                else if (key === "minDistance") { result.minDistance = parseNumber(value, result.minDistance, 0, 1000000); }
                else if (key === "resize") { result.resize = parseNumber(value, result.resize, 1, 100); }
                else if (key === "rotationMode" && (value === "random" || value === "fixed")) { result.rotationMode = value; }
                else if (key === "rotationValue") { result.rotationValue = parseNumber(value, result.rotationValue, -360000, 360000); }
                else if (key === "boundaryMode" && (value === "topmost" || value === "bottommost" || value === "selection")) { result.boundaryMode = value; }
                else if (key === "groupResult") { result.groupResult = parseBoolean(value, result.groupResult); }
                else if (key === "randomFillers") { result.randomFillers = parseBoolean(value, result.randomFillers); }
                else if (key === "removeBoundary") { result.removeBoundary = parseBoolean(value, result.removeBoundary); }
            }
        } catch (error) {
            logger.write("settings read warning=" + safeString(error.message));
            return copyDefaults();
        }
        if (result.minSize > result.maxSize) { result.minSize = result.maxSize; }
        return result;
    }

    function saveSettings(settings) {
        try {
            var file = settingsFile();
            if (file === null) { return; }
            file.encoding = "UTF-8";
            if (!file.open("w")) { return; }
            file.writeln("version=" + SETTINGS_VERSION);
            file.writeln("maxSize=" + settings.maxSize);
            file.writeln("minSize=" + settings.minSize);
            file.writeln("minDistance=" + settings.minDistance);
            file.writeln("resize=" + settings.resize);
            file.writeln("rotationMode=" + settings.rotationMode);
            file.writeln("rotationValue=" + settings.rotationValue);
            file.writeln("boundaryMode=" + settings.boundaryMode);
            file.writeln("groupResult=" + settings.groupResult);
            file.writeln("randomFillers=" + settings.randomFillers);
            file.writeln("removeBoundary=" + settings.removeBoundary);
            file.close();
        } catch (error) { logger.write("settings write warning=" + safeString(error.message)); }
    }

    function collectionToArray(collection) {
        var result = [];
        var i;
        for (i = 0; i < collection.length; i++) { result.push(collection[i]); }
        return result;
    }

    function boundsWidth(bounds) { return Math.abs(bounds[2] - bounds[0]); }
    function boundsHeight(bounds) { return Math.abs(bounds[1] - bounds[3]); }
    function boundsCenter(bounds) { return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]; }
    function getBoundsCenter(item) { return boundsCenter(item.geometricBounds); }

    function moveCenterTo(item, x, y) {
        var center = getBoundsCenter(item);
        item.translate(x - center[0], y - center[1]);
    }

    function isBoundaryType(item) {
        return item.typename === "PathItem" || item.typename === "CompoundPathItem";
    }

    function isFillerType(item) {
        var type = item.typename;
        return type === "PathItem" || type === "CompoundPathItem" || type === "GroupItem" ||
            type === "TextFrame" || type === "PlacedItem" || type === "SymbolItem";
    }

    function stackingPosition(item, fallback) {
        try { return Number(item.zOrderPosition); } catch (ignore) { return fallback; }
    }

    function selectBoundary(selection, mode) {
        var candidates = [];
        var i;
        var chosen;
        var chosenPosition;
        var position;
        for (i = 0; i < selection.length; i++) {
            if (isBoundaryType(selection[i])) { candidates.push({ item: selection[i], index: i }); }
        }
        if (candidates.length === 0) { throw new Error("Selection contains no PathItem or CompoundPathItem boundary."); }
        if (mode === "selection") { return candidates[0].item; }
        chosen = candidates[0];
        chosenPosition = stackingPosition(chosen.item, chosen.index);
        for (i = 1; i < candidates.length; i++) {
            position = stackingPosition(candidates[i].item, candidates[i].index);
            if ((mode === "topmost" && position > chosenPosition) ||
                    (mode === "bottommost" && position < chosenPosition)) {
                chosen = candidates[i];
                chosenPosition = position;
            }
        }
        return chosen.item;
    }

    function collectFillSources(selection, boundary, randomFillers) {
        var sources = [];
        var i;
        var children;
        for (i = 0; i < selection.length; i++) {
            if (selection[i] !== boundary && isFillerType(selection[i])) { sources.push(selection[i]); }
        }
        if (sources.length === 1 && sources[0].typename === "GroupItem" && randomFillers) {
            children = collectionToArray(sources[0].pageItems);
            sources = [];
            for (i = 0; i < children.length; i++) {
                if (isFillerType(children[i])) { sources.push(children[i]); }
            }
        }
        if (sources.length === 0) { throw new Error("Select at least one supported filler object in addition to the boundary."); }
        return sources;
    }

    function distance(a, b) {
        var dx = a[0] - b[0];
        var dy = a[1] - b[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function distancePointToSegment(point, a, b) {
        var dx = b[0] - a[0];
        var dy = b[1] - a[1];
        var lengthSquared = dx * dx + dy * dy;
        var t;
        var nearest;
        if (lengthSquared <= GEOMETRY_EPSILON * GEOMETRY_EPSILON) { return distance(point, a); }
        t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared;
        if (t < 0) { t = 0; }
        else if (t > 1) { t = 1; }
        nearest = [a[0] + t * dx, a[1] + t * dy];
        return distance(point, nearest);
    }

    function polygonArea(polygon) {
        var sum = 0;
        var i;
        var j;
        for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            sum += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
        }
        return sum / 2;
    }

    function pointOnSegment(point, a, b) {
        return distancePointToSegment(point, a, b) <= GEOMETRY_EPSILON;
    }

    function pointInPolygon(point, polygon) {
        var inside = false;
        var i;
        var j;
        var crosses;
        for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (pointOnSegment(point, polygon[j], polygon[i])) { return true; }
            crosses = ((polygon[i][1] > point[1]) !== (polygon[j][1] > point[1])) &&
                (point[0] < (polygon[j][0] - polygon[i][0]) * (point[1] - polygon[i][1]) /
                (polygon[j][1] - polygon[i][1]) + polygon[i][0]);
            if (crosses) { inside = !inside; }
        }
        return inside;
    }

    function triangleArea(a, b, c) {
        return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }

    function randomRange(min, max) { return min + Math.random() * (max - min); }
    function randomInt(maxExclusive) { return Math.floor(Math.random() * maxExclusive); }

    function randomPointInTriangle(triangle) {
        var u = Math.random();
        var v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        return [
            triangle[0][0] + u * (triangle[1][0] - triangle[0][0]) + v * (triangle[2][0] - triangle[0][0]),
            triangle[0][1] + u * (triangle[1][1] - triangle[0][1]) + v * (triangle[2][1] - triangle[0][1])
        ];
    }

    function samePoint(a, b) { return distance(a, b) <= GEOMETRY_EPSILON; }

    function cubicPoint(p0, p1, p2, p3, t) {
        var inverse = 1 - t;
        var inverse2 = inverse * inverse;
        var t2 = t * t;
        return [
            inverse2 * inverse * p0[0] + 3 * inverse2 * t * p1[0] + 3 * inverse * t2 * p2[0] + t2 * t * p3[0],
            inverse2 * inverse * p0[1] + 3 * inverse2 * t * p1[1] + 3 * inverse * t2 * p2[1] + t2 * t * p3[1]
        ];
    }

    function appendUnique(points, point) {
        if (points.length === 0 || !samePoint(points[points.length - 1], point)) {
            points.push([Number(point[0]), Number(point[1])]);
        }
    }

    function flattenPath(pathItem) {
        var result = [];
        var points;
        var count;
        var i;
        var next;
        var currentPoint;
        var nextPoint;
        var straight;
        var step;
        if (pathItem.typename !== "PathItem") { throw new Error("flattenPath requires a PathItem."); }
        if (!pathItem.closed) { throw new Error("Boundary paths must be closed."); }
        points = pathItem.pathPoints;
        count = points.length;
        if (count < 3) { throw new Error("Boundary path needs at least three path points."); }
        for (i = 0; i < count; i++) {
            next = (i + 1) % count;
            currentPoint = points[i];
            nextPoint = points[next];
            appendUnique(result, currentPoint.anchor);
            straight = samePoint(currentPoint.anchor, currentPoint.rightDirection) &&
                samePoint(nextPoint.anchor, nextPoint.leftDirection);
            if (!straight) {
                for (step = 1; step < CURVE_FLATTEN_STEPS; step++) {
                    appendUnique(result, cubicPoint(currentPoint.anchor, currentPoint.rightDirection,
                        nextPoint.leftDirection, nextPoint.anchor, step / CURVE_FLATTEN_STEPS));
                }
            }
        }
        if (result.length > 1 && samePoint(result[0], result[result.length - 1])) { result.pop(); }
        if (result.length < 3 || Math.abs(polygonArea(result)) <= GEOMETRY_EPSILON) {
            throw new Error("Boundary path has zero area or too few usable vertices.");
        }
        return result;
    }

    function buildBoundaryGeometry(boundary) {
        var contours = [];
        var i;
        var largest = 0;
        var outerIndex = -1;
        var area;
        var outer;
        var holes = [];
        var probe;
        if (boundary.typename === "PathItem") { contours.push(flattenPath(boundary)); }
        else {
            if (boundary.pathItems.length === 0) { throw new Error("CompoundPathItem has no subpaths."); }
            for (i = 0; i < boundary.pathItems.length; i++) { contours.push(flattenPath(boundary.pathItems[i])); }
        }
        for (i = 0; i < contours.length; i++) {
            area = Math.abs(polygonArea(contours[i]));
            if (area > largest) { largest = area; outerIndex = i; }
        }
        if (outerIndex < 0 || largest <= GEOMETRY_EPSILON) { throw new Error("Boundary has no meaningful outer contour."); }
        outer = contours[outerIndex];
        for (i = 0; i < contours.length; i++) {
            if (i === outerIndex) { continue; }
            probe = contours[i][0];
            if (!pointInPolygon(probe, outer)) {
                throw new Error("Compound paths with multiple disconnected outer islands are not supported.");
            }
            holes.push(contours[i]);
        }
        for (i = 0; i < holes.length; i++) {
            var j;
            for (j = 0; j < holes.length; j++) {
                if (i !== j && pointInPolygon(holes[i][0], holes[j])) {
                    throw new Error("Nested compound contours (islands inside holes) are not supported.");
                }
            }
        }
        return { outer: outer, holes: holes };
    }

    function pointInTriangle(point, a, b, c) {
        var cross1 = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
        var cross2 = (c[0] - b[0]) * (point[1] - b[1]) - (c[1] - b[1]) * (point[0] - b[0]);
        var cross3 = (a[0] - c[0]) * (point[1] - c[1]) - (a[1] - c[1]) * (point[0] - c[0]);
        return (cross1 >= -GEOMETRY_EPSILON && cross2 >= -GEOMETRY_EPSILON && cross3 >= -GEOMETRY_EPSILON) ||
            (cross1 <= GEOMETRY_EPSILON && cross2 <= GEOMETRY_EPSILON && cross3 <= GEOMETRY_EPSILON);
    }

    function cleanPolygon(polygon) {
        var result = [];
        var i;
        for (i = 0; i < polygon.length; i++) { appendUnique(result, polygon[i]); }
        if (result.length > 1 && samePoint(result[0], result[result.length - 1])) { result.pop(); }
        return result;
    }

    function triangulatePolygon(inputPolygon) {
        var polygon = cleanPolygon(inputPolygon);
        var triangles = [];
        var indices = [];
        var orientation = polygonArea(polygon) >= 0 ? 1 : -1;
        var i;
        var guard = polygon.length * polygon.length;
        var previous;
        var current;
        var next;
        var cross;
        var contains;
        var j;
        for (i = 0; i < polygon.length; i++) { indices.push(i); }
        while (indices.length > 3 && guard > 0) {
            contains = true;
            for (i = 0; i < indices.length; i++) {
                previous = indices[(i + indices.length - 1) % indices.length];
                current = indices[i];
                next = indices[(i + 1) % indices.length];
                cross = ((polygon[current][0] - polygon[previous][0]) * (polygon[next][1] - polygon[current][1]) -
                    (polygon[current][1] - polygon[previous][1]) * (polygon[next][0] - polygon[current][0])) * orientation;
                if (cross <= GEOMETRY_EPSILON) { continue; }
                contains = false;
                for (j = 0; j < indices.length; j++) {
                    if (indices[j] === previous || indices[j] === current || indices[j] === next) { continue; }
                    if (pointInTriangle(polygon[indices[j]], polygon[previous], polygon[current], polygon[next])) {
                        contains = true;
                        break;
                    }
                }
                if (!contains) {
                    triangles.push([polygon[previous], polygon[current], polygon[next]]);
                    indices.splice(i, 1);
                    break;
                }
            }
            if (contains) { break; }
            guard--;
        }
        if (indices.length === 3 && triangleArea(polygon[indices[0]], polygon[indices[1]], polygon[indices[2]]) > GEOMETRY_EPSILON) {
            triangles.push([polygon[indices[0]], polygon[indices[1]], polygon[indices[2]]]);
        }
        if (triangles.length === 0 || indices.length > 3) {
            throw new Error("Boundary triangulation failed; check for self-intersections or degenerate vertices.");
        }
        return triangles;
    }

    function buildAreaSampler(triangles) {
        var cumulative = [];
        var total = 0;
        var i;
        var area;
        for (i = 0; i < triangles.length; i++) {
            area = triangleArea(triangles[i][0], triangles[i][1], triangles[i][2]);
            if (area > GEOMETRY_EPSILON) {
                total += area;
                cumulative.push({ triangle: triangles[i], end: total });
            }
        }
        if (cumulative.length === 0 || total <= GEOMETRY_EPSILON) { throw new Error("Triangulation produced no positive-area triangles."); }
        return { entries: cumulative, total: total };
    }

    function samplePoint(sampler) {
        var target = Math.random() * sampler.total;
        var i;
        for (i = 0; i < sampler.entries.length; i++) {
            if (target < sampler.entries[i].end) { return randomPointInTriangle(sampler.entries[i].triangle); }
        }
        return randomPointInTriangle(sampler.entries[sampler.entries.length - 1].triangle);
    }

    function pointInRegion(point, geometry) {
        var i;
        if (!pointInPolygon(point, geometry.outer)) { return false; }
        for (i = 0; i < geometry.holes.length; i++) {
            if (pointInPolygon(point, geometry.holes[i])) { return false; }
        }
        return true;
    }

    function distanceToContour(point, contour) {
        var best = 1.7976931348623157e+308;
        var i;
        var j;
        var current;
        for (i = 0, j = contour.length - 1; i < contour.length; j = i++) {
            current = distancePointToSegment(point, contour[j], contour[i]);
            if (current < best) { best = current; }
        }
        return best;
    }

    function distanceToClosestBoundary(point, geometry) {
        var best = distanceToContour(point, geometry.outer);
        var current;
        var i;
        for (i = 0; i < geometry.holes.length; i++) {
            current = distanceToContour(point, geometry.holes[i]);
            if (current < best) { best = current; }
        }
        return best;
    }

    function collides(point, radius, placements, minimumDistance) {
        var i;
        var required;
        var dx;
        var dy;
        for (i = 0; i < placements.length; i++) {
            required = radius + placements[i].radius + minimumDistance;
            dx = Math.abs(point[0] - placements[i].point[0]);
            dy = Math.abs(point[1] - placements[i].point[1]);
            if (dx < required && dy < required && distance(point, placements[i].point) < required) { return true; }
        }
        return false;
    }

    function calculatePlacements(geometry, sampler, bounds, settings, progress) {
        var width = boundsWidth(bounds);
        var height = boundsHeight(bounds);
        var referenceSize = Math.sqrt(width * height);
        var maxRadius = referenceSize * settings.maxSize / 200;
        var minRadius = referenceSize * settings.minSize / 200;
        var radii = [];
        var radius = maxRadius;
        var placements = [];
        var level;
        var attempt;
        var point;
        if (referenceSize <= GEOMETRY_EPSILON || minRadius <= 0) { throw new Error("Boundary is too small for the requested size."); }
        while (radius >= minRadius - GEOMETRY_EPSILON) {
            radii.push(radius);
            radius *= RADIUS_STEP_FACTOR;
        }
        if (radii.length === 0 || radii[radii.length - 1] > minRadius + GEOMETRY_EPSILON) { radii.push(minRadius); }
        for (level = 0; level < radii.length && placements.length < MAX_GENERATED_ITEMS; level++) {
            radius = radii[level];
            for (attempt = 0; attempt < MAX_ATTEMPTS_PER_RADIUS && placements.length < MAX_GENERATED_ITEMS; attempt++) {
                point = samplePoint(sampler);
                if (pointInRegion(point, geometry) && distanceToClosestBoundary(point, geometry) + GEOMETRY_EPSILON >= radius &&
                        !collides(point, radius, placements, settings.minDistance)) {
                    placements.push({ point: point, radius: radius });
                }
                if (attempt % UI_UPDATE_INTERVAL === 0) { progress(5 + 55 * (level + attempt / MAX_ATTEMPTS_PER_RADIUS) / radii.length); }
            }
        }
        if (placements.length >= MAX_GENERATED_ITEMS) { logger.write("warning maximum generated item limit reached=" + MAX_GENERATED_ITEMS); }
        return placements;
    }

    function chooseSource(sources, randomFillers, index) {
        if (randomFillers) { return sources[randomInt(sources.length)]; }
        return sources[index % sources.length];
    }

    function scaleItemToSafeDiameter(item, diameter, resizePercent) {
        var bounds = item.geometricBounds;
        var width = boundsWidth(bounds);
        var height = boundsHeight(bounds);
        var diagonal = Math.sqrt(width * width + height * height);
        var targetDiagonal = diameter * resizePercent / 100;
        var scale;
        if (diagonal <= GEOMETRY_EPSILON) { throw new Error("A filler has zero-size geometric bounds."); }
        scale = targetDiagonal / diagonal * 100;
        /* Last four true values scale fill patterns, gradients, stroke patterns and stroke widths. */
        item.resize(scale, scale, true, true, true, true, scale);
    }

    function cleanupCreatedItems() {
        var i;
        for (i = createdItems.length - 1; i >= 0; i--) {
            try { createdItems[i].remove(); } catch (ignore) {}
        }
        createdItems = [];
    }

    function createGeneratedArtwork(doc, boundary, sources, placements, settings, progress) {
        var group = null;
        var i;
        var source;
        var duplicate;
        var angle;
        if (settings.groupResult) {
            group = doc.groupItems.add();
            createdItems.push(group);
            group.move(boundary, ElementPlacement.PLACEBEFORE);
        }
        for (i = 0; i < placements.length; i++) {
            source = chooseSource(sources, settings.randomFillers, i);
            duplicate = source.duplicate();
            createdItems.push(duplicate);
            if (group !== null) { duplicate.move(group, ElementPlacement.INSIDE); }
            else { duplicate.move(boundary, ElementPlacement.PLACEBEFORE); }
            scaleItemToSafeDiameter(duplicate, placements[i].radius * 2, settings.resize);
            moveCenterTo(duplicate, placements[i].point[0], placements[i].point[1]);
            angle = settings.rotationMode === "random" ? randomRange(0, 360) : settings.rotationValue;
            if (angle !== 0) {
                duplicate.rotate(angle);
                moveCenterTo(duplicate, placements[i].point[0], placements[i].point[1]);
            }
            if (i % UI_UPDATE_INTERVAL === 0) { progress(60 + 40 * (i + 1) / Math.max(placements.length, 1)); }
        }
        return placements.length;
    }

    function addLabeledField(parent, label, value) {
        var row = parent.add("group");
        row.orientation = "row";
        row.alignChildren = ["fill", "center"];
        row.add("statictext", undefined, label);
        var field = row.add("edittext", undefined, String(value));
        field.characters = 8;
        return field;
    }

    function showDialog(initial) {
        var win = new Window("dialog", SCRIPT_NAME);
        var sizePanel = win.add("panel", undefined, "Size (of boundary reference size)");
        var maxSize = addLabeledField(sizePanel, "Maximum size %", initial.maxSize);
        var minSize = addLabeledField(sizePanel, "Minimum size %", initial.minSize);
        var spacingPanel = win.add("panel", undefined, "Spacing / filler scaling");
        var minDistance = addLabeledField(spacingPanel, "Minimum distance (pt)", initial.minDistance);
        var resize = addLabeledField(spacingPanel, "Resize value %", initial.resize);
        var rotationPanel = win.add("panel", undefined, "Rotation");
        var randomRotation = rotationPanel.add("radiobutton", undefined, "Random rotation");
        var fixedRotation = rotationPanel.add("radiobutton", undefined, "Fixed rotation");
        var rotationValue = addLabeledField(rotationPanel, "Rotation angle", initial.rotationValue);
        var boundaryPanel = win.add("panel", undefined, "Boundary selection");
        var topmost = boundaryPanel.add("radiobutton", undefined, "Topmost selected object (stacking order)");
        var bottommost = boundaryPanel.add("radiobutton", undefined, "Bottommost selected object (stacking order)");
        var selectionOrder = boundaryPanel.add("radiobutton", undefined, "Use selection order (first eligible)");
        var groupResult = win.add("checkbox", undefined, "Group generated objects");
        var randomFillers = win.add("checkbox", undefined, "Random filler objects");
        var removeBoundary = win.add("checkbox", undefined, "Remove boundary after execution");
        var progress = win.add("progressbar", undefined, 0, 100);
        var buttons = win.add("group");
        var cancel = buttons.add("button", undefined, "Cancel", { name: "cancel" });
        var run = buttons.add("button", undefined, "Run", { name: "ok" });
        var accepted = false;
        var result = null;
        win.orientation = "column";
        win.alignChildren = "fill";
        sizePanel.alignChildren = "fill";
        spacingPanel.alignChildren = "fill";
        rotationPanel.alignChildren = "left";
        boundaryPanel.alignChildren = "left";
        progress.preferredSize = [360, 12];
        randomRotation.value = initial.rotationMode === "random";
        fixedRotation.value = !randomRotation.value;
        rotationValue.enabled = fixedRotation.value;
        topmost.value = initial.boundaryMode === "topmost";
        bottommost.value = initial.boundaryMode === "bottommost";
        selectionOrder.value = initial.boundaryMode === "selection";
        groupResult.value = initial.groupResult;
        randomFillers.value = initial.randomFillers;
        removeBoundary.value = initial.removeBoundary;
        randomRotation.onClick = function () { rotationValue.enabled = false; };
        fixedRotation.onClick = function () { rotationValue.enabled = true; };
        cancel.onClick = function () { win.close(0); };
        run.onClick = function () {
            var parsed = copyDefaults();
            parsed.maxSize = parseNumber(maxSize.text, DEFAULTS.maxSize, 0.01, 100);
            parsed.minSize = parseNumber(minSize.text, DEFAULTS.minSize, 0.01, 100);
            parsed.minDistance = parseNumber(minDistance.text, DEFAULTS.minDistance, 0, 1000000);
            parsed.resize = parseNumber(resize.text, DEFAULTS.resize, 1, 100);
            parsed.rotationMode = randomRotation.value ? "random" : "fixed";
            parsed.rotationValue = parseNumber(rotationValue.text, DEFAULTS.rotationValue, -360000, 360000);
            parsed.boundaryMode = topmost.value ? "topmost" : (bottommost.value ? "bottommost" : "selection");
            parsed.groupResult = groupResult.value;
            parsed.randomFillers = randomFillers.value;
            parsed.removeBoundary = removeBoundary.value;
            if (parsed.minSize > parsed.maxSize) {
                alert("Minimum size must be less than or equal to maximum size.", SCRIPT_NAME, true);
                return;
            }
            accepted = true;
            result = parsed;
            win.close(1);
        };
        win.center();
        win.show();
        if (!accepted) { return null; }
        return result;
    }

    function createProgressWindow() {
        var win = new Window("palette", SCRIPT_NAME + " — progress");
        var label = win.add("statictext", undefined, "Preparing geometry...");
        var bar = win.add("progressbar", undefined, 0, 100);
        bar.preferredSize = [360, 14];
        win.alignChildren = "fill";
        win.center();
        win.show();
        return {
            update: function (value) {
                var safe = parseNumber(value, 0, 0, 100);
                bar.value = safe;
                label.text = safe < 60 ? "Calculating geometry and placements..." : "Generating artwork...";
                win.update();
            },
            close: function () { try { win.close(); } catch (ignore) {} }
        };
    }

    function validateInitialState() {
        var doc;
        var selection;
        if (app.documents.length === 0) { throw new Error("No Illustrator document is open."); }
        doc = app.activeDocument;
        selection = doc.selection;
        if (!selection || typeof selection.length === "undefined" || selection.length === 0) {
            throw new Error("Nothing is selected. Select one boundary and at least one filler.");
        }
        if (selection.length === 1) { throw new Error("Only one object is selected. Select one boundary and at least one filler."); }
        return { doc: doc, selection: collectionToArray(selection) };
    }

    function majorVersion() {
        var text = safeString(app.version);
        var dot = text.indexOf(".");
        return parseInt(dot < 0 ? text : text.substring(0, dot), 10);
    }

    function main() {
        var started = new Date().getTime();
        var state = validateInitialState();
        var settings = showDialog(loadSettings());
        var boundary;
        var sources;
        var geometry;
        var triangles;
        var sampler;
        var placements;
        var generated;
        var progressWindow;
        if (settings === null) { logger.write("cancelled"); return; }
        saveSettings(settings);
        if (majorVersion() !== 30) {
            if (!confirm("This script targets Illustrator 30.x. Continue in version " + safeString(app.version) + "?")) {
                logger.write("cancelled version warning");
                return;
            }
        }
        logger.write("selection count=" + state.selection.length);
        progressWindow = createProgressWindow();
        activeProgressWindow = progressWindow;
        settings.progress = progressWindow.update;
        boundary = selectBoundary(state.selection, settings.boundaryMode);
        sources = collectFillSources(state.selection, boundary, settings.randomFillers);
        logger.write("boundary typename=" + boundary.typename + " source filler count=" + sources.length);
        settings.progress(2);
        geometry = buildBoundaryGeometry(boundary);
        logger.write("outer polygon vertex count=" + geometry.outer.length + " hole count=" + geometry.holes.length);
        settings.progress(4);
        triangles = triangulatePolygon(geometry.outer);
        sampler = buildAreaSampler(triangles);
        logger.write("triangle count=" + triangles.length);
        placements = calculatePlacements(geometry, sampler, boundary.geometricBounds, settings, settings.progress);
        logger.write("placement count=" + placements.length);
        generated = createGeneratedArtwork(state.doc, boundary, sources, placements, settings, settings.progress);
        if (settings.removeBoundary) { boundary.remove(); }
        createdItems = [];
        settings.progress(100);
        progressWindow.close();
        activeProgressWindow = null;
        logger.write("generated object count=" + generated + " runtime ms=" + (new Date().getTime() - started));
        alert("Fillinger completed. Generated objects: " + generated, SCRIPT_NAME);
    }

    function errorDetails(error) {
        var text = safeString(error.message || error);
        if (typeof error.line !== "undefined") { text += "\nLine: " + safeString(error.line); }
        return text;
    }

    logger = createLogger();
    logEnvironment();
    try {
        main();
    } catch (error) {
        logger.write("error=" + safeString(error.message || error) + " number=" + safeString(error.number) +
            " line=" + safeString(error.line) + " fileName=" + safeString(error.fileName) + " stack=" + safeString($.stack));
        cleanupCreatedItems();
        if (activeProgressWindow !== null) { activeProgressWindow.close(); activeProgressWindow = null; }
        alert(errorDetails(error), SCRIPT_NAME, true);
    }
}());
