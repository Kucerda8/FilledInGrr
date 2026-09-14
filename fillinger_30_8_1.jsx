#target illustrator
/*
 * Fillinger for Adobe Illustrator 30.8.1
 * Modernized from the original Fillinger / Circle Fill script.
 * Original concept: A Jongware; modification and refactoring: Alexander Ladygin.
 * Copyright (c) 2018 Alexander Ladygin.
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(function () {
    var SCRIPT_NAME = "Fillinger 30.8.1";
    var SETTINGS_VERSION = "5";
    var CURVE_FLATTEN_STEPS = 8;
    var GEOMETRY_EPSILON = 0.0001;
    var BEST_CANDIDATE_SAMPLES = 4;
    var MAX_STAGNANT_BATCHES = 20;
    var MIN_RADIUS_STAGNANT_BATCHES = 40;
    var SIZE_STEP_COUNT = 24;
    var MAX_GENERATED_ITEMS = 600;
    var UI_UPDATE_INTERVAL = 100;
    var OUTLINE_SAFETY_FACTOR = 0.001;
    var ACTUAL_BOUNDS_TOLERANCE = 0.5;
    var APP_FOLDER_NAME = "AdobeIllustratorFillinger";
    var createdItems = [];
    var logger = null;
    var activeProgressWindow = null;

    var DEFAULTS = {
        maxSize: 10,
        minSize: 3,
        fillRemaining: 20,
        finalFillRemaining: 80,
        minDistance: 0,
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
                var opened = false;
                try {
                    file.encoding = "UTF-8";
                    opened = file.open("a");
                    if (opened) { file.writeln("[" + nowText() + "] " + safeString(message)); }
                } catch (ignoreWrite) {
                } finally {
                    if (opened) { try { file.close(); } catch (ignoreClose) {} }
                }
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
            fillRemaining: DEFAULTS.fillRemaining,
            finalFillRemaining: DEFAULTS.finalFillRemaining,
            minDistance: DEFAULTS.minDistance,
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
        var file = null;
        var opened = false;
        var lines;
        var i;
        var splitAt;
        var key;
        var value;
        try {
            file = settingsFile();
            if (file === null || !file.exists) { return result; }
            file.encoding = "UTF-8";
            opened = file.open("r");
            if (!opened) { return result; }
            lines = file.read().split(/\r?\n/);
            for (i = 0; i < lines.length; i++) {
                splitAt = lines[i].indexOf("=");
                if (splitAt < 1) { continue; }
                key = lines[i].substring(0, splitAt);
                value = lines[i].substring(splitAt + 1);
                if (key === "maxSize") { result.maxSize = parseNumber(value, result.maxSize, 0.01, 100); }
                else if (key === "minSize") { result.minSize = parseNumber(value, result.minSize, 0.01, 100); }
                else if (key === "fillRemaining") { result.fillRemaining = parseNumber(value, result.fillRemaining, 1, 100); }
                else if (key === "finalFillRemaining") { result.finalFillRemaining = parseNumber(value, result.finalFillRemaining, 1, 100); }
                else if (key === "minDistance") { result.minDistance = parseNumber(value, result.minDistance, 0, 1000000); }
                else if (key === "rotationMode" && (value === "random" || value === "fixed")) { result.rotationMode = value; }
                else if (key === "rotationValue") { result.rotationValue = parseNumber(value, result.rotationValue, -360000, 360000); }
                else if (key === "boundaryMode" && (value === "topmost" || value === "bottommost" || value === "selection")) { result.boundaryMode = value; }
                else if (key === "groupResult") { result.groupResult = parseBoolean(value, result.groupResult); }
                else if (key === "randomFillers") { result.randomFillers = parseBoolean(value, result.randomFillers); }
                else if (key === "removeBoundary") { result.removeBoundary = parseBoolean(value, result.removeBoundary); }
            }
        } catch (error) {
            logger.write("settings read warning=" + safeString(error.message));
            result = copyDefaults();
        } finally {
            if (opened && file !== null) { try { file.close(); } catch (ignoreClose) {} }
        }
        if (result.minSize > result.maxSize) { result.minSize = result.maxSize; }
        return result;
    }

    function saveSettings(settings) {
        var file = null;
        var opened = false;
        try {
            file = settingsFile();
            if (file === null) { return; }
            file.encoding = "UTF-8";
            opened = file.open("w");
            if (!opened) { return; }
            file.writeln("version=" + SETTINGS_VERSION);
            file.writeln("maxSize=" + settings.maxSize);
            file.writeln("minSize=" + settings.minSize);
            file.writeln("fillRemaining=" + settings.fillRemaining);
            file.writeln("finalFillRemaining=" + settings.finalFillRemaining);
            file.writeln("minDistance=" + settings.minDistance);
            file.writeln("rotationMode=" + settings.rotationMode);
            file.writeln("rotationValue=" + settings.rotationValue);
            file.writeln("boundaryMode=" + settings.boundaryMode);
            file.writeln("groupResult=" + settings.groupResult);
            file.writeln("randomFillers=" + settings.randomFillers);
            file.writeln("removeBoundary=" + settings.removeBoundary);
        } catch (error) {
            logger.write("settings write warning=" + safeString(error.message));
        } finally {
            if (opened && file !== null) { try { file.close(); } catch (ignoreClose) {} }
        }
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
    function boundsDiagonal(bounds) {
        var width = boundsWidth(bounds);
        var height = boundsHeight(bounds);
        return Math.sqrt(width * width + height * height);
    }

    function copyBounds(bounds) {
        return [Number(bounds[0]), Number(bounds[1]), Number(bounds[2]), Number(bounds[3])];
    }

    function getVisibleBoundsSafe(item) {
        var bounds;
        try {
            bounds = item.visibleBounds;
            if (bounds && bounds.length === 4) { return copyBounds(bounds); }
        } catch (ignoreVisible) {}
        bounds = item.geometricBounds;
        return copyBounds(bounds);
    }

    function getBoundsCenter(item) { return boundsCenter(getVisibleBoundsSafe(item)); }

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

    function candidatesShareParent(candidates) {
        var parent;
        var i;
        if (candidates.length < 2) { return true; }
        try { parent = candidates[0].item.parent; } catch (ignoreParent) { return false; }
        for (i = 1; i < candidates.length; i++) {
            try {
                if (candidates[i].item.parent !== parent) { return false; }
            } catch (ignoreOtherParent) {
                return false;
            }
        }
        return true;
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
        if (!candidatesShareParent(candidates)) {
            logger.write("boundary stacking fallback=selection-order mode=" + mode + " reason=different-parents");
            return mode === "bottommost" ? candidates[candidates.length - 1].item : candidates[0].item;
        }
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

    function crossValue(a, b, c) {
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    }

    function segmentsIntersectOrTouch(a, b, c, d) {
        var o1 = crossValue(a, b, c);
        var o2 = crossValue(a, b, d);
        var o3 = crossValue(c, d, a);
        var o4 = crossValue(c, d, b);
        if (Math.abs(o1) <= GEOMETRY_EPSILON && pointOnSegment(c, a, b)) { return true; }
        if (Math.abs(o2) <= GEOMETRY_EPSILON && pointOnSegment(d, a, b)) { return true; }
        if (Math.abs(o3) <= GEOMETRY_EPSILON && pointOnSegment(a, c, d)) { return true; }
        if (Math.abs(o4) <= GEOMETRY_EPSILON && pointOnSegment(b, c, d)) { return true; }
        return ((o1 > GEOMETRY_EPSILON && o2 < -GEOMETRY_EPSILON) ||
                (o1 < -GEOMETRY_EPSILON && o2 > GEOMETRY_EPSILON)) &&
            ((o3 > GEOMETRY_EPSILON && o4 < -GEOMETRY_EPSILON) ||
                (o3 < -GEOMETRY_EPSILON && o4 > GEOMETRY_EPSILON));
    }

    function contoursIntersectOrTouch(first, second) {
        var i;
        var j;
        var firstNext;
        var secondNext;
        for (i = 0; i < first.length; i++) {
            firstNext = (i + 1) % first.length;
            for (j = 0; j < second.length; j++) {
                secondNext = (j + 1) % second.length;
                if (segmentsIntersectOrTouch(first[i], first[firstNext], second[j], second[secondNext])) { return true; }
            }
        }
        return false;
    }

    function allVerticesInside(inner, outer) {
        var i;
        for (i = 0; i < inner.length; i++) {
            if (!pointInPolygon(inner[i], outer)) { return false; }
        }
        return true;
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
        var j;
        var largest = 0;
        var outerIndex = -1;
        var area;
        var outer;
        var holes = [];
        var candidate;
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
            candidate = contours[i];
            if (contoursIntersectOrTouch(candidate, outer)) {
                throw new Error("Compound path contours may not cross or touch the outer contour.");
            }
            if (!allVerticesInside(candidate, outer)) {
                throw new Error("Compound paths with multiple disconnected outer islands are not supported.");
            }
            holes.push(candidate);
        }
        for (i = 0; i < holes.length; i++) {
            for (j = i + 1; j < holes.length; j++) {
                if (contoursIntersectOrTouch(holes[i], holes[j])) {
                    throw new Error("Compound path holes may not cross or touch each other.");
                }
                if (pointInPolygon(holes[i][0], holes[j]) || pointInPolygon(holes[j][0], holes[i])) {
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

    function usableBoundaryArea(geometry) {
        var area = Math.abs(polygonArea(geometry.outer));
        var i;
        for (i = 0; i < geometry.holes.length; i++) {
            area -= Math.abs(polygonArea(geometry.holes[i]));
        }
        return Math.max(area, 0);
    }

    function pointInPolygonStrict(point, polygon) {
        var inside = false;
        var i;
        var j;
        var crosses;
        for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (pointOnSegment(point, polygon[j], polygon[i])) { return false; }
            crosses = ((polygon[i][1] > point[1]) !== (polygon[j][1] > point[1])) &&
                (point[0] < (polygon[j][0] - polygon[i][0]) * (point[1] - polygon[i][1]) /
                (polygon[j][1] - polygon[i][1]) + polygon[i][0]);
            if (crosses) { inside = !inside; }
        }
        return inside;
    }

    function signWithEpsilon(value) {
        if (value > GEOMETRY_EPSILON) { return 1; }
        if (value < -GEOMETRY_EPSILON) { return -1; }
        return 0;
    }

    function projectionOverlapLength(a1, a2, b1, b2) {
        var firstMin = Math.min(a1, a2);
        var firstMax = Math.max(a1, a2);
        var secondMin = Math.min(b1, b2);
        var secondMax = Math.max(b1, b2);
        return Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin);
    }

    function segmentIntersectionKind(a, b, c, d) {
        var o1 = signWithEpsilon(crossValue(a, b, c));
        var o2 = signWithEpsilon(crossValue(a, b, d));
        var o3 = signWithEpsilon(crossValue(c, d, a));
        var o4 = signWithEpsilon(crossValue(c, d, b));
        var overlap;
        if (o1 * o2 < 0 && o3 * o4 < 0) { return 2; }
        if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
            if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) {
                overlap = projectionOverlapLength(a[0], b[0], c[0], d[0]);
            } else {
                overlap = projectionOverlapLength(a[1], b[1], c[1], d[1]);
            }
            if (overlap > GEOMETRY_EPSILON) { return 3; }
            if (overlap >= -GEOMETRY_EPSILON) { return 1; }
            return 0;
        }
        if (o1 === 0 && pointOnSegment(c, a, b)) { return 1; }
        if (o2 === 0 && pointOnSegment(d, a, b)) { return 1; }
        if (o3 === 0 && pointOnSegment(a, c, d)) { return 1; }
        if (o4 === 0 && pointOnSegment(b, c, d)) { return 1; }
        return 0;
    }

    function segmentDistance(a, b, c, d) {
        if (segmentIntersectionKind(a, b, c, d) > 0) { return 0; }
        return Math.min(
            distancePointToSegment(a, c, d),
            distancePointToSegment(b, c, d),
            distancePointToSegment(c, a, b),
            distancePointToSegment(d, a, b)
        );
    }

    function rectangleContour(bounds) {
        return [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[1]],
            [bounds[2], bounds[3]],
            [bounds[0], bounds[3]]
        ];
    }

    function largestClosedContourFromItem(item) {
        var contour = null;
        var candidate;
        var bestArea = 0;
        var area;
        var i;
        try {
            if (item.typename === "PathItem") {
                if (!item.closed) { return null; }
                return flattenPath(item);
            }
            if (item.typename === "CompoundPathItem") {
                for (i = 0; i < item.pathItems.length; i++) {
                    if (!item.pathItems[i].closed) { continue; }
                    candidate = flattenPath(item.pathItems[i]);
                    area = Math.abs(polygonArea(candidate));
                    if (area > bestArea) {
                        bestArea = area;
                        contour = candidate;
                    }
                }
            }
        } catch (ignoreContour) { return null; }
        return contour;
    }

    function effectMarginFromBounds(item, visibleBounds) {
        var geometric;
        var margin = 0;
        var i;
        try {
            geometric = copyBounds(item.geometricBounds);
            for (i = 0; i < 4; i++) {
                margin = Math.max(margin, Math.abs(visibleBounds[i] - geometric[i]));
            }
        } catch (ignoreGeometric) {}
        margin += Math.max(boundsWidth(visibleBounds), boundsHeight(visibleBounds)) * OUTLINE_SAFETY_FACTOR;
        return margin;
    }

    function normalizeContour(contour, center) {
        var result = [];
        var i;
        for (i = 0; i < contour.length; i++) {
            result.push([contour[i][0] - center[0], contour[i][1] - center[1]]);
        }
        return result;
    }

    function contourLooksCircular(contour, center, visibleBounds) {
        var width = boundsWidth(visibleBounds);
        var height = boundsHeight(visibleBounds);
        var aspect;
        var areaRatio;
        var minRadius = 1.7976931348623157e+308;
        var maxRadius = 0;
        var i;
        var r;
        if (contour === null || contour.length < 12 || width <= GEOMETRY_EPSILON || height <= GEOMETRY_EPSILON) {
            return false;
        }
        aspect = Math.max(width, height) / Math.min(width, height);
        if (aspect > 1.05) { return false; }
        areaRatio = Math.abs(polygonArea(contour)) / (width * height);
        if (Math.abs(areaRatio - Math.PI / 4) > 0.08) { return false; }
        for (i = 0; i < contour.length; i++) {
            r = distance(contour[i], center);
            minRadius = Math.min(minRadius, r);
            maxRadius = Math.max(maxRadius, r);
        }
        if (minRadius <= GEOMETRY_EPSILON) { return false; }
        return maxRadius / minRadius <= 1.08;
    }

    function buildFillerProfile(item, index) {
        var visible = getVisibleBoundsSafe(item);
        var center = boundsCenter(visible);
        var width = boundsWidth(visible);
        var height = boundsHeight(visible);
        var visibleMax = Math.max(width, height);
        var sourceContour = largestClosedContourFromItem(item);
        var area;
        var circular;
        var safety;
        var envelope;
        if (visibleMax <= GEOMETRY_EPSILON) { throw new Error("A filler has zero-size visible/geometric bounds."); }
        area = sourceContour !== null && sourceContour.length >= 3 ?
            Math.abs(polygonArea(sourceContour)) : width * height;
        circular = contourLooksCircular(sourceContour, center, visible);
        safety = visibleMax * OUTLINE_SAFETY_FACTOR;
        if (circular) {
            envelope = [];
            var circleRadius = visibleMax / 2 + safety;
            var vertexRadius = circleRadius / Math.cos(Math.PI / 8);
            var c;
            for (c = 0; c < 8; c++) {
                var theta = Math.PI / 8 + c * Math.PI / 4;
                envelope.push([Math.cos(theta) * vertexRadius, Math.sin(theta) * vertexRadius]);
            }
        } else {
            envelope = [
                [-width / 2 - safety, height / 2 + safety],
                [width / 2 + safety, height / 2 + safety],
                [width / 2 + safety, -height / 2 - safety],
                [-width / 2 - safety, -height / 2 - safety]
            ];
        }
        return {
            sourceIndex: index,
            contour: envelope,
            area: area,
            visibleMax: visibleMax,
            mode: circular ? "circle-envelope" : "oriented-bounds-envelope"
        };
    }

    function buildFillerProfiles(sources) {
        var profiles = [];
        var i;
        for (i = 0; i < sources.length; i++) {
            profiles.push(buildFillerProfile(sources[i], i));
            logger.write("filler profile index=" + i + " typename=" + sources[i].typename +
                " mode=" + profiles[i].mode + " vertices=" + profiles[i].contour.length);
        }
        return profiles;
    }

    function rotateAndScaleLocalPoint(local, scale, cosValue, sinValue, center) {
        var x = local[0] * scale;
        var y = local[1] * scale;
        return [
            center[0] + x * cosValue - y * sinValue,
            center[1] + x * sinValue + y * cosValue
        ];
    }

    function contourBounds(contour, padding) {
        var left = contour[0][0];
        var right = contour[0][0];
        var top = contour[0][1];
        var bottom = contour[0][1];
        var i;
        for (i = 1; i < contour.length; i++) {
            left = Math.min(left, contour[i][0]);
            right = Math.max(right, contour[i][0]);
            top = Math.max(top, contour[i][1]);
            bottom = Math.min(bottom, contour[i][1]);
        }
        return [left - padding, top + padding, right + padding, bottom - padding];
    }

    function buildCandidate(profile, point, radius, angle) {
        var targetSize = radius * 2;
        var scale = targetSize / profile.visibleMax;
        var radians = angle * Math.PI / 180;
        var cosValue = Math.cos(radians);
        var sinValue = Math.sin(radians);
        var contour = [];
        var i;
        var broadRadius = 0;
        var transformed;
        for (i = 0; i < profile.contour.length; i++) {
            transformed = rotateAndScaleLocalPoint(profile.contour[i], scale, cosValue, sinValue, point);
            contour.push(transformed);
            broadRadius = Math.max(broadRadius, distance(point, transformed));
        }
        return {
            point: point,
            radius: radius,
            sourceIndex: profile.sourceIndex,
            angle: angle,
            targetSize: targetSize,
            contour: contour,
            fillArea: profile.area * scale * scale,
            margin: 0,
            broadRadius: broadRadius,
            aabb: contourBounds(contour, 0)
        };
    }

    function aabbSeparated(first, second, clearance) {
        return first[2] + clearance < second[0] || second[2] + clearance < first[0] ||
            first[3] - clearance > second[1] || second[3] - clearance > first[1];
    }

    function polygonHasInteriorPointInside(first, second) {
        var i;
        var next;
        var dx;
        var dy;
        var length;
        var orientation = polygonArea(first) >= 0 ? 1 : -1;
        var epsilonStep;
        var sample;
        for (i = 0; i < first.length; i++) {
            if (pointInPolygonStrict(first[i], second)) { return true; }
        }
        for (i = 0; i < first.length; i++) {
            next = (i + 1) % first.length;
            dx = first[next][0] - first[i][0];
            dy = first[next][1] - first[i][1];
            length = Math.sqrt(dx * dx + dy * dy);
            if (length <= GEOMETRY_EPSILON) { continue; }
            epsilonStep = Math.max(GEOMETRY_EPSILON * 10, length * 0.000001);
            sample = [
                (first[i][0] + first[next][0]) / 2 + orientation * (-dy / length) * epsilonStep,
                (first[i][1] + first[next][1]) / 2 + orientation * (dx / length) * epsilonStep
            ];
            if (pointInPolygonStrict(sample, second)) { return true; }
        }
        return false;
    }

    function contourAgainstContour(first, second, clearance) {
        var i;
        var j;
        var firstNext;
        var secondNext;
        var kind;
        var gap;
        for (i = 0; i < first.length; i++) {
            firstNext = (i + 1) % first.length;
            for (j = 0; j < second.length; j++) {
                secondNext = (j + 1) % second.length;
                kind = segmentIntersectionKind(first[i], first[firstNext], second[j], second[secondNext]);
                if (kind === 2) { return true; }
                if ((kind === 1 || kind === 3) && clearance > GEOMETRY_EPSILON) { return true; }
                if (clearance > GEOMETRY_EPSILON && kind === 0) {
                    gap = segmentDistance(first[i], first[firstNext], second[j], second[secondNext]);
                    if (gap + GEOMETRY_EPSILON < clearance) { return true; }
                }
            }
        }
        if (polygonHasInteriorPointInside(first, second) || polygonHasInteriorPointInside(second, first)) { return true; }
        return false;
    }

    function segmentBounds(a, b, padding) {
        return [
            Math.min(a[0], b[0]) - padding,
            Math.max(a[1], b[1]) + padding,
            Math.max(a[0], b[0]) + padding,
            Math.min(a[1], b[1]) - padding
        ];
    }

    function cellRangeForAabb(aabb, cellSize, padding) {
        var expanded = [aabb[0] - padding, aabb[1] + padding, aabb[2] + padding, aabb[3] - padding];
        return {
            minX: Math.floor(expanded[0] / cellSize),
            maxX: Math.floor(expanded[2] / cellSize),
            minY: Math.floor(expanded[3] / cellSize),
            maxY: Math.floor(expanded[1] / cellSize)
        };
    }

    function createBoundarySpatialIndex(geometry, cellSize) {
        var index = { cellSize: Math.max(cellSize, 1), buckets: {}, segments: [], nextId: 1, queryToken: 1 };
        var contours = [geometry.outer];
        var i;
        var j;
        var next;
        var segment;
        var x;
        var y;
        var key;
        for (i = 0; i < geometry.holes.length; i++) { contours.push(geometry.holes[i]); }
        for (i = 0; i < contours.length; i++) {
            for (j = 0; j < contours[i].length; j++) {
                next = (j + 1) % contours[i].length;
                segment = {
                    id: index.nextId++,
                    a: contours[i][j],
                    b: contours[i][next],
                    aabb: segmentBounds(contours[i][j], contours[i][next], 0),
                    _seenToken: 0
                };
                index.segments.push(segment);
                var dx = segment.b[0] - segment.a[0];
                var dy = segment.b[1] - segment.a[1];
                var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / index.cellSize));
                var step;
                var sampleX;
                var sampleY;
                var cellX;
                var cellY;
                for (step = 0; step <= steps; step++) {
                    sampleX = segment.a[0] + dx * step / steps;
                    sampleY = segment.a[1] + dy * step / steps;
                    cellX = Math.floor(sampleX / index.cellSize);
                    cellY = Math.floor(sampleY / index.cellSize);
                    for (x = -1; x <= 1; x++) {
                        for (y = -1; y <= 1; y++) {
                            key = (cellX + x) + "," + (cellY + y);
                            if (!index.buckets[key]) { index.buckets[key] = []; }
                            index.buckets[key].push(segment);
                        }
                    }
                }
            }
        }
        return index;
    }

    function queryBoundarySegments(index, aabb) {
        var range = cellRangeForAabb(aabb, index.cellSize, 0);
        var result = [];
        var token = index.queryToken++;
        var x;
        var y;
        var key;
        var bucket;
        var i;
        var segment;
        for (x = range.minX; x <= range.maxX; x++) {
            for (y = range.minY; y <= range.maxY; y++) {
                key = x + "," + y;
                bucket = index.buckets[key];
                if (!bucket) { continue; }
                for (i = 0; i < bucket.length; i++) {
                    segment = bucket[i];
                    if (segment._seenToken !== token) {
                        segment._seenToken = token;
                        result.push(segment);
                    }
                }
            }
        }
        return result;
    }

    function candidateFitsBoundary(candidate, geometry, boundaryIndex) {
        var i;
        var next;
        var nearbySegments;
        var segment;
        var kind;

        if (!pointInRegion(candidate.point, geometry)) { return false; }
        nearbySegments = queryBoundarySegments(boundaryIndex, candidate.aabb);

        if (nearbySegments.length === 0) { return true; }

        if (!pointInRegion(candidate.contour[0], geometry)) { return false; }
        for (i = 0; i < candidate.contour.length; i++) {
            next = (i + 1) % candidate.contour.length;
            var j;
            for (j = 0; j < nearbySegments.length; j++) {
                segment = nearbySegments[j];
                if (aabbSeparated(segmentBounds(candidate.contour[i], candidate.contour[next], 0),
                        segment.aabb, 0)) { continue; }
                kind = segmentIntersectionKind(candidate.contour[i], candidate.contour[next], segment.a, segment.b);
                if (kind === 2) { return false; }
            }
        }

        for (i = 0; i < geometry.holes.length; i++) {
            if (pointInPolygonStrict(geometry.holes[i][0], candidate.contour)) { return false; }
        }
        return true;
    }

    function createSpatialGrid(cellSize) {
        return { cellSize: Math.max(cellSize, 1), buckets: {}, nextId: 1, queryToken: 1 };
    }

    function addToSpatialGrid(grid, placement) {
        var range;
        var x;
        var y;
        var key;
        placement._gridId = grid.nextId++;
        range = cellRangeForAabb(placement.aabb, grid.cellSize, 0);
        for (x = range.minX; x <= range.maxX; x++) {
            for (y = range.minY; y <= range.maxY; y++) {
                key = x + "," + y;
                if (!grid.buckets[key]) { grid.buckets[key] = []; }
                grid.buckets[key].push(placement);
            }
        }
    }

    function nearbyPlacements(grid, aabb, padding) {
        var range = cellRangeForAabb(aabb, grid.cellSize, padding);
        var result = [];
        var token = grid.queryToken++;
        var x;
        var y;
        var key;
        var bucket;
        var i;
        var placement;
        for (x = range.minX; x <= range.maxX; x++) {
            for (y = range.minY; y <= range.maxY; y++) {
                key = x + "," + y;
                bucket = grid.buckets[key];
                if (!bucket) { continue; }
                for (i = 0; i < bucket.length; i++) {
                    placement = bucket[i];
                    if (placement._seenToken !== token) {
                        placement._seenToken = token;
                        result.push(placement);
                    }
                }
            }
        }
        return result;
    }

    function candidateCollides(candidate, grid, minimumDistance) {
        var nearby = nearbyPlacements(grid, candidate.aabb, minimumDistance);
        var i;
        var other;
        var clearance;
        for (i = 0; i < nearby.length; i++) {
            other = nearby[i];
            clearance = candidate.margin + other.margin + minimumDistance;
            if (distance(candidate.point, other.point) > candidate.broadRadius + other.broadRadius + minimumDistance + GEOMETRY_EPSILON) {
                continue;
            }
            if (aabbSeparated(candidate.aabb, other.aabb, minimumDistance)) { continue; }
            if (contourAgainstContour(candidate.contour, other.contour, clearance)) { return true; }
        }
        return false;
    }

    function chooseProfileIndex(profiles, randomFillers) {
        if (randomFillers) { return randomInt(profiles.length); }
        return 0;
    }

    function chooseAngle(settings) {
        return settings.rotationMode === "random" ? randomRange(0, 360) : settings.rotationValue;
    }

    function tryPlacement(radius, geometry, sampler, settings, profiles, grid, boundaryIndex) {
        var point = samplePoint(sampler);
        var profileIndex = chooseProfileIndex(profiles, settings.randomFillers);
        var angle = chooseAngle(settings);
        var candidate = buildCandidate(profiles[profileIndex], point, radius, angle);
        if (!candidateFitsBoundary(candidate, geometry, boundaryIndex)) { return null; }
        if (candidateCollides(candidate, grid, settings.minDistance)) { return null; }
        return candidate;
    }

    function candidateSpacingScore(candidate, grid) {
        var searchPadding = grid.cellSize * 2;
        var nearby = nearbyPlacements(grid, candidate.aabb, searchPadding);
        var best = 1.7976931348623157e+308;
        var i;
        var gap;
        if (nearby.length === 0) { return grid.cellSize * 4; }
        for (i = 0; i < nearby.length; i++) {
            gap = distance(candidate.point, nearby[i].point) - candidate.broadRadius - nearby[i].broadRadius;
            if (gap < best) { best = gap; }
        }
        return best;
    }

    function findBestCandidate(radius, geometry, sampler, settings, profiles, grid, boundaryIndex) {
        var best = null;
        var bestScore = -1.7976931348623157e+308;
        var sample;
        var candidate;
        var score;
        for (sample = 0; sample < BEST_CANDIDATE_SAMPLES; sample++) {
            candidate = tryPlacement(radius, geometry, sampler, settings, profiles, grid, boundaryIndex);
            if (candidate === null) { continue; }
            score = candidateSpacingScore(candidate, grid) + Math.random() * 0.000001;
            if (best === null || score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        return best;
    }

    function calculatePlacements(geometry, sampler, bounds, settings, progress, profiles) {
        var width = boundsWidth(bounds);
        var height = boundsHeight(bounds);
        var referenceSize = Math.sqrt(width * height);
        var maxRadius = referenceSize * settings.maxSize / 200;
        var minRadius = referenceSize * settings.minSize / 200;
        var radii = [];
        var radius = maxRadius;
        var radiusStep;
        var sizeIndex;
        var placements = [];
        var gridCellSize = Math.max(maxRadius * 1.1, settings.minDistance + 1, 8);
        var grid = createSpatialGrid(gridCellSize);
        var boundaryIndex = createBoundarySpatialIndex(geometry, gridCellSize);
        var totalArea = usableBoundaryArea(geometry);
        var filledArea = 0;
        var level;
        var candidate;
        var remainingAtLevelStart;
        var levelFillPercent;
        var levelTargetArea;
        var levelFilledArea;
        var failedBatches;
        var maxFailedBatches;
        var insertedAtLevel;
        var progressFraction;
        if (referenceSize <= GEOMETRY_EPSILON || minRadius <= 0 || totalArea <= GEOMETRY_EPSILON) {
            throw new Error("Boundary is too small for the requested size.");
        }
        if (Math.abs(maxRadius - minRadius) <= GEOMETRY_EPSILON) {
            radii.push(maxRadius);
        } else {
            radiusStep = (maxRadius - minRadius) / SIZE_STEP_COUNT;
            for (sizeIndex = 0; sizeIndex <= SIZE_STEP_COUNT; sizeIndex++) {
                radii.push(maxRadius - radiusStep * sizeIndex);
            }
            radii[radii.length - 1] = minRadius;
        }

        logger.write("stable packing usable area=" + totalArea +
            " size steps=" + SIZE_STEP_COUNT + " size levels=" + radii.length +
            " grid cell=" + gridCellSize +
            " best-candidate samples=" + BEST_CANDIDATE_SAMPLES +
            " max items=" + MAX_GENERATED_ITEMS);

        for (level = 0; level < radii.length && placements.length < MAX_GENERATED_ITEMS; level++) {
            radius = radii[level];
            remainingAtLevelStart = Math.max(totalArea - filledArea, 0);
            levelFillPercent = level === radii.length - 1 ? settings.finalFillRemaining : settings.fillRemaining;
            levelTargetArea = remainingAtLevelStart * levelFillPercent / 100;
            levelFilledArea = 0;
            failedBatches = 0;
            insertedAtLevel = 0;
            maxFailedBatches = level === radii.length - 1 ? MIN_RADIUS_STAGNANT_BATCHES : MAX_STAGNANT_BATCHES;

            while (levelFilledArea + GEOMETRY_EPSILON < levelTargetArea &&
                    placements.length < MAX_GENERATED_ITEMS && failedBatches < maxFailedBatches) {
                candidate = findBestCandidate(radius, geometry, sampler, settings, profiles, grid, boundaryIndex);
                if (candidate === null) {
                    failedBatches++;
                } else {
                    placements.push(candidate);
                    addToSpatialGrid(grid, candidate);
                    levelFilledArea += candidate.fillArea;
                    filledArea += candidate.fillArea;
                    insertedAtLevel++;
                    failedBatches = 0;
                }

                progressFraction = levelTargetArea <= GEOMETRY_EPSILON ? 1 :
                    Math.min(levelFilledArea / levelTargetArea, 1);
                if ((insertedAtLevel + failedBatches) % 4 === 0) {
                    progress(5 + 55 * (level + progressFraction) / radii.length);
                }
            }

            logger.write("stable level=" + (level + 1) + "/" + radii.length +
                " size%=" + (radius * 200 / referenceSize) +
                " fillLimit%=" + levelFillPercent +
                " targetArea=" + levelTargetArea + " filledArea=" + levelFilledArea +
                " inserted=" + insertedAtLevel + " failedBatches=" + failedBatches +
                " approxCoverage%=" + (filledArea / totalArea * 100));
        }

        placements._filledArea = filledArea;
        placements._usableArea = totalArea;
        placements._coverage = totalArea > GEOMETRY_EPSILON ? filledArea / totalArea * 100 : 0;
        if (placements.length >= MAX_GENERATED_ITEMS) {
            logger.write("warning stable maximum generated item limit reached=" + MAX_GENERATED_ITEMS);
        }
        return placements;
    }

    function resizeItemByPercent(item, scale) {
        item.resize(scale, scale, true, true, true, true, scale);
    }

    function scaleItemToTargetSize(item, targetSize) {
        var bounds = getVisibleBoundsSafe(item);
        var visibleMax = Math.max(boundsWidth(bounds), boundsHeight(bounds));
        var scale;
        if (visibleMax <= GEOMETRY_EPSILON) { throw new Error("A filler has zero-size visible/geometric bounds."); }
        scale = targetSize / visibleMax * 100;
        resizeItemByPercent(item, scale);
    }

    function actualBoundsFitCandidate(item, candidate) {
        var bounds = getVisibleBoundsSafe(item);
        return bounds[0] + ACTUAL_BOUNDS_TOLERANCE >= candidate.aabb[0] &&
            bounds[1] - ACTUAL_BOUNDS_TOLERANCE <= candidate.aabb[1] &&
            bounds[2] - ACTUAL_BOUNDS_TOLERANCE <= candidate.aabb[2] &&
            bounds[3] + ACTUAL_BOUNDS_TOLERANCE >= candidate.aabb[3];
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
        if (placements.length === 0) { return 0; }
        if (settings.groupResult) {
            group = doc.groupItems.add();
            createdItems.push(group);
            group.move(boundary, ElementPlacement.PLACEBEFORE);
        }
        for (i = 0; i < placements.length; i++) {
            source = sources[placements[i].sourceIndex];
            duplicate = source.duplicate();
            createdItems.push(duplicate);
            if (group !== null) { duplicate.move(group, ElementPlacement.INSIDE); }
            else { duplicate.move(boundary, ElementPlacement.PLACEBEFORE); }
            scaleItemToTargetSize(duplicate, placements[i].targetSize);
            moveCenterTo(duplicate, placements[i].point[0], placements[i].point[1]);
            if (placements[i].angle !== 0) { duplicate.rotate(placements[i].angle); }
            moveCenterTo(duplicate, placements[i].point[0], placements[i].point[1]);
            if (!actualBoundsFitCandidate(duplicate, placements[i])) {
                throw new Error("Rendered filler exceeded its lightweight safety envelope. Try a simpler/expanded appearance or increase Minimum distance.");
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
        var sizePanel = win.add("panel", undefined, "Size / fill");
        var maxSize = addLabeledField(sizePanel, "Maximum size %", initial.maxSize);
        var minSize = addLabeledField(sizePanel, "Minimum size %", initial.minSize);
        var stepInfo = sizePanel.add("statictext", undefined, "Size range is automatically divided into 24 equal steps.");
        var fillRemaining = addLabeledField(sizePanel, "Fill remaining per step %", initial.fillRemaining);
        var finalFillRemaining = addLabeledField(sizePanel, "Final size fill remaining %", initial.finalFillRemaining);
        var spacingPanel = win.add("panel", undefined, "Spacing");
        var minDistance = addLabeledField(spacingPanel, "Minimum distance (pt)", initial.minDistance);
        var rotationPanel = win.add("panel", undefined, "Rotation");
        var randomRotation = rotationPanel.add("radiobutton", undefined, "Random rotation");
        var fixedRotation = rotationPanel.add("radiobutton", undefined, "Fixed rotation");
        var rotationValue = addLabeledField(rotationPanel, "Rotation angle", initial.rotationValue);
        var boundaryPanel = win.add("panel", undefined, "Boundary selection");
        var topmost = boundaryPanel.add("radiobutton", undefined, "Topmost (same parent; otherwise first selected)");
        var bottommost = boundaryPanel.add("radiobutton", undefined, "Bottommost (same parent; otherwise last selected)");
        var selectionOrder = boundaryPanel.add("radiobutton", undefined, "Use selection order (first eligible)");
        var groupResult = win.add("checkbox", undefined, "Group generated objects");
        var randomFillers = win.add("checkbox", undefined, "Random filler objects");
        var removeBoundary = win.add("checkbox", undefined, "Remove boundary after execution");
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
            parsed.fillRemaining = parseNumber(fillRemaining.text, DEFAULTS.fillRemaining, 1, 100);
            parsed.finalFillRemaining = parseNumber(finalFillRemaining.text, DEFAULTS.finalFillRemaining, 1, 100);
            parsed.minDistance = parseNumber(minDistance.text, DEFAULTS.minDistance, 0, 1000000);
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
        var profiles;
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
        profiles = buildFillerProfiles(sources);
        logger.write("boundary typename=" + boundary.typename + " source filler count=" + sources.length);
        settings.progress(2);
        geometry = buildBoundaryGeometry(boundary);
        logger.write("outer polygon vertex count=" + geometry.outer.length + " hole count=" + geometry.holes.length);
        settings.progress(4);
        triangles = triangulatePolygon(geometry.outer);
        sampler = buildAreaSampler(triangles);
        logger.write("triangle count=" + triangles.length);
        placements = calculatePlacements(geometry, sampler, boundary.geometricBounds, settings, settings.progress, profiles);
        logger.write("placement count=" + placements.length + " coverage%=" + safeString(placements._coverage));
        generated = createGeneratedArtwork(state.doc, boundary, sources, placements, settings, settings.progress);
        if (settings.removeBoundary && generated > 0) { boundary.remove(); }
        createdItems = [];
        settings.progress(100);
        progressWindow.close();
        activeProgressWindow = null;
        logger.write("generated object count=" + generated + " runtime ms=" + (new Date().getTime() - started));
        if (generated === 0) {
            logger.write("warning no valid placements found; boundary preserved");
            alert("Fillinger completed, but no valid placements were found. The boundary was preserved.", SCRIPT_NAME);
        } else {
            alert("Fillinger completed. Generated objects: " + generated +
                "\nApprox. filled area: " + Math.round(placements._coverage * 10) / 10 + "%", SCRIPT_NAME);
        }
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
