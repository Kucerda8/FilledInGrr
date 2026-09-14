# FilledInGrr

A stable object-packing script for **Adobe Illustrator 30.8.1** built on ExtendScript/JSX.

FilledInGrr fills a closed vector boundary with duplicates of one or more selected objects. The current version focuses on predictable output, even distribution, and stability in Illustrator when hundreds of filler objects are generated.

## Highlights

- Designed for **Adobe Illustrator 30.8.1**
- Shape-aware boundary handling for closed paths and supported compound paths
- Automatic distribution of the size interval into **24 equal steps**
- Independent control over how much remaining free area regular steps and the final minimum-size step may fill
- Best-candidate placement for a more even visual distribution
- Spatial grid and adaptive stopping for better performance
- Lightweight collision envelopes to avoid excessive ExtendScript workload
- Random or fixed rotation
- Optional grouping of generated objects
- Optional boundary removal after successful generation
- Persistent settings and diagnostic logging

## Installation

The easiest way to run the script is:

1. Download `fillinger_30_8_1.jsx`.
2. Open Adobe Illustrator 30.8.1.
3. Open or create a document.
4. Choose **File → Scripts → Other Script…**.
5. Select `fillinger_30_8_1.jsx`.

For permanent installation, place the JSX file in Illustrator's Scripts folder and restart Illustrator. The exact Scripts folder depends on the Illustrator installation and operating system.

## Basic usage

1. Select one closed vector object to use as the **boundary**.
2. Select at least one additional object to use as the **filler**.
3. Run FilledInGrr.
4. Configure the packing options.
5. Press **Run**.

The source filler objects are not modified; FilledInGrr creates duplicates.

## Size controls

The script intentionally keeps size control simple.

- **Maximum size %** — largest filler size relative to the boundary reference size.
- **Minimum size %** — smallest filler size.
- **Fill remaining per step %** — maximum share of the currently free area that each regular size level may try to fill.
- **Final size fill remaining %** — maximum share of the remaining free area that the final minimum-size level may try to fill.
- **Minimum distance (pt)** — required spacing between filler collision envelopes. `0` allows envelopes to touch.

There is no manual size-step setting. The interval between Maximum size and Minimum size is automatically divided into **24 equal steps**, giving up to 25 size levels including both endpoints.

Example for `10%` maximum and `3%` minimum:

- interval: `7` percentage points
- step size: `7 / 24 ≈ 0.2917` percentage points
- approximate levels: `10.00 → 9.71 → 9.42 → … → 3.29 → 3.00%`

If Maximum size equals Minimum size, only one size level is used.

## Area filling model

Each regular size level receives a target based on the free area available at the beginning of that level.

For example, with `Fill remaining per step = 20%`, each regular level may attempt to fill up to 20% of the free area that existed when that level started.

The final minimum-size level uses `Final size fill remaining %` instead. This lets small fillers act as a final gap-filling pass without forcing all earlier size levels to overfill the composition.

The target is an upper bound, not a guarantee. If the geometry no longer provides valid positions, the algorithm moves on or stops.

## Even distribution

FilledInGrr uses a lightweight **best-candidate** strategy. Instead of accepting the first random valid position, it evaluates several valid candidates and prefers the one with the best spacing from nearby placed fillers.

This reduces obvious clustering while keeping the calculation lightweight enough for Illustrator's ExtendScript engine.

## Geometry and collision model

The boundary remains shape-aware and follows the actual closed vector contour. Bézier segments are flattened to a limited number of line segments for performance and stability.

Filler collision detection uses simplified envelopes:

- circle-like fillers use a lightweight polygonal envelope,
- other fillers use a rotated envelope based on `visibleBounds`.

This is intentionally less expensive than full outline-to-outline collision testing. A long narrow filler therefore keeps a correspondingly narrow rotated collision region instead of reserving a large circumscribed circle.

The packing engine also uses a spatial grid, boundary indexing, a small best-candidate sample count, and adaptive stopping when a size level can no longer find useful free space.

## Default settings

- Maximum size: `10%`
- Minimum size: `3%`
- Automatic size steps: `24`
- Fill remaining per step: `20%`
- Final size fill remaining: `80%`
- Minimum distance: `0 pt`
- Rotation: random

A safety limit prevents generation of more than **600 filler objects** in one run.

## Boundary selection

Available boundary modes:

- **Topmost** — uses stacking order when eligible candidates share the same parent.
- **Bottommost** — same rule, selecting the lowest eligible object.
- **Use selection order** — uses the first eligible boundary object returned by Illustrator.

If topmost/bottommost candidates live in different groups or layers, FilledInGrr uses a deterministic selection-order fallback because `zOrderPosition` is only meaningful within the same parent container.

## Supported artwork and limitations

The current version is designed around practical Illustrator stability rather than mathematically exact packing.

- Boundary: one outer contour with non-nested holes.
- Self-intersecting or heavily degenerate boundary paths are not supported.
- Concave filler artwork uses a simplified collision envelope rather than its exact concave outline.
- Plugin artwork and complex live effects may behave differently until appearance is expanded.
- Packing is random and not seeded, so repeated runs can produce slightly different arrangements.
- The script targets Illustrator 30.x and has been developed specifically around Illustrator 30.8.1.

## Settings and logs

FilledInGrr stores its configuration and log files under Illustrator's ExtendScript `Folder.userData` location:

- Settings: `AdobeIllustratorFillinger/settings.txt`
- Log: `AdobeIllustratorFillinger/logs/fillinger.log`

Older saved `sizeStep` entries are ignored and removed on the next settings save.

## Project files

- `fillinger_30_8_1.jsx` — current production script
- `reference/fillinger-original.jsx` — historical implementation reference
- `reference/LICENSE-original-MIT.txt` — original MIT license text and attribution
- `docs/illustrator-30.8.1-scripting-research.md` — technical scripting research
- `TEST_PLAN.md` — validation checklist

## License and attribution

This project is distributed under the **MIT License**. See [LICENSE](LICENSE).

FilledInGrr is a modernized derivative of the original Fillinger / Circle Fill work. Original attribution is preserved, including:

- original concept: A Jongware
- modification/refactoring: Alexander Ladygin
- Copyright (c) 2018 Alexander Ladygin

The original license text is also preserved in `reference/LICENSE-original-MIT.txt`.

## Release status

The current `main` branch is intended to serve as the stable baseline for the first public release, **v1.0.0**.

Bug reports and improvement ideas are welcome through GitHub Issues once the repository is public.
