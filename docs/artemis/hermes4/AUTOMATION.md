# ARTEMIS – Work-överlämning för HERMES 4.0

**Status: implementation och isolerade tester, inte driftsatt obemannad tjänst. Papperskorg ersätter nya karantänflyttar. HERMES-behörighetsprovet är blockerat; EXAM-20 är inte genomfört.**

Se [papperskorgens behörigheter och aktuella teststatus](TRASH_TEST_REPORT.md).

Den befintliga publiceringskedjan och dess två tidigare femfilspiloter behålls. `hermes4_work.py` samordnar Work-sidan; `hermes4_work_host.mjs` anropar den befintliga användaranslutningen till Drive och GitHub. En unik köcommit på `main` startar den befintliga `hermes-drive-intake.yml`, som återanvänder `hermes2_prepare.py` och `hermes2_publish.ts`. Ingen ny publicerare, databas, Supabase-bucket, WIF-trust eller servicekontonyckel införs.

## Det externa driftsberoendet

Verktygsanslutningarna fungerar i en aktiv Work-session. Denna miljö har **ingen provisionerad beständig Work-worker**, inget mottagande Work-/Drive-event kopplat till kodens `tick`, och ingen verifierad schemalagd körmiljö med både anslutningarna och samma beständiga ledger. En öppen konversation eller en JSON-köfil är inte en sådan tjänst. Ett påminnelsejobb med en instruktion bevisar inte att körmiljö, verktygsåtkomst och lagring finns.

För helt obemannad drift behöver plattformen tillhandahålla en körmiljö som:

1. Kör `hermes4WorkTick(tools, {repo, ledger, allowWrites: true})` vid färdig Work-leverans och återkommande tills rapporten är klar. Funktionen gör **en** iteration utan lång väntan. Det återkommande anropet följer också pågående Actions-körningar och återhämtar avbrott. Drive-anslutningens nuvarande verktyg erbjuder ingen Drive-webhook.
2. Har de befintliga anslutna Drive-/GitHub-identiteterna, Arkivkopieringen använder fortsatt ansluten användaridentitet. Städningen behöver dessutom en separat kortlivad HERMES-token med `drive.metadata`, injicerad som `HERMES_CLEANUP_ACCESS_TOKEN` och förnyad av den beständiga värden. Den tokenen exporteras aldrig via verktygsprotokollet. Publicerings-Actions behåller sin befintliga `drive.readonly`-autentisering. Verktygslistan är begränsad i hosten. Permanent radering finns inte i listan. Samma identiteter måste kunna anropas utan ett nytt mänskligt godkännande per batch.
3. Bevarar ledgerkatalogen mellan iterationer/startomgångar, kör en enda worker och säkerhetskopierar registret. Registret innehåller endast metadata; det får inte ligga i GitHub eller i checkout. Flera oberoende ledgerkopior stöds inte. Låsning skyddar samtidiga processer som använder samma ledger. Förlust av ledgern ska behandlas som ett driftfel, inte lösas genom att starta om med ett tomt register.
4. Har Python 3.12, Pillow 12.3.0, den mergade koden och tillgång till lokala temporära materialiseringar från det autentiserade `download_file`-verktyget. Hosten rensar sina nedladdade bytes efter iterationen, även vid fel. En värd som avbryts abrupt måste även städa övergivna temporära nedladdningar vid återstart.

Ingen sådan worker eller produktionsautomation har startats i denna PR. Detta är ett uttryckligt kvarvarande beroende. Nuvarande uppsättning uppfyller därför **inte ännu** acceptanskriteriet ”utan ytterligare manuella åtgärder” för framtida leveranser. När körmiljön finns utför koden samtliga batchsteg; nedladdning, kopiering, köcommit, bevakning, omkörning och papperskorgssteg är kodade arbetssteg. De återstående autentiserings- och rättighetsproblemen måste också lösas före obemannad drift.

Vanlig kodgranskning/merge måste ske före driftsättning. Inga riktiga köfiler ingår i PR:n, och en kodmerge startar inte EXAM-20.

## Leveranskontrakt

Work levererar 1–100 separata original i Inbox och skriver **sist** `hermes4-<batch-id>.ready.json`, med MIME `application/json`. En `.ready.json` är en explicit publiceringsorder, med oföränderligt innehåll. Andra filnamn behandlas inte. Befintliga pilotmanifest återspelas inte automatiskt.

```json
{
  "batch_id": "exam-20-unique-id",
  "complete": true,
  "expected_count": 20,
  "schema": 4,
  "mode": "publish",
  "items": [
    {
      "kind": "spell-cutout",
      "target_key": "<exakt spell_key>",
      "target_id": "<exakt rule_spells.id>",
      "drive_file_id": "<Inbox-filens faktiska ID>",
      "source_sha256": "<64 gemena hextecken från originalbytes>",
      "source_revision": "<exakt headRevisionId för Inbox-originalet>",
      "visual_approved": true
    }
  ]
}
```

