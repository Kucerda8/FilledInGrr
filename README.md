# FilledInGrr — Fillinger pro Illustrator 30.8.1

## Co FilledInGrr dělá

`fillinger_30_8_1.jsx` rozmístí duplicity jednoho či více vybraných filler objektů dovnitř uzavřené hranice. Packing používá postupně menší bezpečné kružnice, plošně rovnoměrné vzorkování triangulovaného vnějšího contouru, test holes, vzdálenost od všech hran a kruhový collision model.

Zdrojové fillery se nemění. Skript nejprve vypočítá placementy v paměti a až potom vytváří duplicity.

## Cílové prostředí

- Adobe Illustrator **30.8.1 / Illustrator 2026**
- Windows 11
- ExtendScript JSX (konzervativní ECMAScript 3 syntax)
- Illustrator JavaScript DOM a ScriptUI

V repozitáři není Illustrator runtime; proběhla statická kontrola, ale je nutná ruční validace v přesném buildu Illustratoru 30.8.1.

## Instalace a spuštění

1. Otevřete dokument v Illustratoru.
2. Vyberte hranici a alespoň jeden filler.
3. Spusťte **File → Scripts → Other Script… → `fillinger_30_8_1.jsx`**.

Skript je jediný samostatný JSX soubor a nemá runtime dependency.

## Použití

### Výběr

- **Boundary:** uzavřený `PathItem` nebo podporovaný `CompoundPathItem`.
- **Fillers:** `PathItem`, `CompoundPathItem`, `GroupItem`, `TextFrame`, `PlacedItem` nebo `SymbolItem`, pokud jej Illustrator dovolí duplikovat.
- Výběr musí mít nejméně dva objekty.

Režimy boundary:

- **Topmost/Bottommost selected object (stacking order)** porovnávají `zOrderPosition` mezi podporovanými kandidáty. U objektů v různých kontejnerech/layers nemusí být hodnoty globálně srovnatelné; při shodě je deterministický fallback pořadí selection.
- **Use selection order** použije první podporovaný boundary objekt v poli `document.selection`. Illustrator může pořadí selection určovat podle svého DOM/layer chování, nikoli podle geometrické Y pozice.

### Volby dialogu

- **Maximum/Minimum size %:** rozsah poloměrů placementů odvozený z `sqrt(width × height)` boundary; platí `0 < minimum ≤ maximum ≤ 100`.
- **Minimum distance:** mezera mezi rezervovanými kružnicemi v bodech.
- **Resize value %:** část bezpečného průměru využitá fillerem.
- **Random rotation / Fixed rotation:** náhodný úhel 0–360° nebo zadaný úhel.
- **Random filler objects:** náhodně střídá zdroje. Je-li jediným zdrojem `GroupItem`, používá jeho přímé podporované child `pageItems` jako varianty.
- **Group generated objects:** vytvoří group pouze pro nové duplicity.
- **Remove boundary after execution:** odstraní boundary až po úspěšném vytvoření výsledku.

Scale zachovává poměr stran přes `resize()`. Bezpečný dosah je odvozen z diagonály `geometricBounds`, takže rezervovaný kruh zůstává konzervativní i při rotaci. Illustratoru jsou předány volby pro proporcionální scale fill/stroke patterns, gradients a stroke widths.

## Geometrická strategie a audit originálu

Nová implementace opravuje zejména neúplnou validaci document/selection, boolean sort comparator, obrácený `isNaN` test resize, implicitní globals, `constructor.name`, `hasOwnProperty` na DOM proxy, chybný index posledního bodu hole, pevné čtyřkrokové flattening, mutující hole triangulaci, nulový progress divisor a unsafe scale před rotací. Settings jsou skutečný `key=value` UTF-8 text namísto ne-JSON obsahu v `.json`.

Outer contour je největší contour podle absolutní plochy. Ostatní contoury musejí ležet uvnitř něj a jsou holes. Samostatné outer islands a nested islands jsou odmítnuty, protože tichý chybný výsledek by byl horší než omezená podpora. Outer polygon je ear-clipping triangulován; náhodné body se vybírají podle kumulativní plochy triangle a body v holes se odmítnou.

## Omezení

- Podporován je jeden outer contour a nenested holes. Více oddělených islands a island uvnitř hole vyvolají jasnou chybu.
- Self-intersecting, extrémně degenerované nebo numericky patologické cesty nejsou podporovány.
- Bézier křivky jsou aproximovány 12 segmenty na zakřivený úsek; výsledek je konzervativní vůči aproximovanému polygonu, nikoli matematicky přesné křivce.
- Kolize a boundary safety používají kružnici opsanou `geometricBounds`. Je to bezpečné, ale u úzkých/konkávních objektů méně husté.
- `geometricBounds` nezahrnuje viditelný stroke. Výrazný stroke může vizuálně přesáhnout vypočtený kruh; scénář je proto povinnou součástí ručního testování.
- Clipping groups, plugin artwork a další neuvedené typy nejsou samostatně garantovány.
- Packing je náhodný a není seeded; počet i rozmístění se mezi běhy liší.
- Safety limity jsou 1 000 pokusů na radius level a 2 000 výsledků.
- Failure cleanup odstraňuje vytvořené duplicity/group, ale nemůže poskytovat plnou transakční atomitu Illustrator DOM.

## Settings a log

- Settings: `%APPDATA%` odpovídající `Folder.userData/AdobeIllustratorFillinger/settings.txt`
- Log: `Folder.userData/AdobeIllustratorFillinger/logs/fillinger.log`

Poškozený settings soubor se načítá defensivně s defaults. Logger zaznamenává prostředí, výběr, geometrii, placements, výsledky, runtime a diagnostiku chyb; selhání logování nezastaví artwork operaci.

## Reference a licence

- `reference/fillinger-original.jsx` — historická implementace a behavior reference
- `docs/illustrator-30.8.1-scripting-research.md` — autoritativní technický podklad projektu
- `reference/LICENSE-original-MIT.txt` — původní MIT licence a attribution (Copyright © 2018 Alexander Ladygin)

Modernizovaná varianta zachovává attribution původního Fillingeru a je určena pro Illustrator 30.8.1.
