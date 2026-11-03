# SKYLLA från Android

Öppna [SKYLLA Mobile Operations](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/workflows/skylla-mobile.yml) i Chrome och logga in på GitHub. Välj **Desktopwebbplats** om Run workflow eller Review deployments inte visas i mobilläget. GitHub-appens visning kan variera; webbläsaren är reservvägen.

Workflow-knappen blir tillgänglig när denna PR har mergats till `main`. Ingen produktionsradering är aktiverad i denna leverans.

1. Tryck **Run workflow**, välj `main`, `dry-run` och `SKYLLA-BATCH-001`. Kontrollera hela manifestets SHA-256 mot [batchplanen](../fast-lane-2/SKYLLA_BATCH_001.json): `638c68cc4e4e2b6e01d986abef009bfac22499ef7a95746146cfdfdf038da090`. Batchen omfattar **100 objekt / 333 077 975 byte**.
2. Öppna körningen. **Summary** visar identitet, antal, förväntad besparing och eventuella behörighetshinder. Dry-run kräver inget raderingsgodkännande och kan inte radera.
3. När produktion har aktiverats genom en separat granskad ändring: välj `execute`. Läs först preflight-sammanfattningen och manifestet. Tryck därefter **Review deployments → skylla-production → Approve and deploy**. Detta är det enda ägargodkännandet för en normal batchkörning.
4. Lägg undan telefonen. Återkom till samma körning för resultatet. Artefakten `skylla-result-1` innehåller `journal/REPORT.json` och `journal/events.jsonl`. Kontrollera borttagna objekt, överhoppade objekt och verifierat frigjorda objektbyte. Supabases kvotvisning kan uppdateras senare.

## Engångsinställningar före produktion

I repositoryts **Settings → Environments** ska `skylla-production` ha projektägaren som **Required reviewer**, **Prevent self-review avstängt** (ägaren startar själv körningen), admin-bypass avstängt och endast `main` som tillåten deployment-branch. Funktionen kontrollerar ägargrinden och att ägaren faktiskt godkänt körningen. Saknad eller oläsbar konfiguration blockerar.

Google-identiteten `hermes-transfer@alea-hermes.iam.gserviceaccount.com` behöver läsåtkomst till arkivmapparna. WIF måste tillåta denna workflow på `main`, även dess environment-jobb. Ingen Supabase-nyckel ska läggas i GitHub. Den granskade Edge Function-versionen behöver aktiveras separat; aktuell version har `execution_enabled: false`.

## Avbrott

Starta en ny körning för samma manifest och fyll i tidigare **resume_run_id** samt **resume_attempt** (normalt `1`). Ny körning får en ny kortlivad behörighet. Journalen kontrolleras mot manifestet; tidigare raderingsförsök stäms av genom läsning innan en ny radering övervägs. Återskapade objekt hoppas över.

Välj **Re-run all jobs** vid en omkörning, inte enbart ett gammalt produktionsjobb: godkännandebiljetten är bunden till försöksnumret. En ny produktionskörning kräver ny environment-review. Förlorad/utgången artefakt eller hårt runner-avbrott kräver separat avstämning; uppge inte frigjorda byte utan bevis. Artefakter sparas i sju dagar.

Inga Codex-terminalgodkännanden behövs under Actions-körningen. Lämna aldrig token, signerade länkar eller nycklar i telefonchatten.
