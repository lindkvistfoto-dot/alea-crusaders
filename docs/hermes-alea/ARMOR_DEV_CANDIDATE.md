# HERMES ALEA – rustningar, DEV-kandidat

Datum: 2026-11-10. Bas: `development` vid `44b3022` (PR #719).
Mål: `development`, Supabase DEV `wkiuyklzzroavclnsxna`.

## Kartläggning

Rustningar har en verklig bildfunktion: fyra administratörsuppladdade registerbilder.
DEV innehöll nio rustningstyper med nio bilder i vardera kroppsdelens fält och en
äldre gemensam `image_path`. Ingen separat användaruppladdning för rustningsexemplar
finns i den kartlagda rustningsfunktionen. Rollpersoner använder registerbilderna;
behörigheten att ändra registret är fortsatt admin.

| Del | Kod eller datakälla | Betydelse |
|---|---|---|
| Register och editor | `legacy/app.js`: `loadRuleArmorRegistry`, `renderAdminArmors`, `editRuleArmor`, `saveRuleArmor` | Läser `rule_armor_types?select=*`; sparar regelmetadata och fyra bildplatser |
| Bildval och förhandsvisning | `features/equipment/art.js`: `startArmor`, `choose`, `remove`, `prepareArmor` | Fyra oberoende val; filerna skickas nu oförändrade till gemensam ALEA-klient |
| Regeldata | `public.rule_armor_types` | Namn, spelvärden, `icon_key`, äldre bildfält samt nya managed-pekare |
| Material | `public.rule_armor_materials` | Materialregler, inga bilduppladdningar; oförändrat |
| SVG-systemikoner | `assets/armor-icons/*.svg`, `ruleArmorIconSrc`, `RULE_ARMOR_ICON_DEFS` | Statiska ikoner valda via `icon_key`; inga uppladdningar och inga ändrade SVG-filer |
| Adminiatyr | `ruleArmorIconHtml` och registerräknaren i `legacy/app.js` | Väljer bild via gemensam kroppsdelshjälpare; SVG används när bild saknas |
| Aktuell utrustning | `currentEquipmentItemArtPath` → `armorImagePathForSlot` → `imageTag` | Visar rätt kroppsdel på rollpersonen |
| Stridsvyns utrustning | `features/combat/runtime.js`: `combatTurnEquipmentHtml` | Väljer torsobild via samma hjälpare; `src` använder gemensam asset resolver |
| SLP/fiender/monster | Befintliga `armor_type_id`-referenser och rustningsval | Regelkopplingar, inga egna rustningsbilduppladdningar; stridsvisningen använder registret |

Helfigursbilder märkta ”rustning” på rollpersonens bildsida är en separat funktion
för rollpersonsillustrationer och ingår inte i rustningsregistrets fyra bilder.
Sköldar, projektiler, föremålsöverlagringar och CORE:s utvecklarpublicering ändras inte.

## Exakta målpekare

| ALEA-mål | Ny pekare i `rule_armor_types` | Revision | Äldre läsreserv |
|---|---|---|---|
| `armor_head` | `image_head_asset_id` | `image_head_revision` | `image_head_path`, därefter `image_path` |
| `armor_arms` | `image_arms_asset_id` | `image_arms_revision` | `image_arms_path`, därefter `image_path` |
| `armor_torso` | `image_torso_asset_id` | `image_torso_revision` | `image_torso_path`, därefter `image_path` |
| `armor_legs` | `image_legs_asset_id` | `image_legs_revision` | `image_legs_path`, därefter `image_path` |

Läsreserven gäller tills platsen har hanterats av ALEA. En genomförd REMOVE lämnar
revision > 0 och tom managed-pekare; då återuppstår inte den gamla bilden.
Gamla bildfält och filer flyttas, raderas eller skrivs inte om.

## Genomförda ändringar

- Samma klientinstans som vapen används i `weapon-hermes-alea.js`. Rustningsadaptern
  väljer endast målplats och skickar upload/remove till `createHermesAleaClient`.
- Rustningarna använder `DEFAULT_IMAGE_PROFILE` utan extra gränser: 12 000 000
  originalbytes, 2048 per axel, 4 194 304 pixlar, PNG/JPEG/WebP. Den äldre lokala
  900-pixelskonverteringen och skrivningen till `alea-equipment-art` har tagits bort
  från rustningsflödet. Vapenprofilen och andra bildfunktioner ändras inte.
- Befintlig WebP-konvertering, originaluppladdning, verifieringsanrop, aktivering,
  idempotens, revisionskontroll, arkivkö och signerad asset resolver återanvänds.
  Ingen ny verifierare, publisher, bucket eller HERMES 4.1-komponent införs.
- De befintliga SQL-adaptrarna för manage/lock/set får fyra tillåtna mål. Samma
  gräns mot direkt klientändring av managed-pekare som för vapen används.
- Inloggade användare får signera aktiva rustningsbilder som fortfarande är
  refererade från rätt kroppsdel, enligt vapenintegrationens befintliga läsmodell.
  Originalen förblir privata. Honor-behörigheter och regelregistrets RLS ändras inte.
- Befintlig arkivarbetare återanvänds oförändrad. Rustningsoriginal omfattas av den
  befintliga sjudagarsregeln efter verifierat Drive-arkiv. Output-cleanup utökas inte.
- Metadata sparas före bildoperationerna. Vid delfel behåller editorn återstående
  filer och slutförda kroppsdelars revisioner, så att retry inte dubbelpublicerar dem.
  En ny registerposts ID behålls vid retry.

## Verifiering

- Befintligt CI-urval: **1 825 passerade, 0 fel**, 581 sviter, lokalt.
- Oförändrad bas kördes separat: inga rapporterade testfel.
- Befintlig HERMES ALEA-arkitekturkontroll: passerad.
- `npm run build`: passerad.
- Befintliga `test_hermes_alea_worker.py`: **18 passerade**.
- Tillfällig lokal PGlite-körning av migrationen: fyra aktiveringar, oberoende
  ersättning/REMOVE, revisionskonflikt, skydd mot direkt pekarändring,
  nekad icke-adminuppladdning, aktiv displayläsning och nekad originalläsning
  för annan användare passerade. Även REMOVE av en legacy-only-plats passerade.
  Verifieringsskriptet är tillfälligt; ingen ny CI-svit har lagts till.
- Migrationen är applicerad i DEV. En transaktion med verklig admin-scope gjorde
  REMOVE på en befintlig rustnings huvudplats, verifierade revision och oförändrade
  legacy-/torsofält och återställdes med ROLLBACK. Därefter: åtta nya kolumner,
  noll managed-rustningspekare och alla befintliga bilder kvar.
- Supabase security advisors hade samma antal och typer av anmärkningar före och
  efter migrationen. De två befintliga definer-vyerna återanvänds med explicit scope;
  inga nya publika definer-funktioner eller generella åtkomstgrants tillkommer.

## Kvarstående acceptans

Ingen verklig bild har laddats upp eller Drive-arkiverats inom detta uppdrag.
Lokal Chromium startar inte: `socket() failed: Operation not permitted`.
Den delade webbläsaren når inte den lokala HTTP-kandidaten (`ERR_CONNECTION_REFUSED`).
Fullständigt webbläsartest med inloggad admin, verklig fil, Edge-anrop, signerad
visning som spelare och Drive-readback är därför inte verifierat för rustningarna.
Den befintliga Edge-funktionens originlista måste tillåta den DEV-origin som används;
ingen ny hårdkodad preview-origin eller speciallösning införs här.

Kandidaten är avsedd för DEV-granskning. Den är inte mergad och ingen LIVE-migration
eller LIVE-publicering ingår.
