# Protokoll HERMES
**Alea Crusaders – gemensam standard för bildproduktion, överföring och publicering**

**Version:** 1.0 · **Införd:** 2026-10-15 · **Status:** GÄLLER FRAMÅT  
**Namn:** HERMES – gudarnas budbärare. Bilden ska nå rätt plats i appen med kvalitet, säkerhet och spårbarhet intakt.

## 1. Omfattning och grundregler

- HERMES används för **alla nya och alla aktivt uppdaterade bilder** i Alea Crusaders: ikoner, rollporträtt, vapen, rustningar, cutouts, bakgrunder, scener och UI-dekorationer.
- **Ingen massmigrering:** tidigare filer, fältnamn, åtkomstregler och publicerade länkar lämnas oförändrade tills vi tar ett separat beslut för respektive kategori.
- Ändra aldrig en låst grafisk standard, spelregler, data eller en annan bildkategori som bieffekt av bildarbete.
- Skilj alltid på **master/original**, **optimerad appfil** och **databasreferens**. En fil som finns i GitHub är inte automatiskt aktiverad i spelet.

## 2. HERMES-processen i åtta steg

1. **SPECIFICERA:** ange bildtyp, berört objekt/ID, funktion i appen, bildförhållande, genomskinlighet, visningsstorlek och låst designreferens.
2. **SKAPA:** ta fram originalbilden enligt visuell standard. Inga exporter eller omritningar ska förändra en godkänd originalbild.
3. **BEVARA:** lagra oförändrat original i dess etablerade mastermapp. Anteckna varifrån originalet kommer och vilka rättigheter som gäller. Skyddad eller privat bild ska inte placeras publikt.
4. **OPTIMERA:** generera separat appversion enligt en explicit profil; behåll bildens proportioner, detaljer och nödvändig transparens. Ingen nedskalning direkt av originalfilen.
5. **TRANSPORTERA:** överför äkta bytes med GitHubs Git Data API: `create_blob` med Base64, `create_tree`, `create_commit`, `update_ref`. Kontrollera blob-SHA, branchens förväntade SHA och återläs filen. `create_file` för UTF-8-text och `git push` är **inte** binäröverföringsvägen i chatten.
6. **VERIFIERA:** kontrollera verkligt filformat, dimensioner, alfakanal, filstorlek, kontrollsumma, byggets inkludering och att distributionsfilen går att nå efter publicering.
7. **AKTIVERA:** först därefter sätts rätt databasfält/bildreferens till den **optimerade** filen. Bekräfta genom att läsa tillbaka den ändrade posten. Ändra inga andra fält.
8. **RAPPORTERA:** ange originalets och appfilens sökvägar, storlekar, commit, testresultat, faktisk DB-koppling, eventuella blockerare och enkel återställningsväg.

**Ingen grön status utan faktisk återläsning och ett relevant funktionstest.** Om binära bildbytes inte är åtkomliga i en viss miljö rapporteras det som blockerare; varken en placeholder eller en textfil får utges för att vara en riktig PNG.

## 3. Bildprofiler

De profiler som är aktiva och testade ligger i [config/hermes-profiles.json](../config/hermes-profiles.json). **ARCANE IVORY / besvärjelseikon** är första aktiva profilen:

| Egenskap | Aktiv standard |
|---|---|
| Master | Kvadratisk RGBA-PNG, full upplösning |
| Leveransfil | WebP 640 × 640 px |
| Tak per appfil | 500 000 byte |
| Alfa | Äkta genomskinlig bakgrund utanför ramen, bevarad vid export |
| Innerfält | Elfenben och all detaljering **innanför** ramen förblir synliga |
| Källa | `assets/spells/arcane-ivory/<spell_key>.png` |
| Appfil | `assets/spells/arcane-ivory/<spell_key>.webp` |
| Index | `assets/spells/arcane-ivory/manifest.json` |
| Databas | `public.rule_spells.icon_path` refererar appfilen |

För porträtt, vapen, cutouts och bakgrunder fastställs motsvarande kvalitetsprofil när respektive arbetsflöde moderniseras. HERMES föreskriver **inte** 640 px eller 500 kB för alla typer; storleksgräns avgörs av faktisk skärmyta och användningsfall. Transparens krävs när motivet ska friläggas, inte för vanliga fotobakgrunder.

## 4. Arkitektur och datakoppling