Exemplet förkortar `items`; ett giltigt tjugomanifest måste innehålla exakt tjugo objekt. Inga platshållare får levereras. `source_revision` är obligatorisk för automatisk städning och följer med oförändrad till kömanifestet. Anslutningens `list_file_revisions` kan ge `currentRevisionId` för en fullständigt listad ny fil. Vid paginering eller saknat revisionsbevis stoppas kontrollen. Äldre manifest utan pin stöds fortsatt av publiceraren, men deras Inbox-original får inte läggas i papperskorgen automatiskt. Arkiv-ID ska inte anges av Work: samordnaren hämtar det från en verifierad kopia. De åtta befintliga bildprofilerna och arkivmappningen återanvänds. UI-intag är fortsatt stängt.

Work ansvarar för visuell kvalitetsbedömning innan `visual_approved: true`: rätt motiv, ingen bakgrundsplatta och helt synligt motiv. Maskinen verifierar det intyget samt fil-ID, storlek, format, dimensioner, verklig alfa och SHA-256. Maskinell alfa-/formatkontroll är inte en visuell motivbedömning.

Manifestet får vara högst 1 MiB. Upprepat fil-ID, upprepat mål eller alias till samma register-ID/fält avvisas. Ett batch-ID är bundet till både manifestets Drive-ID och kanoniska innehåll. Samma originalfil-ID får inte tillhöra flera batcher. Okompletta leveranser ligger kvar.

## Automatisk behandling när hosten anropas

- **Mottagande:** direkt mapplistning identifierar ready-manifest. Alla förväntade källor måste finnas direkt i Inbox och passera kontroll innan någon arkivkopia eller publiceringsorder skapas. En defekt batch blockerar inte en annan batch.
- **Arkiv:** server-side `copy_file` till befintlig profilmapp, med SHA-256 som filnamn. Originalbytes återläses och verifieras. En befintlig kopia återanvänds endast efter samma kontroll. Ett förlorat kopieringssvar återhämtas genom exakt namn, mapp och hash; flera kandidater stoppar batchen. Inget original återexporteras eller laddas upp som GitHub-blob.
- **Behörighet:** HERMES får nu ha befintlig `writer` på filer direkt i Inbox; för arkivkopior krävs fortsatt endast `reader`. Ingen automatisk writer-grant eller nedgradering görs. Städningen verifierar den faktiska HERMES-identiteten och `capabilities.canTrash`, och använder separat `drive.metadata`. Scopevalet ger ingen mappspecifik rättighet; koden begränsar varje PATCH till exakt verifierat Inbox-ID. Ägandeskap i My Drive kan ändå stoppa åtgärden. Publicerings-Actions behåller `drive.readonly` och sina arkivgrindar.
- **Start:** först när samtliga objekt är arkiverade och kontrollerade skapas en unik `hermes/queue/work-<batch-id>-1.json` på `main`, i en commit. Ingen extra dispatch görs. Intent sparas före skrivningen; en befintlig identisk köfil återanvänds efter tappat svar. Modifierad köhistorik eller annat innehåll godtas inte.
- **Publicering:** befintlig Actions-körning gör om sina kontroller, konverterar och publicerar enbart WebP, verifierar Storage och URL, och aktiverar endast manifestets registerfält med befintlig compare-and-set. Befintliga aktiva bildreferenser skyddas. Samordnaren har inga Supabase-credentials.
- **Återläsning:** samordnaren kräver en slutförd `push`-körning på `main` för exakt köcommit, rätt repository och workflow. Den läser endast den exakta batchrapporten i artifacten, med gränser för ZIP-/JSON-storlek och utan att extrahera ZIP-sökvägar. Run-ID, commit, varje manifestobjekt, mål-ID, arkivbevis, tom källbucket, status och WebP-proveniens måste matcha.
- **Inbox:** endast bekräftat aktiva objekt läggs i papperskorgen. Befintlig källclaim måste fortfarande tillhöra samma batch under ledgerns processlås. Samordnaren kontrollerar även köögonblicksbilder för alla observerade ej slutförda HERMES-körningar på main och stoppar vid ett annat kömanifest som refererar samma källa. Ofullständig eller nekad kontroll lämnar originalen orörda. Den gemensamma ledgern måste vara enda vägen för nya Work-leveranser; separata ledgerkopior och okontrollerade parallella köskrivare stöds inte. Arkivbytes verifieras på nytt, och det exakta käll-ID:t och `headRevisionId` måste matcha batchmanifestet. Bara PNG direkt i Inbox med verifierad `canTrash` accepteras. Ingen ny bild flyttas till 08 eller 04. PATCH sätter `trashed=true` samt en idempotensmarkör; inget innehåll eller föräldramedlemskap ändras. Återläsning kräver samma fil/revision och egen markör. Vanliga 30-dagarsregeln för Drive gäller; applikationen utför aldrig permanent radering.
- **Rapport:** stabil JSON-rapport i `05 – BATCHER & RAPPORTER` skapas/uppdateras och återläses. När samtliga nya bilder verifierats i papperskorgen flyttas manifestet dit, vilket verifieras innan slutrapporten markeras `completed`. Rapporten anger mottagna och förväntade bilder, arkivverifierade original, publicerade WebP, aktiverade referenser, `trashed_from_inbox` och det kompatibla totalfältet `moved_from_inbox` (borttaget ur levande Inbox), steg/fel per bild, körningar och faktisk körtid.

