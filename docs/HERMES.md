# Protokoll HERMES
**Alea Crusaders – gemensam standard för bildproduktion, överföring och publicering**

**Version:** 2.3 (aktiv push-baserad intagskedja) · **Införd:** 2026-10-15 · **Status:** GÄLLER FRAMÅT  
**Namn:** HERMES – gudarnas budbärare. Bilden ska nå rätt plats i appen med kvalitet, säkerhet och spårbarhet intakt.

## HERMES UI – kryptexgrafik (2026-10-16)

HERMES stöder nu även `kind=ui` för `arcane-mechanism-link` och `arcane-mechanism-chamber`. De följer samma aktiva push-kedja med HERMES Drive Inbox, OIDC-autentisering, Drive-original, SHA-256 och GitHub-original. Länken accepterar 3:2-, 4:3- eller 3:4-PNG med RGBA-transparens. Den senaste stora vertikala emblemvarianten är 3:4. Kammarbakgrunden behåller 3:1 och ogenomskinlig RGB/RGBA. UI-intaget startar `.github/workflows/hermes-ui-intake.yml` i stället för besvärjelsepubliceraren.

Den särskilda UI-publiceraren verifierar källhash, producerar 768×512 WebP för 3:2-länken, 768×576 för 4:3-länken eller 576×768 för 3:4-länken (768×256 för kammaren), verifierar transparens och publicerar till `features/combat/arcane-mechanism-{link,chamber}.webp` samt tillhörande manifest. GitHub Pages uppdateras via explicit build-anrop. **Inga Supabase-databasfält aktiveras för dessa publika statiska UI-resurser.** De statiska resurserna följer med Vite-byggets befintliga `features/`-kopiering. Bildkällorna är publika, privata filer får inte läggas i detta flöde.

---

## HERMES 2.3 – aktiv överlämning Drive → GitHub Actions (2026-10-15)

