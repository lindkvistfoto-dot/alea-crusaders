# OPERATION ARTEMIS – MEDUSA-SHA

**Resultat: BLOCKERAD privat byteverifiering. KERBEROS får fortsätta med icke-destruktiv planering och verifiering, men inte rensning eller raderingsgodkännande.**

Kontrolldatum: 2026-10-20 UTC. Körningens exakta tid, metoder och indatahashar finns i [JSON-manifestet](MEDUSA_SHA_VERIFICATION.json). Befintlig checkout användes; ingen extra worktree skapades.

## Faktiskt uppnådd verifiering

| Kontroll | Resultat |
|---|---:|
| Privata Supabase-original lästa som kompletta filbytes | **0 av 519** |
| Kvarstående ej byteverifierade Supabase-original | **519** |
| Fullständigt bevisade matchningar Drive + GitHub + aktuell Supabase-fil | **0** |
| Aktuella Storage-metadata och jobbidentiteter avstämda mot MEDUSA | 519; 0 avvikelser |
| Historiska HERMES-hashar och storlekar med verifierad Drive-kandidat | 518 |
| Registrerade källidentiteter med lokalt byteverifierad Git-motpart | 519 |
| Nuvarande GitHub-originalposter byteverifierade | 547: 546 PNG + 1 ZIP |
| Dessa med exakt hash och storlek i MEDUSAs verifierade Drive-underlag | 544: 543 PNG + 1 ZIP |
| Nuvarande GitHub-original utan exakt Drive-motpart i underlaget | 3 PNG |
| Historiska originalversioner | 564 unika Git-blobbar över 544 commits / 585 path-händelser |
| Äldre originalinnehåll utanför nuvarande originalmapp | 18; alla korrupta/trunkerade |
| Övriga inventerade Git-bildposter | 204; 183 godkända, 21 korrupta/trunkerade |
| Unika korrupta Git-innehåll, utan dubbelräkning av karantän/historik | 21: ovanstående 18 + 3 andra PNG |
| Git-blobbar som inte gick att läsa fullständigt | 0 |
| Unika Git-blobbar faktiskt lästa i denna körning | 748 |
| Avvikande innehållshash mot MEDUSA för lästa Git-poster | 0 |
| Filer godkända för radering | **0** |

Antalet korrupta eller saknade **Supabase-filer är okänt**, inte noll. Metadata visar att 519 objekt finns, men bevisar inte att deras innehåll är komplett. Ingen fil betecknas som en annan giltig Supabase-version utan lästa bytes.

Drive-originalens SHA-256 och avkodningsresultat är uttryckligen **ärvda från Works MEDUSA**, inte nya nedladdningar av bilder i denna körning. Matchningen 544 gäller nya lokala Git-bytehashar mot den evidensen. Ingen tresystemsmatchning är bevisad.

## Underlag och baslinje

