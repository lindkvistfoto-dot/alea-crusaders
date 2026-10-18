# BESVÄRJELSE ILLUSTRATION — square spell art

**Bildtypen:** `BESVÄRJELSE ILLUSTRATION` (kvadratisk 1:1) — separat från `BESVÄRJELSE ILLUSTRATION WIDE`, ARCANE IVORY-ikonen, effektbilden och en eventuell frilagd cutout.

## Lagring

- Fält: `public.rule_spells.illustration_path` (nullable). Ingen befintlig bild kopieras in automatiskt.
- Den befintliga privata bucketen `alea-spell-art` används, med immutabelt WebP-objekt `spell/<spell-uuid>/<image-uuid>.webp`.
- Endast autentiserade användare får läsa. Endast Aleas administratörer får ladda upp.
- Att ta bort bilden **avlänkar bara** `illustration_path`; historiska mediafiler raderas inte.

## Direkt i Alea

Under **Administration → Besvärjelser → Redigera en befintlig besvärjelse** finns nu en femte bildtyp.

Välj **Lägg till illustration** eller **Byt illustration**, kontrollera förhandsvisningen och spara automatiskt via uppladdningen. **Ta bort bildkoppling** nollställer bara den kvadratiska bilden.

Indata: PNG/JPEG/WebP upp till 12 MB, strikt kvadratisk (exakt 1:1), minst 640 × 640 px. Klienten omvandlar till WebP och skalar ned endast vid behov till högst 1920 × 1920 px, utan beskärning. Bekräftad output måste rymmas i bucketens storleksgräns på 6 MB.

## Via HERMES 2.1

Original: täckande (icke transparent) RGB/RGBA PNG, 1:1 mellan 640 och 4096 px, högst 8 MiB. `hermes_drive_intake.py` verifierar originalet. Arkivplats:

`assets/hermes/originals/spell-illustration/<spell_key>/<sha256>.png`

`hermes2_prepare.py` gör 640 × 640 WebP (max 500 kB) medan det immutabla originalet bevaras. `hermes2_publish.ts` publicerar till privat `alea-spell-art`, verifierar checksummor och uppdaterar **endast** `illustration_path` efter CAS-kontroll.

Exempel på HERMES-köbegäran i `hermes/queue/`:

```json
{
  "schema": 1,
  "kind": "spell-illustration",
  "target_key": "luftvag",
  "drive_file_id": "ERSATT_MED_FAKTISKT_DRIVE_FIL_ID",
  "mode": "publish"
}
```

För en säker pilot utan databasändringar väljer man `"mode":"verify"`. `target_key` måste matcha `rule_spells.spell_key`.

**Obs:** Att illustrationen är lagrad innebär inte att det nya besvärjelsekortets presentation är färdigbyggd. Kortets utseende, röda läder, medaljong med befintlig ARCANE IVORY-ikon och dess illustrationer implementeras i en separat fas.