**Standard för godkänd, publik bild av typ `spell` eller `symbol`:**
1. ChatGPT/Work lägger den riktiga PNG-filen i [HERMES TEMP INBOX](https://drive.google.com/drive/folders/1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp) och läser filens **faktiska Drive-ID**.
2. Direkt efter bekräftad uppladdning skapar ChatGPT en **ny, unik** UTF-8-JSON-fil som commit i `hermes/queue/<job-id>.json` på `main`. Detta är en **aktiv push-trigger**; ingen polling, timer eller automatisk Drive-mappbevakare används.
3. `hermes-drive-intake.yml` startar på `push` av exakt denna köfil. Dess GitHub OIDC-identitet byts mot kortlivat Google Drive-readonly-token genom Workload Identity Federation (`alea-hermes`, pool `github`, provider `alea-hermes`).
4. `scripts/hermes_drive_intake.py` läser bara filen från den angivna HERMES-mappen, verifierar MIME, originalbytes, kvadratisk RGBA-PNG med alfa, SHA-256 och godkänd måltyp/nyckel.
5. För `mode=publish` lagrar GitHub Actions verifierade originalbytes som en innehållsadresserad PNG under `assets/hermes/originals/<kind>/<target_key>/<sha256>.png` via Git Data API. Existerande exakt lika original återanvänds; vid konflikt stoppas jobbet. Repo är publikt – godkänn endast publika bilder.
6. Intaget skickar **uttrycklig** `workflow_dispatch` med exakt `source_path` till `.github/workflows/hermes21-intake.yml`. Vanlig `push` från `GITHUB_TOKEN` skulle inte automatiskt starta nästa Actions-körning; dispatch löser detta.
7. Befintlig HERMES 2.1 verifierar PNG/WebP, lagrar och läser tillbaka Supabase Storage och aktiverar **endast** avsett `icon_path` när alla kontroller klarat grinden. Status `ACTIVE` är ett separat slutbevis, inte synonymt med lyckad intags-Action.

**Köfil:**
```json
{
  "schema": 1,
  "kind": "symbol",
  "target_key": "stopp",
  "drive_file_id": "<verifierat Google Drive file ID>",
  "mode": "publish"
}
```

- `mode=verify`: hämtar och kvalitetssäkrar utan att skriva till GitHub-original eller Supabase.
- `mode=publish`: commit/återanvänd original + explicit starta HERMES 2.1.
- Kön accepteras enbart via nya/ändrade JSON-filer på `main` eller explicit manuell dispatch. Filen är en instruktion, aldrig PNG/Base64 eller hemliga credentials. Ge varje startorder ett nytt unikt filnamn.
- **Inga nyckelfiler:** servicekonto `hermes-transfer@alea-hermes.iam.gserviceaccount.com`, mappläsning i Drive och OIDC-anslutning kontrollerad i GitHub Actions.
- Filen stannar i Drive tills publiceringskedjan är verifierad; ingen automatisk radering.
- **Bevisat:** `STOPP` genom aktiv kö-commit `a0d8574b` (verify) och `1807cb99` (publish); `HERMES_PUBLISH_DISPATCHED` gick vidare till HERMES 2.1 som verifierade PNG → 167144 bytes WebP och rapporterade `ALREADY_ACTIVE`. Detta bevisar start, Drive-nedladdning, återanvändning av redan befintligt original och explicit handoff utan ändring av aktiv ikon. **Skrivning av helt ny GitHub-originalblob via Actions är nu verifierad med LOCKELSE.**

**Verifierad nypublicering – LOCKELSE (2026-10-15):** Den AI-genererade ARCANE IVORY-PNG-filen lades i HERMES Drive Inbox under namnet `ARCANE_IVORY_LOCKELSE_original.png`. En aktiv GitHub-commit med JSON-köordern `hermes/queue/20261015-lockelse-publish-02.json` startade [intaget, körning 38805924269](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/38805924269), som hämtade 2 764 668 verkliga PNG-byte, verifierade kvadratisk RGBA 1254×1254 och SHA-256 `6a1e849d2a0acd499c9a77d8798fa43675c2761c959569fe64597bf2bd4807a6`, och skapade en **ny** GitHub-originalblob i commit `752cee2f04dfc0eeb7951592af80cf3ed6abc17a`. HERMES skickade en uttrycklig dispatch till [publiceringskörning 38805968156](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/38805968156) som konverterade till WebP 168 910 byte och verifierat aktiverade `rule_magic_symbols.icon_path = hermes/symbol/lockelse/10b1cb950aca4e226117e760d1cd85059e53f511570d9c9cb323db80ff435c89.webp`. Supabase `hermes_jobs.status=active` och båda lagringsobjekten bekräftade via oberoende SQL-återläsning. Visuell kontroll i mobilens admin återstår.

### Begränsning

Drive lagrar inte automatiskt någon GitHub-startorder. Det är den aktiva handlingen efter att ChatGPT/Work laddat upp filen som skapar JSON-committen. Om startordern uteblir startar ingen Action. `spell` och `symbol` stöds; inga övriga medietyper ska publiceras med denna profil.

---

## HERMES 2.2 – tidigare binära överföringsvägen (fallback, 2026-10-15)

**Definition:** HERMES är Alea Crusaders verifierbara intags-, filtransport-, optimerings- och publiceringsprotokoll. AI skapar eller väljer godkända original; HERMES ser till att rätt fil blir lagrad, kontrollerad och aktiverad i rätt databaspost. Direkta experiment med chatbilagors interna bytes är **inte längre standardvägen**.

**Standardflöde (för publika, godkända bilder):**

```text
ChatGPT/Work eller användare
  -> Alea Crusaders – HERMES 2.1 – TEMP INBOX (Google Drive)
  -> Drive-hämtning och validerad GitHub Git Data API-överföring
  -> assets/hermes/originals/<kind>/<target_key>/<source_sha256>.png (main)
  -> GitHub Actions: .github/workflows/hermes21-intake.yml
  -> scripts/hermes2_prepare.py: validerad PNG -> WebP + manifest
  -> scripts/hermes2_publish.ts: GitHub-verifiering, immutable Storage,
     SHA-256-återläsning, publik URL-verifiering, jämför-och-sätt-aktivering
  -> Supabase Storage + exakt ett avsett databasfält
  -> kontroll och statusrapport
```

- **En enda tillfällig inkorg:** [Alea Crusaders – HERMES 2.1 – TEMP INBOX](https://drive.google.com/drive/folders/1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp). Kontrollera Drive-fil-ID, MIME, faktiska bytes, rätt mål och SHA före överföring. Kopior i Drive är mellanlager, inte originalarkiv. Radera inte inkorgen automatiskt förrän slutverifiering och eventuell felsökning är avslutade.
- **Filen passerar GitHub som faktisk binär blob:** anslutet Drive-verktyg hämtar Base64 och skickar i samma säkra verktygskörning till GitHub `create_blob(encoding="base64")`; därefter `create_tree`, `create_commit`, `update_ref`. Kontrollera blob-SHA och GitHub-sökväg; skriv aldrig ut Base64 i chatten.
- **GitHub-commit utlöser publicering:** godkända inkommande PNG-filer på `main` triggar HERMES 2.1 GitHub Action. Alla transformations-, Storage-, återläsnings- och databassteg ska utföras av Action-pipelinen, inte improviseras separat av chatten. Repetitioner ska vara idempotenta.
- **Rätt nyckel per mål:** `kind=spell` kräver befintlig `rule_spells.spell_key` och uppdaterar bara `rule_spells.icon_path`. `kind=symbol` kräver `rule_magic_symbols.symbol_key` och uppdaterar bara `rule_magic_symbols.icon_path`. Fel mål eller saknad post är ett blockerande fel, aldrig en anledning att gissa.
- **Krav för aktivering:** komplett, korrekt PNG; verklig RGBA-alfa och lämpliga dimensioner; bevarad transparens i WebP; exakt GitHub-källkontroll; lyckad uppladdning till både `alea-hermes-source` och `alea-hermes-public`; verifierade SHA-256 vid Storage-download och publik URL; samt bekräftad databasåterläsning. Ingen aktivering innan samtliga grindar passerat.
- **Säkerhet:** publikt GitHub-repo får bara innehålla godkända publika bildoriginal. Använd aldrig flödet för privata bilder. Supabase-nyckeln finns endast som GitHub Actions secret `HERMES_SUPABASE_SERVICE_ROLE_KEY` och får aldrig exponeras i chatten, Drive, logs eller repo.
- **Status är saklig:** `ACTIVE` först när `hermes_jobs.status=active`, loggen innehåller `HERMES_ACTIVE`, rätt `icon_path` är läst tillbaka och lagringsfilerna verifierats. Annars `PENDING`, `FAILED` eller `NEEDS_REVIEW`; grönt CI utan publicering räcker inte.
- **Avgränsning:** det finns **ingen verifierad automatisk Drive-mappövervakning** som på egen hand skapar GitHub-commits. Drive -> GitHub sker tills vidare via explicit initierat anslutet verktygsflöde. Vidare automationsarbete kan införa en separat intagstjänst med egna rättigheter, deduplicering och felkö, utan att röra den bevisade GitHub -> Supabase-pipelinen.
- **Aktivt stöd:** HERMES 2.1-publiceraren stöder i dag `spell` och `symbol` som transparenta, kvadratiska PNG-original med WebP 640×640 (högst 500 kB). Porträtt, vapen, bakgrunder, videor och privata bilder har andra krav och ingår först efter separata profiler/implementationer. Befintlig ARCANE IVORY v1.0 GitHub Pages-pipeline finns kvar för bakåtkompatibilitet tills migrering beslutats.

**Godkänt genomförandetest:** STOPP (`symbol/stopp`), GitHub Actions-körning [38788702369, försök 2](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/38788702369), 2026-10-15. PNG 2 678 163 byte -> WebP 167 144 byte. `origin=github_actions`, `hermes_jobs.status=active`, `rule_magic_symbols.icon_path` matchade den verifierade publicerade filen. Drive -> GitHub är även dokumenterat testad tidigare i §10–11; detta STOPP-acceptanstest verifierade **GitHub -> Supabase -> aktivering**.

**Princip för alla nya uppdrag:** "Använd HERMES" betyder använd denna standardkedja och redovisa varje verkligt uppnått steg; hoppa aldrig tyst över en blockerad länk.

---

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
5. **TRANSPORTERA:** den primära vägen är HERMES Drive-inkorg -> hämtning som binär Base64 via anslutna verktyg -> GitHub Git Data API: `create_blob`, `create_tree`, `create_commit`, `update_ref`. Kontrollera blob-SHA, aktuell `main`, förväntad commit och återläsning. `create_file` för UTF-8-text och `git push` är **inte** den rekommenderade binäröverföringsvägen i chatten.
6. **VERIFIERA:** kontrollera verkligt filformat, dimensioner, alfakanal, filstorlek, kontrollsumma, byggets inkludering och att distributionsfilen går att nå efter publicering.
7. **AKTIVERA:** den bevisade GitHub Action-pipelinen publicerar först och ändrar därefter endast rätt databasfält till den **optimerade** filen, genom jämför-och-sätt, och läser tillbaka posten. Aktivera inte manuellt parallellt medan Action körs. Ändra inga andra fält.
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


## 10. Bevisad binär transport från uppladdade bilder via Google Drive

**Verifierad 2026-10-15 för tre ARCANE IVORY-ikoner:** `vaderforutsagelse`, `forandra`, `vindkontroll`. Från användarens redan befintliga originalfiler i Drive-mappen `ARCANE_IVORY_TRANSFER_TMP` gick originalens samtliga byte hela vägen till GitHub, utan terminalens `git push` eller manuell uppladdning i Alea.

1. Identifiera och verifiera Drive-originalet mot användarens bilaga: rätt besvärjelsenyckel, filstorlek, PNG-signal och SHA-256/SHA-1 Git blob. **Lita inte enbart på liknande filnamn eller motiv.**
2. I **samma anslutna verktygskörning**: hämta Google Drive-originalet med `fetch(download_raw_file=true, include_base64=true)`. Skicka svarets `b64_string` direkt till GitHub `create_blob(content=b64_string,encoding='base64')`. Skriv aldrig ut den stora Base64-strängen i chatten, lägg den inte i källkoden och kopiera inte manuellt via mellanled.
3. Jämför GitHubs blob-SHA med SHA-1 beräknad över den **exakta originalfilens** Git blob-format. Vid avvikelse: stoppa före commit och databas.
4. Använd `create_tree`, `create_commit` och `update_ref` med aktuell `main`-förälder för `assets/spells/arcane-ivory/<spell_key>.png`. Publika spelikoner får ligga i denna publika masterkatalog; använd **inte** detta flöde för privata bilder.
5. Befintlig GitHub Action `ARCANE IVORY optimize and publish` kör Pillow-konvertering och alfaverifiering, publicerar 640×640 WebP och uppdaterar manifest med källfilens SHA-256. Kontrollera att genererad WebP-SHA och bytes faktiskt finns i GitHub samt att Pages-bygget lyckas.
6. Uppdatera **endast** rätt `public.rule_spells.icon_path` för de verifierade besvärjelserna (samt `icon_focus_*` och `icon_zoom` om full ram kräver det). Läs tillbaka minst antal ändrade rader och exakta paths. Ändra inga övriga besvärjelsefält.
7. Visuell kontroll på riktig mobil återstår även efter grön automation; rapportera den ärligt.

**Verifierade appfiler:** `vaderforutsagelse.webp` 184 780 B, `forandra.webp` 178 422 B, `vindkontroll.webp` 195 934 B. Samtliga 640×640, kvalitet 90, alfa bevarad, original oförändrade. De tre motsvarande `rule_spells`-raderna fick rätt `icon_path` och `icon_zoom=100` för att visa hela den låsta ramen. Totala antalet besvärjelser med kopplad ikon ökade från 8 till 11.

**Begränsning:** verktygstransporten bygger på att originalet faktiskt finns åtkomligt i Google Drive. Ett lokalt chattuppladdat objekt utan Drive-kopia kan ännu inte antas kunna skickas binärt via den här vägen.

## 11. ChatGPT Library → Google Drive → GitHub (verifierad binär överföring)

**Verifierad 2026-10-15:** Det går att skicka en bild som redan finns i ChatGPT Library till Aleas Google Drive och därifrån till en äkta GitHub-blob **utan användarens manuella nedladdning/uppladdning**.

**Kedja för AI-skapade bilder:**

1. Leta upp rätt bild med `files__list({surface:"library", ...})` eller `files__search(...)`. Använd det faktiska `file_id`; identifiera först motivet, filens namn och eventuell låst referens. Arbeta aldrig från antagen sökväg.
2. Med `files__manage_library({operations:[{operation:"upload",source_file_ref:{file_id:"<verifierat id>"},destination_path:"/Google Drive/Alea Crusaders transfer/<korrekt namn>.png",overwrite:false}]})`: kopiera filen direkt från ChatGPT Library till anslutet Drive. Befintlig målmapp måste finnas. **Ingen manuell mellanlandning på användarens enhet.**
3. Läs resultatets Google Drive-fil-ID, hämta original med `mcp__Google_Drive__fetch({url:"https://drive.google.com/file/d/<Drive ID>/view",download_raw_file:true,include_base64:true})` via `functions.exec`. Verifiera att Base64-strängen börjar med PNG-signaturen, att MIME-typen är `image/png`, och att filstorlek är rimlig.
4. I samma `functions.exec`-körning, skicka den oförändrade `b64_string` direkt till `mcp__GitHub__create_blob({repository_full_name:"lindkvistfoto-dot/alea-crusaders",content:b64_string,encoding:"base64"})`. **Skriv aldrig ut binärbytes/Base64 till chatten.**
5. Bygg `create_tree` med `{path,mode:"100644",type:"blob",sha:<blob SHA>}` ovanpå aktuell `main`-tree, skapa commit med aktuell head som förälder och publicera med `update_ref` utan force och med `expected_sha`. Vid parallell uppdatering: läs aktuell head och skapa om commit, skriv inte över andra ändringar. För ett rent test kan ett commit göras **utan ref-uppdatering**, så att `main` inte ändras.
6. Läs tillbaka `fetch_file({path,ref:<commit SHA>,encoding:"base64"})` och jämför `sha` med `create_blob`-resultatet. Därefter gäller HERMES-stegen för WebP-konvertering, Actions, Pages och databaspekare. **Databasfältet ändras aldrig före verifierad publicering.**

**Utfört pilotbevis 2026-10-15:** Library-bilden `Hela – smaragdgröna helande löv.png` laddades till `Alea Crusaders transfer/hermes-chatgpt-bridge-hela-pilot.png`, hämtades därifrån som 2 862 513 PNG-byte och transporterades till GitHub. Git blob-SHA `3eb72f59006ce23402333a32324136c55c9dbf5a` överensstämde exakt med `fetch_file` i test-commit `6ec9d9957e5f503c26a38f9379c51dc8821704a5`. Ingen branch ref ändrades och inget speldatafält uppdaterades under testet.

**Viktig avgränsning:** Detta är bevisad transport när bilden redan är tillgänglig i ChatGPT Library. Om en viss bild inte går att identifiera i Library måste den först göras åtkomlig. Pilotens fil är ett transporttest, **inte ett godkännande av bildens motiv eller en publicerad Alea-ikon**.