Konfigurationens `verified_delivery_trash_only` ersätter flyttregeln. Äldre redan färdigbehandlade karantänobjekt eller ledgerposter med `moved` lämnas kvar; ingen bakåtriktad städning görs.

Städklienten kräver dessutom ett starkt ETag och `HERMES_CLEANUP_CONDITIONAL_VERIFIED=true`. Den flaggan får sättas först efter att det isolerade provet har bevisat att Drive avvisar fel `If-Match` med 412. Saknat stöd ger stopp före papperskorgs-PATCH; en lokal simulering är inte ett sådant livebevis. Hosten skickar `--allow-trash` endast vid uttryckligt `allowWrites: true`.
## Omkörning och rapportens tidsmått

Ledgern sparar kopierings-ID, köintent, köcommit, publiceringsbevis och individuella städresultat. Bilder som redan verifierats i papperskorgen återhämtas inte från Inbox och publiceras inte igen. Städintent sparas före PATCH. Tappat svar återhämtas endast när rå metadata visar samma revision, explicit papperskorgsstatus och exakt samma idempotensmarkör; någon annans papperskorgsåtgärd godtas inte som vår framgång. Ett rapport-/manifestfel återupptar slutstegen utan ny publicering.

Vid delfel städas endast lyckade bilder som även uppfyller samtliga papperskorgsvillkor. Nästa iteration använder en ny unik köfil med **bara** återstående publiceringsfel, efter ny kontroll av deras Inbox och arkiv. Standardtaket är tre Actions-försök per batch; därefter ligger felande original och manifest kvar och rapporten visar `automatic_retry_remaining: false`. Ett saknat, tvetydigt eller felbundet publiceringsbevis ger ingen städning och ingen gissad framgång. Om en bekräftat slutförd eller avbruten körning saknar rapport-artifact görs ett begränsat nytt försök med alla obekräftade objekt; publicerarens stabila jobbidentitet verifierar även sådant som redan hunnit aktiveras. Ett tillfälligt läsfel på en befintlig artifact läses igen vid nästa iteration. Run-attempt måste också matcha rapporten, så att en gammal artifact från en tidigare attempt inte används som bevis. Efter försökstaket krävs att driftorsaken åtgärdas och en avsiktlig operativ återupptagning görs; koden lovar inte att permanenta fel självläker.

`attempts[].duration_ms` är väggtid för den faktiskt slutförda Actions-attempten: `run_started_at` till senaste `completed_at` bland attemptens jobb. Om en körning inte hann skapa något jobb används körningens slutliga `updated_at`. Installation, autentisering och artifact-upload ingår; tiden i GitHubs kö före körstart ingår inte. Varje omkörning redovisas separat. Intagets/konverteringens egna fasers tid används inte som total Actions-tid. En pågående körning får inte en påhittad sluttid.

Samordnaren pollar inte i en blockerande loop och skapar inte flera körningar medan ett försök fortfarande är oklart. GitHubs befintliga concurrency-grupp och publicerare är oförändrade. Den befintliga `retry-request.json` från Actions kan fortfarande användas vid separat operativ felsökning, men den automatiska Work-vägen producerar själv sin begränsade retry.

## Avgränsningar

Direkt JSON-mapplistning är begränsad till färre än 1 000 direkta objekt per mapp; vid gränsen stoppas iterationen. Rå JSON utelämnades av anslutningens äldre sökväg i det verkliga adapterprovet och används därför inte för frånvarobevis. Arkivbilder söks med paginerad bildsökning; alla sidor måste läsas och ofullständiga resultat avvisas. Köbibliotekets GitHub Contents-gräns på 1 000 filer behandlas också som ett stopp, aldrig som bevis att en köfil saknas.

Artifact och behörighetsmetadata måste vara åtkomliga för den anslutna identiteten. Arkivmappar för andra profiler kan behöva befintlig läsåtkomst för HERMES; en filspecifik reader-rätt bevisar inte alltid läsbar föräldermetadata. Inkorgen har nu observerad writer-rätt för HERMES enligt användarens ändring. Originalarkivets rot och cutout-mapp har fortfarande reader. Den här kompletteringen ändrar inga produktions-ACL:er.

## Verifiering

Se [AUTOMATION_TEST_RESULTS.md](AUTOMATION_TEST_RESULTS.md). Testerna skiljer på syntetiskt helflöde med simulerade externa system, exekverad befintlig publicerare mot simulerad Supabase och verkliga Drive-adapteroperationer med isolerade syntetiska filer. Inget av detta utges för ett nytt produktionsexamensprov. Befintlig GitHub-publicering kör på GitHubs runner även om chatten/webbläsaren stängs. Mottagning, användaransluten arkivering, efterföljande papperskorgssteg, slutrapport och automatisk återhämtning behöver fortfarande den beständiga Work-värden. Ingen ny tjänst har driftsatts.
