# BENGALI — verifiering och befintliga fel

2026-10-21 UTC. Main-bas: `64346c8f3ac0f6b9f02ad0684a0a1ec403008f22`. Node `v24.19.0`, npm `11.9.0`, Vitest `4.1.0`, Vite `8.0.0`. Basens tester kördes före implementation. [Maskinläsbara jämförelsebevis och exakta testnamn](operation-bengali-test-evidence.json).

## Nya tester

`tests/battle-art-contracts.test.js`, `tests/battle-art-resolver.test.js`, `tests/battle-art-delivery.test.js`: **144/144 godkända**.

Testerna exekverar de verkliga klassiska modulerna i isolerad VM med syntetiska manifest. Ägaradaptrar omfattar rollperson, kampanj-SLP, permanent SLP, fiende, monster och null-source quick enemy. Utrustningsfallen omfattar båda händerna, sköld, tvåhandsfattning, dubbla lika vapen, specialföremål, okänt/naturvapen, obeväpnat, båge utan ammunition, kastat/tappat/brutet och byte av aktuell utrustning. Integrationsfallen använder befintliga `combatAttackProfile` och `combatNpcNormalizeProfile` från runtime med isolerade registerfixturer.

Resolvern provas mot samtliga fem prioriteter, aktör/version/åtkomstkontext, Mounted/standing och mountprofil, sex riktningar, explicit riktningsfallback, deterministiska ties, godkända visuella alias, fel sköldhand och fel utrustning. Fem fotavtrycksformer × sex riktningar kräver kalibrerade layouter och bevarar befintlig geometri. Saknade/felaktiga referenser, draft/experimentella bilder och laddningsfel får säkra fallbacks. Laddningssessionen provar sena bildsvar, omedelbar neutral reserv och kampanjbyte/logout. Frysta input kontrollerar att projektion/resolver inte muterar regel- eller bilddata.

HERMES metadataadapter provas som draft med oförändrad källmetadata. `python -m unittest discover -s tests -p test_hermes4_batch.py`: **16/16 godkända**, syntetisk extern åtkomst. Inga verkliga Inbox-bilder används.

## Full testsvit: basfel jämfört med regressioner

Kommando: `npm test -- --reporter=json --outputFile=<temporär rapport>`.

| Mätning | Före ändring | Efter BENGALI |
|---|---:|---:|
| Godkända testfall | 1 285 | 1 429 |
| Fallerande testfall | 29 | 29 |
| Testfall totalt | 1 314 | 1 458 |
| Testfiler | 206 | 209 |
| Fallerande testfiler | 17 | 17 |
| Nya regressioner | – | **0** |

Jämförelsen använder `(fil, fullständigt testnamn)`. Exakt samma 29 basfel finns efter ändringen. Inga befintliga tester eller spelregler har ändrats för att dölja dem.

| Befintlig testfil | Antal fel | Felbild på oförändrad bas |
|---|---:|---|
| arcane-carousel-v01 | 1 | Föråldrad modul-/cacheversionssträng. |
| architecture | 2 | Gammal runtime-version och CSS-sträng för Värdshus. |
| character-equipment-image-overrides | 1 | Strängantagande om bildoverride. |
| character-round-backgrounds | 1 | Strängantagande om skapande av state. |
| combat-active-turn-highlight | 1 | Fixturen saknar `combatChosenAction`. |
| combat-ammunition-master | 1 | Gammal text för avsluta-knapp. |
| combat-dice-proportions | 1 | Föråldrad versionssträng. |
| combat-finish-summary | 1 | Sökning efter dynamisk knapp i statisk HTML. |
| combat-map-portrait-hex | 5 | Fyra saknade `combatMiniatureVisual` i fixtur och ett gammalt porträttanrop. |
| combat-order-portraits | 6 | Fem VM-fixturer saknar `window`; en gammal registerfrågesträng. |
| combat-parry-drawer | 1 | Fixturen saknar `combatMovementPlanningActor`. |
| combat-perfect-armor | 3 | Fixturer saknar `combatHideMagicResultPopup`. |
| goose08-arcane-mechanics | 1 | Föråldrad library-version. |
| material-live-preview | 1 | Gammalt strängantagande om preview. |
| material-native-pages-bootstrap | 1 | Gammal modul-/versionssträng. |
| section-help-ui | 1 | Sträng-/ordningsantagande. |
| skill-art-android-picker | 1 | Föråldrad CSS-version. |

## Build och begränsningar

`npm run build` kördes på grenen och stannade med **exit 139, Segmentation fault**, efter att Vite transformerat 96 moduler. Samma kommando kördes med exakt basversion av `index.html`; nya skript var då inte refererade. Det gav också **exit 139** på samma stadium. Grenens `index.html` återställdes i `finally`.

Detta är en ny jämförelsekörning, inte en hänvisning till MOZAMBIQUE:s historiska resultat. Bygget är fortfarande inte godkänt. Vite rapporterar även sina vanliga varningar om klassiska skript; de kopieras av repositoryts befintliga `copyStaticTree('features')`. De nya filerna ändrar inte skriptmodellen.

Git fetch/push i skalet kunde inte ansluta till miljöns proxy på port 8080. Main verifierades därför genom GitHub Compare; PR levereras via ansluten GitHub-API. Nätverkspolicyn ändrades inte.

Ingen ny browser-/visuell verifiering utförs för denna kontraktsleverans. Inga renderhooks eller UI-vyer införs. Inga liveprov av Supabase, RLS, signerade URL:er, utrustningsbyte mellan verkliga klienter, Mounted-rörelse eller HERMES-publicering ingår. Dessa kvarstår uttryckligt i [integrationsplanen](operation-bengali-battle-art.md).

Ändrad aktiv DB-/bildreferens: **ingen**. Inga nya bildbytes, arkivkopior, köfiler, migreringar, merges eller produktionspubliceringar ingår.
