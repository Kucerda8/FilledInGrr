# Adobe Illustrator 30.8.1 — Scripting & Automation Research

> Cleaned project reference derived from the research prepared for this repository. Internal ChatGPT citation markers were removed because they are not portable outside ChatGPT. Public source URLs are listed at the end.

## Executive summary

For a normal custom automation script targeting **Adobe Illustrator 30.8.1 / Illustrator 2026 on Windows 11**, the recommended implementation is:

- **ExtendScript / `.jsx`**
- **Illustrator JavaScript DOM**
- **ECMAScript 3 style JavaScript**
- **ScriptUI** for a simple dialog UI
- **File / Folder API** for settings, logs and file access
- Visual Studio Code as editor
- ExtendScript Debugger if it works with the installed Illustrator build; otherwise use file logging, `$.writeln()` and small smoke-test scripts

The key rule for this repository is:

> Do not write Illustrator host-side code as modern browser/Node JavaScript. Treat the host engine as legacy ExtendScript and generate conservative ES3-compatible JSX.

## Recommended stack

| Layer | Recommendation |
|---|---|
| Host-side automation | `.jsx` / ExtendScript |
| Language profile | ES3-style JavaScript |
| API | Illustrator JavaScript DOM |
| Editor | Visual Studio Code |
| Debugging | ExtendScript Debugger, locally smoke-tested first |
| Fallback debugging | file logger + `$.writeln()` + `$.stack` |
| Simple UI | ScriptUI |
| Dockable HTML panel | CEP, only when needed |
| Deep native integration | C++ plugin SDK |
| Runtime API verification | ExtendScript `reflect` |
| Version control | Git |

## Technology status

### ExtendScript / JSX

This is the default choice for the FilledInGrr project.

Illustrator still exposes its traditional scripting model and can run JavaScript/ExtendScript scripts through **File > Scripts**.

Use it for:

- document automation,
- paths and vector geometry,
- layers,
- text,
- colors,
- artboards,
- import/export,
- batch processing,
- ScriptUI dialogs,
- settings and local logging.

### UXP

Do **not** assume that Illustrator has the same publicly supported UXP plugin surface as Photoshop, InDesign or other Adobe products.

Historical presence of a UXP runtime in an Adobe application is not equivalent to a currently documented, supported Illustrator UXP DOM/SDK suitable for a production Illustrator 30.8.1 plugin.

For this project, **do not generate UXP code unless current Illustrator-specific Adobe documentation explicitly proves that the exact required functionality is supported**.

### CEP

CEP remains relevant when a dockable HTML/CSS/JavaScript panel is actually required.

A CEP design normally uses:

- modern JavaScript in the panel/browser layer,
- ExtendScript in the Illustrator host layer,
- a bridge between them.

CEP is unnecessary for the first working FilledInGrr implementation. Prefer a single JSX + ScriptUI tool first.

### C++ SDK

Use a C++ plugin only if JSX cannot provide the required Illustrator integration, for example:

- native Illustrator tools,
- custom file formats,
- custom filters/effects,
- deeper event hooks,
- performance-critical native code.

This project should not start as a C++ plugin.

---

# ExtendScript language rules

Treat host-side Illustrator code as **ECMAScript 3 style JavaScript**.

## Safe baseline

Prefer:

```javascript
var value = 10;

function add(a, b) {
    return a + b;
}

var i;
for (i = 0; i < items.length; i++) {
    // ...
}
```

## Do not assume support for

Avoid in production JSX unless explicitly verified and intentionally transpiled/polyfilled:

```text
let
const
arrow functions
class
template literals
destructuring
spread / rest
Promise
async / await
ES modules
CommonJS
Array.forEach
Array.map
Array.filter
Array.reduce
Object.keys
Array.isArray
```

The safest coding rule for Codex is:

> If ordinary `var`, classic functions and classic loops can solve the problem, use them.

## JSON

JSON is not part of ECMAScript 3. Do not design the project around an assumption that a modern `JSON` global is always available.

For a small settings file prefer a simple explicit text format such as:

```text
version=1
maxSize=10
minSize=4
rotationMode=random
```

If JSON is truly needed, feature-detect it or bundle an ES3-compatible parser.

