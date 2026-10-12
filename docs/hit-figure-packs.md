# Bildserier för träffområden (v0.35.129)

Attackrutans träffkamera kan visa en bildserie i stället för den gamla
anatomiska SVG-markeringen. **Själva träffslagstabellen (1T8/1T10),
rustningsberäkningen och skadesystemet ändras inte.**

## Installerad bildserie

Standardprofil: `humanoid_male` med filerna under
`assets/hit-figures/humanoid-male/`.

| Resultatnyckel | Fil |
| --- | --- |
| Ingen markering | `neutral.webp` |
| `head` | `head.webp` |
| `chest` | `chest.webp` |
| `abdomen` | `abdomen.webp` |
| `left_arm` | `left_arm.webp` |
| `right_arm` | `right_arm.webp` |
| `left_leg` | `left_leg.webp` |
| `right_leg` | `right_leg.webp` |

Alla bilder ska ha samma proportioner och identisk placering av figuren.
Den första bildserien levereras som 512×768 WebP med alfa (transparent
bakgrund). Ingen mask/overlay behöver ritas i appen: varje markerad
bild innehåller redan sin gyllene markering.

**Om en fil inte finns eller inte kan läsas visas automatiskt den gamla
anatomiska illustrationen.** Det gör det säkert att lägga till filerna
efter kodändringen.

## Nya figurtyper – framtida tillägg

Exempelvis kan `humanoid_female` eller `skeleton` registreras via:

```js
window.aleaRegisterHitFigurePack('skeleton', {
  label: 'Skelett',
  base: './assets/hit-figures/skeleton/',
  images: {
    neutral: 'neutral.webp',
    head: 'head.webp',
    chest: 'chest.webp',
    abdomen: 'abdomen.webp',
    left_arm: 'left_arm.webp',
    right_arm: 'right_arm.webp',
    left_leg: 'left_leg.webp',
    right_leg: 'right_leg.webp'
  }
});
```

Träffresultatet bär med sig försvararens
`state.hit_figure_profile` (alternativt `state.hit_illustration_profile`),
standard `humanoid_male`. Dessa väljer vilken illustration som visas,
utan att byta träfftabell. En separat UI-väljare och bildadministration
kan tillkomma senare. För andra anatomier behövs även egna träfftabeller.

`window.combatHitLocationFigureHtml(hitLocation)` används av attackrutans
befintliga renderingsfunktion. Det finns ingen manuell klickyta.
