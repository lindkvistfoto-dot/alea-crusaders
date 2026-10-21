# ARTEMIS – Work-överlämning för HERMES 4.0

**Status: implementation och isolerade tester, inte driftsatt obemannad tjänst. EXAM-20 är inte genomfört.**

Den befintliga publiceringskedjan och dess två tidigare femfilspiloter behålls. `hermes4_work.py` samordnar Work-sidan; `hermes4_work_host.mjs` anropar den befintliga användaranslutningen till Drive och GitHub. En unik köcommit på `main` startar den befintliga `hermes-drive-intake.yml`, som återanvänder `hermes2_prepare.py` och `hermes2_publish.ts`. Ingen ny publicerare, databas, Supabase-bucket, WIF-trust eller servicekontonyckel införs.

## Det externa driftsberoendet

Verktygsanslutningarna fungerar i en aktiv Work-session. Denna miljö har **ingen provisionerad beständig Work-worker**, inget mottagande Work-/Drive-event kopplat till kodens `tick`, och ingen verifierad schemalagd körmiljö med både anslutningarna och samma beständiga ledger. En öppen konversation eller en JSON-köfil är inte en sådan tjänst. Ett påminnelsejobb med en instruktion bevisar inte att körmiljö, verktygsåtkomst och lagring finns.

För helt obemannad drift behöver plattformen tillhandahålla en körmiljö som:

1. Kör `hermes4WorkTick(tools, {repo, ledger, allowWrites: true})` vid färdig Work-leverans och återkommande tills rapporten är klar. Funktionen gör **en** iteration utan lång väntan. Det återkommande anropet följer också pågående Actions-körningar och återhämtar avbrott. Drive-anslutningens nuvarande verktyg erbjuder ingen Drive-webhook.
2. Har de befintliga anslutna Drive-/GitHub-identiteterna, inte ett exporterat OAuth-token eller skrivbehörighet för HERMES-servicekontot. Verktygslistan är begränsad i hosten. Permanent radering finns inte i listan. Samma identiteter måste kunna anropas utan ett nytt mänskligt godkännande per batch.
3. Bevarar ledgerkatalogen mellan iterationer/startomgångar, kör en enda worker och säkerhetskopierar registret. Registret innehåller endast metadata; det får inte ligga i GitHub eller i checkout. Flera oberoende ledgerkopior stöds inte. Låsning skyddar samtidiga processer som använder samma ledger. Förlust av ledgern ska behandlas som ett driftfel, inte lösas genom att starta om med ett tomt register.
4. Har Python 3.12, Pillow 12.3.0, den mergade koden och tillgång till lokala temporära materialiseringar från det autentiserade `download_file`-verktyget. Hosten rensar sina nedladdade bytes efter iterationen, även vid fel. En värd som avbryts abrupt måste även städa övergivna temporära nedladdningar vid återstart.