---

# Illustrator DOM rules

## Basic object model

Useful mental model:

```text
Application (app)
└── Documents
    └── Document
        ├── Layers
        ├── PageItems
        │   ├── PathItem
        │   ├── GroupItem
        │   ├── CompoundPathItem
        │   ├── TextFrameItem
        │   ├── PlacedItem
        │   ├── RasterItem
        │   └── SymbolItem
        ├── PathItems
        ├── GroupItems
        ├── CompoundPathItems
        ├── TextFrames
        ├── Artboards
        ├── Swatches
        ├── Gradients
        ├── Spots
        ├── Symbols
        ├── CharacterStyles
        └── ParagraphStyles
```

`PageItem` is a common artwork base class; scripts normally create or manipulate concrete artwork types.

## Active document validation

Always validate before accessing `activeDocument`:

```javascript
if (app.documents.length === 0) {
    throw new Error("No document is open.");
}

var doc = app.activeDocument;
```

## Selection validation

Do not assume a selection exists or contains a specific type.

```javascript
var sel = doc.selection;

if (!sel || typeof sel.length === "undefined" || sel.length < 2) {
    throw new Error("Select at least two objects.");
}
```

For FilledInGrr, distinguish explicitly between:

- one boundary object,
- one or more filler source objects.

## Detect Illustrator types with `typename`

Prefer:

```javascript
if (item.typename === "CompoundPathItem") {
    // ...
}
```

Do not depend on:

```javascript
item.constructor.name
```

Illustrator objects are host/DOM proxy objects, not ordinary JavaScript objects.

The same caution applies to `hasOwnProperty()` on host objects.

## Runtime reflection

ExtendScript exposes runtime reflection:

```javascript
function hasMethod(obj, methodName) {
    var methods = obj.reflect.methods;
    var i;

    for (i = 0; i < methods.length; i++) {
        if (methods[i].name === methodName) {
            return true;
        }
    }

    return false;
}
```

Use `reflect` as a practical last-mile check when documentation is ambiguous.

The project must never invent Illustrator methods because a similarly named method exists in Photoshop, InDesign or UXP.

---

# Geometry and coordinates

## Points

Illustrator scripting geometry is normally expressed in points.

Useful conversions:

```javascript
function mmToPt(mm) {
    return mm * 72.0 / 25.4;
}

function ptToMm(pt) {
    return pt * 25.4 / 72.0;
}
```

## Bounds

Important properties:

- `geometricBounds` — geometry, normally without stroke width
- `visibleBounds` — visible result including stroke
- `controlBounds` — visual bounds plus controls/handles

Bounds are represented as:

```text
[left, top, right, bottom]
```

Robust helpers:

```javascript
function boundsWidth(b) {
    return Math.abs(b[2] - b[0]);
}

function boundsHeight(b) {
    return Math.abs(b[1] - b[3]);
}

function boundsCenter(b) {
    return [
        (b[0] + b[2]) / 2,
        (b[1] + b[3]) / 2
    ];
}
```

Do not hard-code assumptions about the Y-axis direction when a calculation can instead be based on bounds or `Document.convertCoordinate()`.

## Moving artwork

Prefer relative DOM transformations when appropriate:

```javascript
item.translate(dx, dy);
```

For centering an item on a target point:

1. read current `geometricBounds`,
2. calculate its center,
3. calculate `dx`, `dy`,
4. call `translate()`.

## Scaling

Illustrator `PageItem` exposes transformations such as:

```text
translate()
rotate()
resize()
transform()
```

For proportional scaling, `resize()` is generally preferable to manually assigning width and height independently.

For FilledInGrr, make an explicit decision about stroke scaling and document it.

---

# Paths and Bézier geometry

## PathItem

A `PathItem` consists of `PathPoint` objects.

Each point exposes concepts equivalent to:

```text
anchor
leftDirection
rightDirection
pointType
```

Straight segments can be created efficiently with `setEntirePath()`.

Illustrator also exposes convenience constructors on path collections for common shapes such as rectangles, rounded rectangles, ellipses, polygons and stars.

## Curve flattening

FilledInGrr needs a polygonal approximation of arbitrary closed Bézier paths.

A robust flattening implementation should:

