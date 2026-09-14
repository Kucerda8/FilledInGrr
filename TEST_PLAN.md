# Fillinger 30.8.1 — final test plan

## Stabilita

- Ověřit běh s 100, 300 a přibližně 500+ výslednými objekty.
- Ověřit, že progress pokračuje a Illustrator nezůstává dlouhodobě bez odezvy.
- Ověřit cleanup po chybě.
- Ověřit bezpečnostní strop 600 výsledných objektů.

## Automatické velikostní kroky

- Interval 10 % až 3 % musí vytvořit 24 stejných kroků a 25 velikostních úrovní včetně 10 % a 3 %.
- Velikostní rozdíl jednoho kroku musí být `7 / 24 = 0,291666…` procentního bodu.
- Poslední úroveň musí být přesně Minimum size.
- Maximum size = Minimum size musí vytvořit jedinou velikost.
- V UI nesmí být ruční `Size step`.
- Starší `sizeStep` v settings se musí bezpečně ignorovat.

## Vyplnění

- `Fill remaining per step` omezuje každý běžný velikostní krok.
- `Final size fill remaining` se použije jen pro poslední minimální velikost.
- `Resize` ani `Target total coverage` nejsou v UI ani settings.

## Geometrie

- Kruh + Minimum distance 0: sousední fillery se mohou dotýkat, nesmí se plošně překrývat.
- Dlouhý úzký obdélník: musí používat rotovanou úzkou obálku, ne opsanou kružnici.
- Random rotation: kolize musí respektovat otočenou obálku.
- Concave boundary: žádná obálka nesmí křížit vnější hranici.
- Compound boundary s hole: žádná obálka nesmí zasáhnout hole.

## Boundary selection

- Topmost/Bottommost ve stejném parentu musí respektovat stacking order.
- Při různých parentech musí být fallback deterministický.
- Selection order musí použít první vhodný boundary objekt.

## Výkon

- Spatial grid musí omezovat porovnávání na blízké objekty.
- Boundary spatial index musí omezovat přesné testy jen na relevantní hrany.
- Stagnace musí ukončit krok místo dlouhého hledání neexistujícího místa.
