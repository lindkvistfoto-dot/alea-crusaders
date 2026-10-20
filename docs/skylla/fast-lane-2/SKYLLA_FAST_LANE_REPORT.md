# SKYLLA FAST LANE 2.0

Ett sammanhållet, återupptagbart kommando hanterar **1–100 exakt godkända original** med en gemensam kapabilitet under högst 60 minuter. Projektägaren godkänner manifestet en gång. Inga ytterligare original har raderats under denna leverans.

| Fråga | Resultat |
|---|---|
| Operatörsgodkännanden | Ett för hela manifestets SHA-256 och objektlista |
| Terminalgodkännanden | Inga extra observerade i nuvarande miljö; inga per fil. En striktare värdpolicy kan kräva ett nätverksgodkännande för hela körprocessen. |
| Kapacitet | Högst 100 objekt per fryst manifest |
| Nästa batch | 100 verifierade original, **333 077 975 byte**, redo för exakt batchgodkännande |
| Faktiska raderingar i denna leverans | **0** |
| Supabase efter testerna | Oförändrat: **514 original / 1 487 414 822 byte** |
| Tillfällig serveråtkomst | Avstängd med tom plan; faktiskt HTTP 503 verifierat |

[Det exakta manifestet](SKYLLA_BATCH_001.json) har SHA-256:

```text
638c68cc4e4e2b6e01d986abef009bfac22499ef7a95746146cfdfdf038da090
```

Hashen avser kanonisk JSON med sorterade nycklar och UTF-8, utan det självbeskrivande fältet `manifest_sha256`. Filens separata råbytehash finns också i godkännandeunderlaget.

[Godkännandeunderlaget](SKYLLA_BATCH_001_APPROVAL.json) har `owner_approved=false`. Ingen raderingskapabilitet har utfärdats. Urvalet prioriterar lagringsvinst bland redan arkiverade original med färdigpublicerade jobb och aktuella bildkopplingar. Misslyckade jobb, historiska referenser, symboloriginal utan arkivmappning och tidigare raderade pilotobjekt ingår inte.

## Vad varje batch kontrollerar

1. Exakt bucket/path, Storage-ID, version, ETag och storlek. SHA-256 måste vara beräknad från faktiska bytes och matcha Drive-originalet.
2. Permanent Drive-fil-ID, rätt arkivparent och aktuell oförändrad binär revision, bundna till en tidigare fullständig byte-/PNG-verifiering.
3. Inga aktiva source-beroenden: rätt färdigpublicerat HERMES-jobb, inga pågående jobb för samma mål, oförändrad förväntad apppekare och inga registrerade bildfält som pekar på source-objektet. Beroendena kontrolleras aktuellt av servern före varje DELETE.
4. Storage-API-resultat och autentiserad frånvaro efter varje radering. Unika borttagna objekt och byteantal summeras; okända utfall redovisas separat och räknas inte som bekräftade API-raderingar.

Inga testsviter, byggkommandon, publiceringsworkflows, Git-commits eller nya terminalprocesser startas av batchkommandot. Full WebP-hämtning och upprepad PNG-avkodning är inte obligatoriska per batch. Full avkodning återanvänds bara när den faktiska SHA-256-identiteten är identisk med tidigare fullständigt verifierade bytes. Metadata ensam ersätter aldrig ett bytebevis.

## Genomförda verifieringar

- **100/100** verkliga original SHA-256-kontrollerades i Supabase mot sina permanenta Drive-identiteter. Inga avvikelser, överhoppningar eller okända utfall.
- Samma manifest, privata kapabilitet och journal kördes om: **100/100 signerade bytekvitton återanvändes**, med kontroll av aktuella Storage-versioner och beroenden. Inga source-bytes behövde hämtas igen.
- De 100 Drive-filerna har var sin oförändrad binär revision som fanns vid den tidigare fullständiga readbacken. Revisions-ID, fil-ID, storlek och rätt parent kontrollerades genom Drive-anslutningen; native sökning använde `trashed=false`.
- Första läskörningen tog cirka **238 sekunder**, omkörningen cirka **182 sekunder** i denna miljö. Referenskontrollen utökades under slutet av omkörningen. Tiderna avser läs/verifiering; faktisk raderingsprestanda för 100 objekt har inte mätts.
- Produktionsförsök till `execute` med läskapabiliteten och ett objekt utanför manifestet nekades med **HTTP 403**, innan någon Storage-radering kunde ske.
- Alla 514 source-objekts inventarieposter, 185 registerposters bildfält och 519 HERMES-jobbs kontrollerade fält var identiska före/efter. **Exakt ändrade DB-referenser: inga.** Inga Drive-original ändrades och inga HERMES-publiceringar startades.

194 relevanta automatiserade tester passerar: 75 SKYLLA Python, 91 SKYLLA JavaScript och 28 KERBEROS. Av dessa är 56 nya batchtester. Tester täcker exakta godkännanden, 100/101-gränsen, ändrade versioner/revisioner, fel SHA, source-referenser, förfalskade kvitton, avbrott, delvis misslyckad batch, omkörning, återskapade objekt, samtidighetslås, trasig journalsvans, saknad auth och begränsad återhämtning vid nätfel. Produktionsentrypointen passerar Deno-kontroll. Aleas fullständiga testsvit körs inte av batchverktyget.

[Kvitton första körningen](evidence/SOURCE_READBACK_RECEIPTS.json), [omkörning](evidence/REUSE_AND_RESUME_REPORT.json), [oförändrad produktion](evidence/STATE_COMPARISON.json), [stängd endpoint](evidence/ENDPOINT_CLOSED.json), [tester](evidence/TEST_RESULTS.json), [tider](evidence/BENCHMARK.json).

## Återupptagning och kvarvarande steg

Intentionen fsync-journalförs före anropet och kvittot efteråt. Samma körkommando och journal återupptar batchen utan att kräva nytt ägargodkännande av samma manifest. Tidigare raderingsintentioner stäms först av mot aktuellt Storage-tillstånd. Redan saknade objekt raderas inte igen. Ett återskapat eller ändrat objekt hoppas över. Ett nätavbrott ger ingen blind DELETE-retry. Osäkra enskilda filer stoppar inte övriga; saknad gemensam auth eller tre överföringsfel i följd stoppar nya anrop och lämnar en återupptagbar rapport.

Nästa steg är **projektägarens godkännande av exakt manifestet ovan**, följt av färsk revisionsattestering och en tidsbegränsad driftsättning som Codex/behörig operatör utför med den befintliga anslutningen. En signerad byteverifiering kan återanvändas även efter förnyad kapabilitet om dess objektversion och Drive-revision är oförändrade. Manifestet ändras inte vid attestförnyelse. Token stannar privat utanför Git; bred Storage-nyckel stannar i Supabase.

[Operatörsinstruktion och ett körkommando](SKYLLA_BATCH_OPERATOR.md). Ett separat godkännande krävs för andra objekt eller ett ändrat manifest. NAS-undantaget gäller fortsatt endast `alea-hermes-source`; KERBEROS ordinarie policy är oförändrad. Ingen automatisk merge ingår. FAST LANE-PR:en bygger på den omergade PR #124 och riktas mot dess gren så att enbart denna leverans granskas.