- preserve straight segments,
- subdivide cubic Bézier curves,
- support closed paths,
- avoid duplicate pathological points,
- use enough subdivision for the boundary accuracy required by the packing algorithm.

A fixed subdivision count can be used initially if clearly named and configurable, for example:

```javascript
var CURVE_FLATTEN_STEPS = 8;
```

An adaptive subdivision can be implemented later if needed.

---

# Compound paths and holes

This is a critical part of FilledInGrr.

For a `CompoundPathItem`:

1. flatten every closed subpath,
2. calculate signed/absolute polygon area,
3. identify the main outer contour robustly,
4. classify contours inside it as holes,
5. ensure no generated filler object is placed inside holes.

Do not identify the outer path merely from the left-most point.

A pragmatic first version can support:

```text
one outer contour + zero or more holes
```

If the input contains several disconnected outer islands and the algorithm cannot handle them correctly, detect that case and report it instead of silently producing incorrect geometry.

---

# Triangulation and random sampling

The original Fillinger uses a triangulation-based approach. The concept is suitable if implemented carefully:

1. flatten boundary contours,
2. triangulate the valid region,
3. calculate each triangle area,
4. construct cumulative areas,
5. select a triangle proportionally to its area,
6. generate a uniform random point inside it.

The implementation must validate:

```text
triangleList.length > 0
triArea > 0
```

and reject degenerate triangles.

A standard uniform point-in-triangle method is acceptable, for example the rejection/barycentric approach already used in the historical script.

---

# Collision and safe-radius model

The packing algorithm can model every placement with:

```text
center point
effective safe radius
minimum requested gap
```

For an inexpensive pre-check, compare absolute X/Y distances before calculating Euclidean distance.

Final collision logic must use the actual Euclidean distance.

A generated placement is accepted only if it is sufficiently far from:

- every boundary edge,
- every existing placement,
- every hole edge.

## Rotation safety

A major geometry concern is rotating non-square filler artwork.

If artwork is merely scaled so its largest width/height equals a circle diameter, rotating it later can make a corner extend outside that circle.

For arbitrary random rotation, size the filler using a safe circumscribed measure, for example a radius derived from its bounding-box diagonal, so that rotating the duplicate cannot leave its reserved circle.

Correctness is more important than maximum density.

---

# ScriptUI

ScriptUI is appropriate for the first production version of FilledInGrr.

Useful controls include:

```text
Window('dialog')
group
panel
statictext
edittext
checkbox
radiobutton
button
progressbar
```

The dialog should keep UI state separate from geometry and Illustrator DOM operations.

Recommended internal structure:

```text
UI
↓
Controller / validation
↓
Geometry + packing
↓
Illustrator DOM creation
↓
Logging / settings
```

The pure geometry functions should not call `alert()` or modify the Illustrator document.

---

# File and settings API

Use ExtendScript `File` and `Folder`.

For new project state prefer:

```javascript
Folder.userData
```

over hard-coded Windows user paths.

Explicitly use UTF-8 when reading/writing text files:

```javascript
file.encoding = "UTF-8";
```

A sensible FilledInGrr structure is:

```text
Folder.userData/
└── AdobeIllustratorFilledInGrr/
    ├── settings.txt
    └── logs/
        └── filledingrr.log
```

All file I/O must fail safely. A logging failure must never crash the artwork operation.

---

# Error handling and diagnostics

Wrap the application entry point:

```javascript
try {
    main();
} catch (e) {
    // log and show a concise user error
}
```

Useful diagnostic fields:

```text
e.message
e.number
e.line
e.fileName
$.stack
```

Environment logging should include:

```javascript
app.version
$.version
$.build
$.os
```

Suggested runtime log events:

```text
start
selection count
boundary typename
filler source count
flattened vertex count
hole count
triangle count
placement count
generated artwork count
runtime
error + line + stack
```

---

# Undo and failure cleanup

Illustrator exposes `app.undo()` / `app.redo()`, but do not treat repeated `undo()` calls as a reliable database-style transaction mechanism.

For FilledInGrr:

- validate as much as possible before changing the document,
- keep references to every generated duplicate,
- if a run fails, remove objects generated by that run when safe,
- do not modify the original filler source objects,
- remove the boundary only when the user explicitly asks for it.

