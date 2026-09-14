# FilledInGrr v1.0.0

First stable public release of FilledInGrr for Adobe Illustrator 30.8.1.

## What it does

FilledInGrr fills a selected closed vector boundary with duplicates of one or more filler objects. The v1.0.0 release focuses on practical Illustrator stability, even visual distribution, and controllable size progression.

## Highlights

- Built for Adobe Illustrator 30.8.1 / ExtendScript JSX
- Shape-aware closed boundary handling
- Automatic 24-step interpolation between Maximum size and Minimum size
- Separate area targets for regular size levels and the final minimum-size level
- Lightweight best-candidate placement for more even distribution
- Spatial grid and boundary indexing for improved performance
- Adaptive stopping when a size level can no longer find useful free space
- Simplified rotated filler collision envelopes for better stability with large object counts
- Random or fixed rotation
- Optional grouping of generated artwork
- Optional boundary removal after successful generation
- Persistent settings and diagnostic logging

## Default packing settings

- Maximum size: 10%
- Minimum size: 3%
- Automatic size steps: 24
- Fill remaining per step: 20%
- Final size fill remaining: 80%
- Minimum distance: 0 pt
- Random rotation

## Installation

Download `fillinger_30_8_1.jsx`, then in Illustrator use:

**File → Scripts → Other Script…**

Select the downloaded JSX file and run it.

## Notes

This release intentionally favors stable, lightweight collision calculations over exact outline-to-outline filler collision testing. The boundary remains shape-aware, while filler collision envelopes are simplified to keep ExtendScript workloads manageable.

The script is non-seeded, so repeated runs may produce slightly different arrangements.

## License and attribution

Distributed under the MIT License. Original attribution is preserved for the Fillinger / Circle Fill work, including Alexander Ladygin's 2018 MIT-licensed version and the original concept credited to A Jongware.

## Suggested GitHub release title

`FilledInGrr v1.0.0`

## Suggested repository description

`Stable shape-aware object packing script for Adobe Illustrator 30.8.1, written in ExtendScript/JSX.`