Alla efterfrågade underlag hittades och hämtades komplett från [Drive/MEDUSA](https://drive.google.com/drive/folders/1x49xC5Ueb_Nz_0kJkXiTYNiMLHj5x8aj): mastermanifest, inventeringsrapport, undantag, KERBEROS- och HYDRA-handoff. Även Works tekniska Codex-uppgift lästes. Fil-ID, storlek och lokalt beräknad SHA-256 för varje underlag finns i [indataregistret](evidence/MEDUSA_SHA_INPUTS.json). Inget efterfrågat manifest saknas.

Lästa repo-underlag: `AGENTS.md`, `docs/ARTEMIS-CHIMAIRA.md`, `config/hermes-drive-folders.json`, `docs/HERMES.md`, `config/hermes-profiles.json`, relevanta HERMES-intags-, verifierings-, optimerings- och publiceringsskript samt tester och workflow-triggers.

[Issue #114 inklusive kommentarer](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/114) granskades. Öppna PR:er kontrollerades; relevanta var [#113](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/113) (HERMES-checkout/batcher), [#118](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/118) (MEDUSA-underlag) och [#45](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/45) (HERMES 3). De integrerades inte.

Före ändringar verifierades remote `main` genom `git ls-remote` och GitHub-connectorns branch-läsning:

- Commit: `c63d3f5f57141e1cce6ce7f5ad0dccd21a6593b5`.
- Tree: `aaebe12b72df281c9bb77d0c0d767f2b55b978e2`.
- Samma baslinje som mastermanifestet och checkouten. Separat arbetsbranch: `artemis/medusa-sha-verification-20261020`.

Mastermanifestets vissa övergripande beskrivningar är inaktuella, exempelvis text om att GitHub-rawåtkomst saknades och ett äldre PNG-avkodningsräkneverk. Här används dess explicita filrader och nya lokala bytekontroller; sammanfattningsflaggor upphöjs inte till bevis.

## Åtkomsthinder och exakt nödvändig åtkomst

Supabase-projekt: `wbmosmkirsitkonejzpg`. Bucket: `alea-hermes-source`, verifierat privat. SQL-connectorn kunde göra läsande SELECT och gav 519 objekt. En fullständig, begränsad metadataavläsning av objektsökvägar, storlekar och motsvarande HERMES-jobb finns i [metadataögonblicksbilden](evidence/SUPABASE_SOURCE_METADATA.json), med observationstid.

Miljöns konfiguration redovisade inga Supabase-hemligheter eller autentiseringsidentiteter. Inga relevanta lokala Supabase-/Google-tokenvariabler eller `.env`-filer hittades. En GitHub-tokenvariabel finns, men den ger ingen Supabase Storage-behörighet. Repo-instruktionerna beskriver en publiceringsnyckel i GitHub Actions; den hämtades inte och publiceraren kördes inte. Google WIF för HERMES är bunden till Actions på `main` och används inte av detta verktyg.

Det minsta privata originalet enligt Storage-metadata valdes som prov:

```text
spell-cutout/energistrale/8b5e1859edbbd8fff7ae5e8e68c38a1426a12e1853bc962978a56c1ef837ba3f.png
Förväntad storlek enligt metadata: 1 288 952 bytes
GET /storage/v1/object/authenticated/alea-hermes-source/<sökväg>
HTTP 400 InvalidRequest
headers must have required property 'authorization'
Lästa bildbytes: 0
```

Provet nådde Storage, men var **inte en autentiserad lyckad filhämtning**, eftersom autentiseringsmaterial saknas. Den anslutna Supabase-verktygsytan erbjuder ingen Storage-nedladdning eller signerad fil-URL. Efter detta stoppades det privata delmomentet. Inga återkommande försök eller kringgående gjordes.

För att slutföra krävs en säkert injicerad, giltig autentisering med **läsbehörighet till samtliga 519 objektsökvägar i just denna bucket**, helst en tidsbegränsad identitet med endast Storage SELECT. API-nyckel för projektåtkomst och användar-/tjänsteidentitet med motsvarande läsrättigheter måste kunna användas av en binär strömmande klient. Alternativt behövs kortlivade signerade läslänkar för exakt dessa objekt. Hemligheter ska tillföras via miljöns hemlighetshantering, inte chatt eller manifest. En bred skrivande service-role-nyckel är inte ett krav. Ingen policyändring ingår i uppdraget.

GitHub CLI:s API-anrop blockerades av miljöns nätverkspolicy (`Forbidden`). GitHub-connectorn och tillåten Git-transport fungerade för baslinje/review. Git-byteverifieringen använde den kompletta befintliga checkouten, utan att behöva API-nedladdning av bilder. Inga tokens eller signerade nedladdningslänkar har sparats i rapporterna.

## Metod, status och spårbarhet

Det nya [offlineverktyget](../../scripts/medusa_sha_verify.py) har ingen nätverks-/Storage-klient och startar inga arbetsflöden. Git-läsning sker med `GIT_NO_LAZY_FETCH=1` och utan valfria Git-lås. Det kontrollerar path → blob-bindning, läser hela `git cat-file blob`-innehållet och räknar om Git-objektets identitet samt separat SHA-256 över filbytes. Repositoryformatet är **SHA-1**. Även för SHA-256-Git skulle blobidentiteten inkludera Git-headern och skilja sig från filens SHA-256.

PNG-kontrollen kräver fullständiga chunks, CRC och terminal IEND, därefter Pillow `verify` och full `load`. Dimensioner och färgläge registreras. ZIP kontrolleras med `testzip`; de 29 inbäddade bilderna bytehashas och avkodas. Ingen permissiv läsning av trunkerade bilder tillåts. Ingen bild omkodas.

[CSV-manifestet](MEDUSA_SHA_VERIFICATION.csv) innehåller exakt en rad per privat objekt, 519 totalt. [JSON-manifestet](MEDUSA_SHA_VERIFICATION.json) har samma rader samt separat fullständig Git-evidens, sammanfattning och framtida kandidater. Ej lästa privata `supabase_content_sha256` och `source_bytes` är tomma/null. Storage-metadata och registrerade jobbstorlekar ligger i separat namngivna fält. Drive-hashens proveniens anges uttryckligen. Filnamn, storlek och historiska jobbhashar används aldrig ensamma som bevis för nuvarande Storage-innehåll.

Statusmodellen skiljer `verified_identical_copy`, `different_valid_version`, `corrupt_original`, `missing_counterpart` och `not_verified`. Alla privata objektrader har `not_verified`; en saknad verifierad Drive-motpart dokumenteras separat och förväxlas inte med en försvunnen Storage-fil.

Git-historiken kontrollerades över hela baslinjens historik för `assets/hermes/originals/`. Alla 204 övriga bildpaths i MEDUSA, inklusive `hermes/quarantine/`, kontrollerades. Inga ytterligare PNG/WebP/JPEG/GIF/karantänpaths finns på baslinjen utanför den inventeringen. Historiska original utanför MEDUSAs historikscope är inte uttömmande inventerade.

## Kvarstående filer och dubbletter

Tre byteverifierade, giltiga GitHub-original saknar exakt Drive-hash i MEDUSA. Bevara dem tills originalet återfunnits eller ett separat arkivbeslut med verifierad kopia finns:

```text
assets/hermes/originals/spell-illustration-wide/frost/2e3b2dc2470e8ff236f4fa0edc82006e8349ca61d6a33c14676b3f1c4150a155.png
assets/hermes/originals/spell-illustration-wide/regnstopp/6a4bac80ca62f06f839052944b33c9b9e4820773a106bfc2bb93c1b38934903e.png
assets/hermes/originals/spell-illustration-wide/stenvagg/4ddda2c69a55e2ba1898f19f934576574f047f93d10099598dd254307904807f.png
```

Den aktiva registrerade Osäkerhet-källan saknar också exakt Drive-motpart:

```text
Storage: symbol/osakerhet/321f72bf5aba7a810ee3573c7d863a7a7f18655092aa46457eb11ce7af7c8e24.png
GitHub: assets/spells/arcane-ivory/osakerhet.png
Git-blob: 94ba4ab58d3fb0b07d224f9e7c804ad327ee9cf1
Git-innehåll SHA-256: 321f72bf5aba7a810ee3573c7d863a7a7f18655092aa46457eb11ce7af7c8e24
Git-innehåll: 2 730 159 bytes; giltig PNG 1254×1254 RGBA
```

Detta visar en återfunnen Git-källa med rätt registrerad identitet, **inte** en aktuell Supabase-/Drive-matchning. Den är alltså inte belagd som Supabase-only. Inga filer kopierades till arkiv och ingen aktiv referens ändrades.

MEDUSA har sex byteverifierade Drive-dubblettgrupper med sex extra kopior, 16 402 877 bytes. Gruppernas exakta fil-ID:n och hashvärden återges i kandidatlistan med ärvd proveniens. GitHub-originalen `hoppa` och `klattra` delar samma verifierade innehåll och Git-blob. De 18 historiska korrupta blobbarna och deras karantänpaths är samma innehåll, inte 36 korrupta original.

MEDUSAs två publika WebP-filer utan direkt träff i undersökta spell-/skill-/symbolfält har kvar sina aktiva jobb. Ingen bredare beroendeutredning eller ny orphan-klassificering görs här. De ingår inte i en rensningsrekommendation.

## Separat lista för möjlig framtida rensning

[MEDUSA_SHA_CLEANUP_CANDIDATES.csv](MEDUSA_SHA_CLEANUP_CANDIDATES.csv) listar exakt:

- 518 privata Storage-sökvägar som historiska utredningskandidater; deras aktuella innehåll är fortfarande ej verifierat.
- 544 nuvarande GitHub-originalpaths med lokal bytehash som matchar MEDUSAs verifierade Drive-hash och storlek.
- 6 Drive-dubblettgrupper, utan att välja vilken kopia som ska behållas eller tas bort.

Varje post har `safe_to_delete=false`. Listan omfattar 1 062 system-/path-poster och sex dubblettgrupper, inte 1 068 unika original. De tre GitHub-originalen utan Drive-match, Osäkerhet och korrupta historik-/karantänartefakter ska bevaras och är inte rensningskandidater här. Att ta bort en fil ur en framtida Git-snapshot frigör inte dess historiska Git-blobutrymme. Verifierat frigörbart utrymme och godkänd rensning är **0 bytes**.

## KERBEROS-grindar

Icke-destruktiv arkivplanering och återstående verifiering kan börja. Rensning eller raderingsgodkännande blockeras tills följande är bevisat:

1. Autentiserad komplett binärhämtning, byteantal, SHA-256 och full avkodning för alla 519 privata objekt; klassificering av varje faktisk avvikelse.
2. Exakt originalidentitet och arkivbeslut för tre GitHub-only-i-Drive-underlaget-original samt Osäkerhet-källan.
3. Permanent arkivkopia med oföränderligt manifest och separat hashad readback. Drive Inbox är inte permanentarkiv.
4. Oberoende verifierad backup och lyckat återställningsprov. Backupmappen i samma konto är endast en platshållare.
5. Kontroll av aktiva app-, DB-, jobb-, rollback- och workflow-beroenden, inklusive äldre paths och möjliga triggerbiverkningar; därefter separat granskad åtgärdsplan.

Ingen avsaknad av enkel direktreferens och ingen hashmatchning ersätter dessa grindar.

## Tester och reproduktion

- 15 nya Python-tester godkända: små syntetiska PNG, CRC-fel, avklippta data/IEND, annan giltig hash/storlek, saknad Git-blob, saknat metadataunderlag, falsk Drive-matchning samt SHA-1-/SHA-256-Git.
- Ett helt syntetiskt Git-/manifestprov kör verifieraren med nätverkssocket blockerad, kontrollerar att Storage förblir ej verifierat och att original, Git-HEAD och index inte ändras. Endast begärda rapportfiler skapas. Verktyget saknar Storage-skrivfunktioner.
- 10 befintliga HERMES Python-tester godkända.
- 19 relevanta HERMES Vitest-tester i fyra filer godkända.
- Fullt app-testpaket/bygge krävs inte för denna isolerade verifieringskod; dessa kördes inte. Inga beroenden eller lockfiler ändrades.

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p test_medusa_sha_verify.py -v
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p 'test_hermes*.py' -v
./node_modules/.bin/vitest run tests/hermes-v2-gates.test.mjs tests/hermes-wide-publisher.test.mjs tests/hermes-spell-cutout-profile.test.js tests/hermes-queue-concurrency.test.js
PYTHONDONTWRITEBYTECODE=1 python scripts/medusa_sha_verify.py \
  --manifest /path/to/MEDUSA_MASTER_MANIFEST.json \
  --metadata docs/medusa-sha/evidence/SUPABASE_SOURCE_METADATA.json \
  --output /tmp/medusa-sha-review
```

Verktyget återger avsiktligt en blockerad Storage-status även vid omkörning: det implementerar ingen privat nedladdning och kan inte intyga aktuella Storage-bytes. En framtida autentiserad verifierare kräver separat granskning och tester.