---

# Performance guidance

The script may create hundreds of objects, so avoid unnecessary host DOM traffic.

Prefer:

- caching `app.activeDocument`,
- caching collection references and lengths,
- converting live host collections to ordinary arrays when needed,
- direct references instead of selection-driven workflows,
- avoiding `app.redraw()` in tight loops,
- throttling `win.update()` calls,
- using `setEntirePath()` for straight multipoint paths,
- performing geometry in JavaScript arrays before creating Illustrator objects.

Avoid infinite searches by defining limits such as:

```javascript
var MAX_ATTEMPTS_PER_RADIUS = 1000;
var MAX_GENERATED_ITEMS = 5000;
```

The exact values can be tuned later.

---

# Actions and executeMenuCommand

Illustrator has long had scripting escape hatches such as Actions and `app.executeMenuCommand()`, but menu command strings are not a suitable foundation for this project.

FilledInGrr should be implemented using:

- Illustrator DOM,
- ScriptUI,
- File/Folder,
- pure geometry/math.

Do **not** use `executeMenuCommand()` unless no documented alternative exists and the exact command is verified in the target Illustrator build.

---

# Original Fillinger audit targets

The reference implementation is stored in this repository at:

```text
reference/fillinger-original.jsx
```

Important issues to audit rather than blindly preserve include:

## Selection validation

The historical top-level condition is not a robust validation of all states. Explicitly handle:

- no document,
- no selection,
- one selected object,
- two or more selected objects.

## Sort comparator

Historical code contains logic equivalent to:

```javascript
items.sort(function (a, b) {
    return a.geometricBounds[1] <= b.geometricBounds[1];
});
```

A sort comparator should return a numeric negative/zero/positive result, not a boolean.

Also do not confuse geometric vertical position with Illustrator stacking order.

## Resize value validation

The original logic around `isNaN(parseFloat(resizeValue.text))` is inverted and can choose the wrong value.

Create a reusable numeric parser with default/min/max handling.

## Implicit globals

The original script creates many variables without `var`.

The new implementation must have no accidental globals.

Wrap the final script in an IIFE:

```javascript
(function () {
    // implementation
}());
```

## DOM type detection

Replace `object.constructor.name` checks with `object.typename`.

Avoid relying on `hasOwnProperty()` for host DOM proxies.

## Compound path edge indexing

Audit code equivalent to:

```javascript
innerpaths[i][innerpaths.length - 1]
```

The last point of each contour should be indexed against that contour's own length:

```javascript
innerpaths[i][innerpaths[i].length - 1]
```

## Dynamic ElementPlacement lookup

Prefer explicit enum members over dynamic string indexing whenever practical.

## Settings format

The original file name ends in `.json`, but the data is comma-separated rather than JSON.

Do not preserve that mismatch in the new implementation.

---

# Required coding rules for Codex

Use the following rules when modifying this repository.

```text
TARGET
Adobe Illustrator 30.8.1 on Windows 11.

LANGUAGE
Generate Illustrator host code as ExtendScript-compatible JSX.
Target ECMAScript 3 style syntax unless a feature is explicitly verified.

NEVER ASSUME CROSS-APP API
Do not use Photoshop DOM, InDesign DOM, After Effects DOM or UXP APIs
merely because they exist in another Adobe application.

UXP
Do not generate Illustrator UXP code unless current Illustrator-specific
Adobe documentation explicitly supports the requested functionality.

SYNTAX
Use var, classic functions and classic loops.
Avoid let, const, arrows, classes, template literals, destructuring,
spread/rest, promises and async/await.

JSON
Do not assume JSON exists. Feature-detect it or avoid it.

DOM VALIDATION
Verify Illustrator methods/properties against Illustrator documentation
and use runtime reflect when documentation is uncertain.

PAGEITEM TYPES
Do not assume every selected item is a PathItem.
Use typename and explicitly handle supported host object types.

COORDINATES
Do not assume a universal Y-axis direction.
Use bounds and Document.convertCoordinate when relevant.

BOUNDS
Distinguish geometricBounds, visibleBounds and controlBounds.

MENU COMMANDS
Do not invent executeMenuCommand strings.

ERRORS
Use try/catch and log message, number, line, fileName and $.stack.

FILES
Use ExtendScript File/Folder and explicit UTF-8 encoding.

PERFORMANCE
Keep geometry in JS arrays where possible, minimize redraw/UI updates,
and cache DOM references.

SOURCE OBJECTS
Never modify original filler source artwork; duplicate it first.

CORRECTNESS
If a geometry case is unsupported, detect it and report it rather than
silently generating incorrect artwork.
```