Ingen sådan worker eller produktionsautomation har startats i denna PR. Detta är ett uttryckligt kvarvarande beroende. Nuvarande uppsättning uppfyller därför **inte ännu** acceptanskriteriet ”utan ytterligare manuella åtgärder” för framtida leveranser. När körmiljön finns utför koden samtliga batchsteg; nedladdning, kopiering, köcommit, bevakning, omkörning och flytt är inte användarens manuella arbetssteg.

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
      "visual_approved": true
    }
  ]
}
```

Exemplet förkortar `items`; ett giltigt tjugomanifest måste innehålla exakt tjugo objekt. Inga platshållare får levereras. Arkiv-ID ska inte anges av Work: samordnaren hämtar det från en verifierad kopia. De åtta befintliga bildprofilerna och arkivmappningen återanvänds. UI-intag är fortsatt stängt.

Work ansvarar för visuell kvalitetsbedömning innan `visual_approved: true`: rätt motiv, ingen bakgrundsplatta och helt synligt motiv. Maskinen verifierar det intyget samt fil-ID, storlek, format, dimensioner, verklig alfa och SHA-256. Maskinell alfa-/formatkontroll är inte en visuell motivbedömning.

Manifestet får vara högst 1 MiB. Upprepat fil-ID, upprepat mål eller alias till samma register-ID/fält avvisas. Ett batch-ID är bundet till både manifestets Drive-ID och kanoniska innehåll. Samma originalfil-ID får inte tillhöra flera batcher. Okompletta leveranser ligger kvar.

## Automatisk behandling när hosten anropas

- **Mottagande:** direkt mapplistning identifierar ready-manifest. Alla förväntade källor måste finnas direkt i Inbox och passera kontroll innan någon arkivkopia eller publiceringsorder skapas. En defekt batch blockerar inte en annan batch.
- **Arkiv:** server-side `copy_file` till befintlig profilmapp, med SHA-256 som filnamn. Originalbytes återläses och verifieras. En befintlig kopia återanvänds endast efter samma kontroll. Ett förlorat kopieringssvar återhämtas genom exakt namn, mapp och hash; flera kandidater stoppar batchen. Inget original återexporteras eller laddas upp som GitHub-blob.
- **Behörighet:** befintlig reader-rätt till `hermes-transfer@alea-hermes.iam.gserviceaccount.com` verifieras på Inbox- och arkivfiler. Om rättigheten saknas får endast samma konto filspecifik `reader`. En observerad skrivrätt stoppar överlämningen; ingen automatisk ändring av bredare rättigheter sker. Actions behåller `drive.readonly` och verifierar själv både arkivplacering och bytes. Saknas bevis för placering stannar publiceringen enligt befintlig grind.
- **Start:** först när samtliga objekt är arkiverade och kontrollerade skapas en unik `hermes/queue/work-<batch-id>-1.json` på `main`, i en commit. Ingen extra dispatch görs. Intent sparas före skrivningen; en befintlig identisk köfil återanvänds efter tappat svar. Modifierad köhistorik eller annat innehåll godtas inte.
- **Publicering:** befintlig Actions-körning gör om sina kontroller, konverterar och publicerar enbart WebP, verifierar Storage och URL, och aktiverar endast manifestets registerfält med befintlig compare-and-set. Befintliga aktiva bildreferenser skyddas. Samordnaren har inga Supabase-credentials.
- **Återläsning:** samordnaren kräver en slutförd `push`-körning på `main` för exakt köcommit, rätt repository och workflow. Den läser endast den exakta batchrapporten i artifacten, med gränser för ZIP-/JSON-storlek och utan att extrahera ZIP-sökvägar. Run-ID, commit, varje manifestobjekt, mål-ID, arkivbevis, tom källbucket, status och WebP-proveniens måste matcha.
- **Inbox:** endast bekräftat aktiva objekt flyttas, efter ny hashkontroll av arkivet och Inbox-källan. Målet är **08 – VERIFIERADE DUBBLETTER – VÄNTAR PÅ RADERING**, ID `1pK1jaJCL2Y-LJGhM9d9gWB3SLPzYv0dQ`. Den äldre `04 – KARANTÄN` används inte. Endast Inbox-föräldern tas bort; andra föräldrar bevaras. Flytten läses tillbaka. Permanent radering saknar kodväg.
- **Rapport:** stabil JSON-rapport i `05 – BATCHER & RAPPORTER` skapas/uppdateras och återläses. När samtliga bilder flyttats flyttas manifestet dit, vilket verifieras innan slutrapporten markeras `completed`. Rapporten anger mottagna och förväntade bilder, arkivverifierade original, publicerade WebP, aktiverade referenser, Inbox-flyttar, steg/fel per bild, körningar och faktisk körtid.

Det förra gemensamma förbudet mot automatiska flyttar/raderingar har i konfigurationen preciserats: alla automatiska raderingar och obestyrkta flyttar är fortsatt förbjudna; endast den uttryckligen beställda verifierade leveransflytten tillåts.

## Omkörning och rapportens tidsmått

Ledgern sparar kopierings-ID, köintent, köcommit, publiceringsbevis och individuella flyttresultat. Redan flyttade bilder återhämtas inte från Inbox och publiceras inte igen. Tappat flyttsvar återhämtas genom metadata och bytekontroll i karantänen. Ett rapport-/manifestfel återupptar slutstegen utan ny publicering.

Vid delfel flyttas de lyckade bilderna. Nästa iteration använder en ny unik köfil med **bara** återstående publiceringsfel, efter ny kontroll av deras Inbox och arkiv. Standardtaket är tre Actions-försök per batch; därefter ligger felande original och manifest kvar och rapporten visar `automatic_retry_remaining: false`. Ett saknat, tvetydigt eller felbundet publiceringsbevis ger ingen flytt och ingen gissad framgång. Om en bekräftat slutförd eller avbruten körning saknar rapport-artifact görs ett begränsat nytt försök med alla obekräftade objekt; publicerarens stabila jobbidentitet verifierar även sådant som redan hunnit aktiveras. Ett tillfälligt läsfel på en befintlig artifact läses igen vid nästa iteration. Run-attempt måste också matcha rapporten, så att en gammal artifact från en tidigare attempt inte används som bevis. Efter försökstaket krävs att driftorsaken åtgärdas och en avsiktlig operativ återupptagning görs; koden lovar inte att permanenta fel självläker.

`attempts[].duration_ms` är väggtid för den faktiskt slutförda Actions-attempten: `run_started_at` till senaste `completed_at` bland attemptens jobb. Om en körning inte hann skapa något jobb används körningens slutliga `updated_at`. Installation, autentisering och artifact-upload ingår; tiden i GitHubs kö före körstart ingår inte. Varje omkörning redovisas separat. Intagets/konverteringens egna fasers tid används inte som total Actions-tid. En pågående körning får inte en påhittad sluttid.

Samordnaren pollar inte i en blockerande loop och skapar inte flera körningar medan ett försök fortfarande är oklart. GitHubs befintliga concurrency-grupp och publicerare är oförändrade. Den befintliga `retry-request.json` från Actions kan fortfarande användas vid separat operativ felsökning, men den automatiska Work-vägen producerar själv sin begränsade retry.

## Avgränsningar

Direkt JSON-mapplistning är begränsad till färre än 1 000 direkta objekt per mapp; vid gränsen stoppas iterationen. Rå JSON utelämnades av anslutningens äldre sökväg i det verkliga adapterprovet och används därför inte för frånvarobevis. Arkivbilder söks med paginerad bildsökning; alla sidor måste läsas och ofullständiga resultat avvisas. Köbibliotekets GitHub Contents-gräns på 1 000 filer behandlas också som ett stopp, aldrig som bevis att en köfil saknas.

Artifact och behörighetsmetadata måste vara åtkomliga för den anslutna identiteten. Arkivmappar för andra profiler kan behöva befintlig läsåtkomst för HERMES; en filspecifik reader-rätt bevisar inte alltid läsbar föräldermetadata. Inbox och cutout-arkivmappen visade redan samma servicekonto som reader vid kontrollen i denna leverans. Ingen produktions-ACL har ändrats.

## Verifiering

Se [AUTOMATION_TEST_RESULTS.md](AUTOMATION_TEST_RESULTS.md). Testerna skiljer på syntetiskt helflöde med simulerade externa system, exekverad befintlig publicerare mot simulerad Supabase och verkliga Drive-adapteroperationer med isolerade syntetiska filer. Inget av detta utges för ett nytt produktionsexamensprov.
