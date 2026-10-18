# BESVÄRJELSE ILLUSTRATION WIDE — HERMES 2.1

## Bildfält och tillgång

`rule_spells.illustration_wide_path` är ett fjärde oberoende bildfält.
De befintliga fälten `icon_path` (ARCANE IVORY), `effect_image_path` och `cutout_path` bevaras.
Den färdiga WIDE-bilden ligger som immutabel WebP i privat Supabase-bucket `alea-spell-art`:
`spell/<rule_spells.id>/<image_uuid>.webp`.

En borttagning i admin nollställer **endast** WIDE-bildkopplingen; lagrade äldre filer lämnas kvar.
Både en ny uppladdning och en ersättning uppdaterar **endast** `illustration_wide_path`.
En spelare kan läsa bilden via sitt inloggade Storage-anrop; bara administratörer får ladda upp.

## Direkt i administratörsvyn

Öppna Administration → Besvärjelser → Redigera en sparad besvärjelse.
Under **BESVÄRJELSE ILLUSTRATION WIDE** finns Lägg till/Byt illustration och Ta bort bildkoppling.
PNG/JPG/WebP upp till 12 MB; klienten konverterar till WebP, max 6 MB i bucket och max 2560 × 1440 px utan beskärning.
Liggande format mellan **1,25:1 och 2,4:1** accepteras. Exakt 16:9 är inte ett krav.
Den läggs in för respektive besvärjelse i masterregistret, inte hos en enskild rollperson.

## Via HERMES/Drive

Ladda upp godkänd, täckande PNG (RGB eller helt ogenomskinlig RGBA), minst 640 × 360 px,
högst 4096 px längs valfri sida och 8 MiB. Motivet får vara vilket tillåtet liggande format som
helst mellan 1,25:1 och 2,4:1. Den råa bilden bevaras oförändrad i HERMES-arkivet.

Commit:a därefter en unik JSON-fil i `hermes/queue/`, exempelvis:

```json
{
  "schema": 1,
  "kind": "spell-illustration-wide",
  "target_key": "luftvag",
  "drive_file_id": "BYT_TILL_RIKTIGT_DRIVE_FIL_ID",
  "mode": "publish"
}
```

`target_key` är exakt `rule_spells.spell_key` (slug). Använd `"mode":"verify"`
för att kontrollera bilden utan att publicera.

HERMES Drive-intake läser PNG, verifierar dimensioner och SHA-256 och arkiverar den på
`assets/hermes/originals/spell-illustration-wide/<spell_key>/<source_sha256>.png`.
HERMES 2.1 optimerar till en immutabel WebP under 2,5 MB och verifierar kontrollsummorna.
Den publiceras till `alea-spell-art` och aktiveras sedan atomiskt i besvärjelsens
`illustration_wide_path`. Vid fel lämnas tidigare värde oförändrat.

HERMES behöver de redan konfigurerade GitHub Actions- och Supabase-hemligheterna.
Detta är struktur för kommande besvärjelsekort; bildvisningen i det färdiga kortet
implementeras i nästa etapp, separat från registret och importen.