- **Publika appresurser:** original och leveransfil kan bo i GitHub, men byggsystemet skickar bara optimerad appfil. Appen läser från samma ursprung efter verifierad Pages-publicering.
- **Privata resurser:** när material kräver åtkomstkontroll används befintlig skyddad Supabase Storage och autentiserad hämtning. Ingen genväg via publik GitHub för privata porträtt eller kampanjbilder.
- **Databas:** använd redan avsedda bildfält. Skapa inte nya tabeller eller ändra RLS, constraints eller åtkomstregler utan separat behov och test.
- **Besvärjelser:** `icon_path` är ikonen, `effect_image_path` effektbilden och `cutout_path` friläggningen. Sammanblanda dem inte.
- **Cache:** nya eller ändrade bilder behöver en cache-strategi; vid byte av innehåll ska samma gamla cachade bytes inte misstas för en ny version. Använd innehållshash/versionssökväg eller kontrollerad cachebrytning där klienten stödjer det.
- **Prestanda:** ladda inte i onödan alla bilder för dolda listposter. Deduplicera samma URL, förladda sparsamt för synliga/närliggande objekt och låt webbläsarens cache göra sitt. Detta är ett krav för kommande UI-ändringar – inte ett påstående om att alla äldre vyer redan är optimerade.

## 5. Kvalitetsgrindar

**HERMES QA:** (a) korrekt filsignatur och bildtyp; (b) rätt dimensioner/proportioner; (c) giltig transparens där det krävs; (d) fil under profilens budget; (e) originalets SHA-256 och appfilens storlek överensstämmer med manifest; (f) originalet oförändrat; (g) bygg och relevant specifikt test grönt; (h) filen åtkomlig i publicerad app; (i) databaspekare läst tillbaka.

För ARCANE IVORY används `python scripts/optimize_arcane_ivory.py --check` (pixelmässig alfa-verifiering med Pillow), `node scripts/hermes-verify.mjs` (transport-/manifest-/storlekskontroll) och befintligt isolerat bildtest i GitHub Actions.

**Rekommenderad leveransordning:** optimerad fil → validering → publicering → synlighetskontroll → DB-uppdatering → läs tillbaka DB → visuell kontroll. Om den sista kontrollen inte kan göras rapporteras den som ej utförd, inte som godkänd.

## 6. Återställning och fel

- Skriv aldrig över master-PNG som ett led i optimeringen.
- GitHub-fel: ingen referensuppdatering utan korrekt förväntad branch-SHA; läs aktuell HEAD och återförbered ett nytt fast-forward-försök.
- Appfil/byggfel: behåll befintlig fungerande DB-referens och publicera inte en halv färdig kedja.
- Fel efter aktivering: återställ **bara** berört bildfält till det tidigare värdet; sparad master och historiska kopplingar bevaras.
- Gör inte automatisk massuppdatering av `rule_spells` när flera ikoner genereras. Varje koppling kräver en entydig `spell_key` och verifierad leveransfil.

## 7. Hur HERMES används i uppdrag

Exempel: **”Använd Protokoll HERMES för nya rustningsbilder. Följ befintlig design, skapa original och optimerad appbild, kontrollera överföring och koppla rätt objekt. Ändra inga spelvärden.”**

För nya projektuppgifter skrivs vilken HERMES-profil som är aktiv, vilken som ännu bara är föreslagen och exakt vilka moment som faktiskt är färdiga.

## 8. Nuvarande införande – 2026-10-15

- **Implementerat:** ARCANE IVORY PNG → 640 px WebP, manifest, GitHub Git Data API-transport, isolerade bildtester och produktionsbyggkontroll.
- **Protokoll:** denna dokumenterade HERMES v1.0-standard med automatiskt verifieringsskript.
- **Ej utfört:** omstrukturering av äldre bildbibliotek; generella bildprofiler och konverterare för övriga kategorier; generell lazy-loading i alla äldre vyer; retroaktiv metadata för alla filer.

Se även [ARCANE IVORY-pipelinen](design/arcane-ivory-image-pipeline.md).
## 9. HERMES VFX – animationshändelser

Administrationen har en egen vy **Animationer · HERMES**, med ett register i `public.combat_animation_cues`. Till varje händelse kopplas en valfri MP4/WebM på max 12 MB i Supabase Storage-bucket `alea-combat-animations` (publika videos; admin krävs för uppladdning eller byte). Vid uppladdning verifieras hämtning och videoformat före koppling.

Fält per händelse: `asset_path`, `enabled`, `speed`, `scale`, `opacity`, `offset_x`, `offset_y`, `blend_mode` (Screen, Lighten, Normal). `melee.attack` har **2,5×** som startvärde. Animationerna för attack, träff, miss, parering, fummel och avståndsattack är kopplade till stridens relevanta händelser. Magihändelser finns i registret för kommande integration.

Animationer är dekorativa och får inte styra spelregler eller blockera tärningsslag. Befintliga SVG-effekter är fallback; reducerad-rörelse-inställning respekteras. Bortkoppling raderar inte den ursprungliga videofilen.
