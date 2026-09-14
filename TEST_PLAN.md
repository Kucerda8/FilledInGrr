# Test plan — Fillinger 30.8.1

## Stav validace

- **Static validation completed:** syntax/profile scan, reference integrity, review geometrie a DOM call sites.
- **Manual Illustrator validation required:** repozitář neobsahuje Adobe Illustrator 30.8.1 ani ExtendScript host. Netvrdit, že testy níže již v Illustratoru prošly.

## Společná příprava a evidence

1. Použít Adobe Illustrator 30.8.1 na Windows 11 a nový dokument v bodech.
2. Před každým testem uložit dokument nebo použít jeho kopii.
3. Zaznamenat přesnou hodnotu `Help > System Info`, vstupní objekty, UI nastavení, dobu běhu a screenshot výsledku v Outline i Preview.
4. Zkontrolovat `Folder.userData/AdobeIllustratorFillinger/logs/fillinger.log` (na Windows typicky pod `%APPDATA%`) a ověřit environment, counts a absenci erroru.
5. Ověřit, že source fillery mají shodnou pozici, scale, rotation, appearance a stacking jako před během.

## Funkční a geometrické scénáře

| # | Scénář a kroky | Očekávaný výsledek |
|---:|---|---|
| 1 | Rectangle boundary + circle filler; defaults. | Duplicity jsou uvnitř, bez překryvu; originál beze změny. |
| 2 | Circle boundary + rectangle filler. | Rohy fillerů nepřekročí aproximovanou kruhovou boundary. |
| 3 | Uzavřený irregular Bézier `PathItem`. | Flattening/triangulace uspějí; žádný filler nepřekročí křivku při vizuální kontrole. |
| 4 | `CompoundPathItem` s jedním hole. | **V hole nesmí vzniknout žádný filler ani do něj zasáhnout bezpečný kruh.** Log hlásí `hole count=1`. |
| 5 | CompoundPath s několika nenested holes. | **V žádném hole nesmí vzniknout filler.** Všechny hole edges dodržují odstup radiusu. |
| 6 | Dva fillery + Random filler objects. | Oba typy se náhodně objevují; pouze duplicity. |
| 7 | Jediný `GroupItem` filler + Random filler objects. | Variantami jsou podporované přímé child pageItems; group a children zůstávají beze změny. |
| 8 | Random rotation; použít úzký rectangle i čtverec. | Úhly se liší a **žádný filler po otočení nepřekračuje boundary ani hole**. |
| 9 | Fixed rotation 37°. | Každá duplicita je otočena o 37° vůči source; zůstává uvnitř rezervovaného kruhu. |
| 10 | Minimum distance 12 pt. | Vzdálenost bezpečných kruhů je nejméně 12 pt; artwork se nepřekrývá. |
| 11 | Group generated objects zapnuto. | Právě jedna nová group obsahuje jen generated fillers, nikoli sources/boundary. |
| 12 | Remove boundary vypnuto, poté zapnuto na kopii. | Vypnuto: boundary beze změny. Zapnuto: odstraní se až po úspěšném generation. |
| 13 | Více candidates, Topmost boundary. | Boundary odpovídá nejvyššímu srovnatelnému `zOrderPosition`; potvrdit na stejné layer. |
| 14 | Více candidates, Bottommost boundary. | Boundary odpovídá nejnižšímu srovnatelnému `zOrderPosition`; fillers nezahrnou zvolený boundary. |
| 20 | Velmi malý boundary a velké min %. | Bez pádu/nekonečné smyčky; korektně 0 výsledků nebo srozumitelná chyba. Progress bez dělení nulou. |
| 21 | Velký složitý Bézier path. | Dokončí v rozumném čase, UI průběžně reaguje, log counts odpovídají; max 2 000 items. |
| 22 | Filler s výrazným stroke. | Zdokumentovat rozdíl geometric/visible bounds; ověřit, zda stroke vizuálně nepřesahuje. Jde o známé omezení. |
| 23 | Velmi úzký filler + random rotation u concave boundary. | **Po otočení nepřekračuje boundary**; diagonal safety může zanechat více prázdného místa. |

## Validace a chybové stavy

| # | Scénář a kroky | Očekávaný výsledek |
|---:|---|---|
| 15 | Zavřít všechny dokumenty a spustit. | Alert „No Illustrator document is open”; žádná změna. |
| 16 | Dokument, ale žádný selection. | Specifický alert pro prázdný selection; dialog se neotevře. |
| 17 | Vybrat pouze jeden objekt. | Specifický alert pro jediný objekt; žádná změna. |
| 18 | Open `PathItem` zvolený jako boundary. | Srozumitelná chyba „Boundary paths must be closed”; žádné duplicity. |
| 19 | Closed zero-area boundary (kolineární points). | Srozumitelná zero-area chyba; žádný NaN/Infinity nebo DOM write. |
| 24 | Otevřít dialog, změnit hodnoty, Cancel/Esc. | Nevznikne artwork a boundary zůstane; log obsahuje cancelled. |
| 25 | Nahradit `settings.txt` neznámými keys, nesmyslnými čísly a poškozenými řádky. | Dialog použije validní hodnoty/defaults, nepadne; následné uložení vytvoří validní `version=2` key/value text. |
| 26 | CompoundPath se dvěma oddělenými outer islands. | Jasná unsupported chyba; žádný chybný výsledek. |
| 27 | Nested contour (island uvnitř hole). | Jasná unsupported chyba; žádný chybný výsledek. |
| 28 | Filler s nulovými geometric bounds nebo typ mimo podporu. | Nulový filler vyvolá chybu a cleanup; unsupported objekt se nepoužije. |
| 29 | Spustit v jiné major Illustrator verzi. | Warning s možností Cancel/Continue; verze 30.x pokračuje bez warningu. |
| 30 | Vynutit chybu během generation (např. locked destination/source). | Log obsahuje message/line/stack; bezpečně dostupné objects tohoto runu se odstraní; bez série undo. |

## Kontrolní matice UI

- Numerická pole: prázdná hodnota, text, `NaN`, extrém, desetinná čárka/tečka, záporná hodnota a velmi vysoká hodnota.
- Size invariant: minimum > maximum musí zůstat v dialogu s jasným alertem.
- Rotation radio buttons: právě jeden aktivní; angle field enabled pouze pro Fixed.
- Boundary radio buttons: právě jeden aktivní.
- Progress: geometry 0–60 %, generation 60–100 %; 0 placements nesmí dělit nulou.

## Kritéria přijetí

- Žádné překryvy rezervovaných kruhů a dodržená minimum distance.
- Žádný filler ani jeho rotovaný geometric-bounds diagonal nepřekročí aproximovaný outer contour nebo hole edge.
- Žádné fillers v holes.
- Sources jsou bitově/logicky beze změny; pouze explicitní Remove boundary smí odstranit boundary.
- Žádné nekonečné smyčky, NaN, Infinity, out-of-bounds nebo neuklizené částečné výsledky při zachytitelné chybě.
- Log counts odpovídají dokumentu a settings přežijí restart Illustratoru.
