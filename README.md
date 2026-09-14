# FilledInGrr — Fillinger pro Illustrator 30.8.1

Finální stabilní verze používá lehčí packing navržený tak, aby zůstal použitelný i při stovkách fillerů v Illustratoru/ExtendScriptu.

## Řízení velikostí

`Resize value`, `Target total coverage` a ruční `Size step` byly odstraněny.

Uživatel nastavuje pouze:

- `Maximum size %`
- `Minimum size %`
- `Fill remaining per step %`
- `Final size fill remaining %`
- `Minimum distance (pt)`

Rozsah mezi `Maximum size` a `Minimum size` se automaticky rozdělí na **24 stejných kroků**. To znamená 25 velikostních úrovní včetně obou krajních hodnot.

Příklad pro interval 10 % až 3 %:

- rozdíl je 7 procentních bodů,
- jeden krok je `7 / 24 = 0,291666…` procentního bodu,
- velikosti jsou přibližně `10,00 → 9,71 → 9,42 → … → 3,29 → 3,00 %`.

Pokud je Maximum size stejné jako Minimum size, použije se jediná velikost.

## Vyplňování plochy

Každá běžná velikost se pokusí zaplnit maximálně `Fill remaining per step %` z plochy, která byla volná na začátku daného kroku.

Poslední minimální velikost používá samostatný limit `Final size fill remaining %`, aby mohla doplnit zbylé mezery výrazněji než předchozí velikosti.

`Minimum distance = 0` dovoluje kolizním obálkám dotyk.

## Geometrie a výkon

Boundary zůstává shape-aware a používá skutečnou uzavřenou křivku. Bézierovy úseky jsou kvůli stabilitě zploštěny na 8 mezikroků.

Kolize fillerů používají lehčí obálky:

- kruhový filler používá lehkou osmiúhelníkovou obálku,
- ostatní fillery používají rotovaný `visibleBounds` obdélník.

Dlouhý úzký filler proto neblokuje velkou opsanou kružnici, ale odpovídající úzkou rotovanou oblast.

Packing používá spatial grid, boundary spatial index, 4 best-candidate vzorky a adaptive stop. Velikostní krok se ukončí, když už po sérii pokusů nenachází další použitelné místo.

Bezpečnostní limit je **600 výsledných objektů**.

## Výchozí nastavení

- Maximum size: 10 %
- Minimum size: 3 %
- Automatické kroky: 24
- Fill remaining per step: 20 %
- Final size fill remaining: 80 %
- Minimum distance: 0 pt
- Random rotation

## Boundary selection

- `Topmost` a `Bottommost` používají stacking order, pokud kandidáti sdílejí parent.
- Pokud jsou ve více kontejnerech/layers, použije se deterministický fallback podle pořadí selection.
- `Use selection order` použije první vhodný boundary objekt.

## Omezení

- Boundary podporuje jeden outer contour a nenested holes.
- Self-intersecting nebo výrazně degenerované cesty nejsou podporovány.
- U konkávních fillerů se používá lehčí bezpečnostní obálka místo přesného konkávního obrysu.
- Plugin artwork a velmi složité live effects mohou vyžadovat rozšíření vzhledu.
- Packing je náhodný a není seeded; výsledek se mezi běhy může mírně lišit.

## Settings a log

- Settings: `Folder.userData/AdobeIllustratorFillinger/settings.txt`
- Log: `Folder.userData/AdobeIllustratorFillinger/logs/fillinger.log`

Starší položka `sizeStep` v existujícím settings souboru je ignorována a při dalším uložení už se nezapisuje.

## Reference a licence

- `reference/fillinger-original.jsx` — historická implementace
- `docs/illustrator-30.8.1-scripting-research.md` — technický podklad
- `reference/LICENSE-original-MIT.txt` — původní MIT licence a attribution