---

# Illustrator 30.8 / 30.8.1 compatibility note

Adobe's Illustrator 30.8 release notes do not announce a new scripting DOM, a new JavaScript engine or a replacement for ExtendScript scripting.

A community report for **Illustrator 30.8.0** describes problems attaching/launching the ExtendScript Debugger compared with 30.7. This should be treated as a compatibility warning, not as proof that every Illustrator 30.8.1 installation has the same problem.

Before relying on the debugger, run a local smoke test in the exact installed Illustrator 30.8.1 build.

Example:

```javascript
#target illustrator

$.writeln("Illustrator: " + app.version);
$.writeln("ExtendScript: " + $.version);
$.writeln("Build: " + $.build);
$.writeln("OS: " + $.os);

var x = 10; // breakpoint test
x = x + 5;
$.writeln("x = " + x);
```

If debugging is unreliable, continue development using VS Code as editor plus:

- File > Scripts > Other Script,
- file logging,
- `$.writeln()`,
- `$.stack`,
- small focused smoke-test JSX files.

---

# Suggested repository structure

```text
FilledInGrr/
├── docs/
│   └── illustrator-30.8.1-scripting-research.md
├── reference/
│   ├── fillinger-original.jsx
│   └── LICENSE-original-MIT.txt
├── src/
│   └── filledingrr.jsx          # future production implementation
├── tests/
├── README.md
└── TEST_PLAN.md
```

The production implementation should eventually remain deployable as one self-contained `.jsx` file even if development helpers/tests are stored separately in the repository.

---

# Public sources

Primary references used by the research:

- Adobe — Install and run scripts in Illustrator  
  https://helpx.adobe.com/illustrator/desktop/automate-visualize-data/automate-actions/install-and-run-scripts.html

- Adobe Illustrator Developer  
  https://developer.adobe.com/illustrator/

- Adobe Illustrator release notes  
  https://helpx.adobe.com/illustrator/desktop/new-features/release-notes.html

- Illustrator system requirements  
  https://helpx.adobe.com/illustrator/desktop/get-started/learn-the-basics/technical-requirements.html

- Adobe UXP Hub  
  https://developer.adobe.com/uxp/

- UXP version/support information  
  https://developer.adobe.com/uxp/uxp-api/versions

- Illustrator Scripting Guide / community-maintained reference based on Adobe material  
  https://ai-scripting.docsforadobe.dev/

- ExtendScript Scripting Guide  
  https://extendscript.docsforadobe.dev/

- Adobe CEP resources  
  https://github.com/Adobe-CEP/CEP-Resources

- Adobe CEP / ExtendScript debugger releases  
  https://github.com/Adobe-CEP/Getting-Started-guides/releases/

- Illustrator / ExtendScript / ScriptUI TypeScript typings  
  https://github.com/docsforadobe/Types-for-Adobe

- Original Fillinger repository  
  https://github.com/alexander-ladygin/illustrator-scripts

- Original Fillinger source  
  https://github.com/alexander-ladygin/illustrator-scripts/blob/master/fillinger.jsx

---

# Final recommendation for FilledInGrr

Build the first production version as:

```text
single .jsx file
+ ExtendScript
+ Illustrator DOM
+ ES3 syntax
+ ScriptUI
+ File/Folder settings and logging
+ pure JavaScript geometry
```

Use the historical `reference/fillinger-original.jsx` only as a behavior and algorithm reference. Do not preserve its defects merely for compatibility.

The priorities for the rewritten implementation are:

```text
1. geometric correctness
2. Illustrator 30.8.1 compatibility
3. stability and failure safety
4. readable maintainable code
5. performance
6. preservation of useful historical Fillinger behavior
```
