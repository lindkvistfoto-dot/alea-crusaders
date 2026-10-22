# OPERATION BENGALI — Battle Pose-kontrakt v1

2026-10-21 · ARCANE PAPER DOLL / DANIEL-LYX, fas 2.

Underlag: hela [MOZAMBIQUE, PR #137](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/137), inklusive appendix, på verifierad main `64346c8f3ac0f6b9f02ad0684a0a1ec403008f22`. PR:n var öppen och innehöll endast dokumentation. GitHub Compare bekräftade samma main vid arbetets start. [Verifiering och befintliga fel](operation-bengali-validation.md) redovisas separat.

## Levererat och aktiveringsgräns

`globalThis.AleaBattleArt` följer appens klassiska skriptmodell. `index.html` läser contracts → owners → loadout → resolver → delivery → hermes före combat runtime. Filerna installerar endast rena hjälpfunktioner och ett explicit anropbart laddningsgränssnitt. De installerar inga DOM-, regel-, pollnings- eller renderhooks.

`DEFAULT_FLAGS = {battlePoses:false}`. `resolveBattleArt` och `createDeliverySession` kräver uttryckligt `{battlePoses:true}`; annars returneras `disabled` och ingen bild hämtas. Det finns ingen URL-parameter, sparad inställning eller produktionsaktivering för denna flagga. De rena kontrakts-/registerfunktionerna är tillgängliga för test och kommande Manager även när presentationen är avstängd.

Stridsrendering, Astrid-pilot, utrustningsregler, geometri, initiativ och handlingsekonomi använder fortsatt sina befintliga funktioner. Inga original, aktiva bildreferenser, DB-fält, policies, HERMES-profiler eller köfiler ändras. De tre experimentella Astrid-bilderna i Inbox läses eller aktiveras inte.

## Datamodell och register

Den maskinläsbara typmodellen finns i [contracts.d.ts](../../features/battle-art/contracts.d.ts); körbara kontroller finns i [contracts.js](../../features/battle-art/contracts.js). Kontraktet är version 1. Det är en klientmodell inför den separata schemafasen, ingen migration.

| Del | Identitet och innehåll |
|---|---|
| Ägare | Exakt ett UUID-fält: `characterId`, `campaignNpcId`, `campaignMonsterId`, `globalNpcId` eller `combatantId`. |
| Manifest | `setId`, `versionId`, monoton `revision`, `status=active`, ägare, kampanj, synlig stridsinstans och åtkomstkontext. En aktiv immutable version per levererat manifest. |
| Slot | Eget UUID, `kind=battle_pose|cutout`, `role=specific|general`, `posture`, `view`, valfri exakt `facing`, deklarerade riktningar, utrustningsvillkor och asset-ID. |
| Asset | Immutable bucket/path, HERMES-fälten `app_sha256`, `app_bytes`, `width`, `height`, `alpha_preserved`; verifieringsstatus och kalibrerade layouter. Endast aktiva verifierade referenser väljs. |
| Layout | Versionsbunden profil, form, facing, pixelankare, markbredd i pixlar/hex och enhetlig skala. Flerhex kräver en kalibrering för aktuell facing. |
| Systemkonst | `arcane-paper-doll-hexagon-base` och `arcane-portrait-stand`, vardera som en verifierad assetreferens. |

`readOwner(type, record)` accepterar en hydrerad rollpersons `_dbId` eller en DB-rads `id` + `data`. Lokala rollpersons-ID:n och namn används aldrig som globala poseägare. Fiende och monster använder samma `campaignMonsterId`; `actorKind` behåller kategorin. `readCombatantOwner` skiljer på master och stridsinstans, avvisar känd kampanjkonflikt och hanterar `quick_enemy` med null-källa som uttrycklig instansägare.

Kampanj-SLP med `source_global_npc_id` behåller kampanjägaren. Referensen är proveniens, inget automatiskt globalt arv. En framtida kopiering måste pinna en publicerad global version i ett kampanjägt set; den får inte ändra originalet. En framtida instansöverstyrning levereras uttryckligt med `combatantId` som ägare. Ingen sådan överstyrning aktiveras av BENGALI.

`readWeaponRegister(ruleWeapons)` läser aktuella UUID:n, namn, `category`, `handling`, STY-grupp och färdighetsreferens. Antalet vapen hårdkodas inte. Färdighet, namn, `weapon_type=L|T` och bred kategori är aldrig tillräcklig bildmatchning.

## Utrustningsläsning

`readCombatantLoadout(combatant, adapters)` anropar injicerad `combatAttackProfile` en gång och återanvänder `combatNpcNormalizeProfile` vid behov. Rollpersonens aktuella inlästa data och NPC-/monsterinstansens `state.attack_profile` behåller exakt den prioritet striden redan använder. Stridsstate läses separat för brutet/tappat vapen. Inga grepp uppdateras och inga föremål sparas eller repareras.

`readRegistryLoadout(type, record, adapters)` är för Manager-förhandsvisning från rollperson, kampanj-SLP, fiende, monster eller permanent SLP. Den anpassar masterfältet `shield` till samma normaliserare. Den ska inte ersätta stridsadaptern i en pågående strid.

`readBattleLoadout(profile, combatState, {ruleWeapons})` producerar en ny läsmodell:

- Anatomisk `rightHand`/`leftHand`, vardera `empty|weapon|shield|equipment|unknown`.
- Vapeninstans, register-UUID, befintlig vapenkategori och faktisk `one_hand|two_hands` från handreferensen.
- Ett verkligt tvåhandsvapen dedupliceras. Två instanser med samma master förblir två vapen. Inkonsekventa handreferenser ger okänd utrustning.
- Sköld behåller hand och master-ID; specialföremål utan master kräver exakt instansvillkor.
- Saknade referenser, oidentifierade naturvapen och ospecificerade händer blir `unknown`, aldrig automatiskt obeväpnat. Äldre NPC-standard rapporteras genom `assumedLegacyHands`.
- Ett tappat vapen tas bort från projektionen. Ett brutet vapen ger okänd visuell utrustning, eftersom det kan finnas kvar i handen. Ett slutkastat föremål följer stridens typade stock. Oidentifierad legacy-stock ger säker okänd status. Tom ammunition tar inte bort en hållen båge.
- Attackvalet ”Obeväpnad”, ambidextri, FV, GL och STY används inte för att skriva om synlig utrustning. Laglig GL ½ och befintlig 1–2H-fattning behålls.

`signature` används för visuell kompatibilitet. Requestnyckeln innehåller även båda händernas instans-ID:n så unika instansbilder inte återanvänds efter byte.

## Riktningar och flerhex

Managerplatserna är `battle-front`, `battle-right`, `battle-left`, `mounted-front`, `mounted-right`, `mounted-left`. De motsvarar två posturefamiljer × tre vyer; själva slot-UUID:t skiljer utrustningsvarianterna åt.

| Facing | Axial vektor | Skärm | Föreslagen vy |
|---:|---|---|---|
| 0 | (1,0) | Höger | Right |
| 1 | (0,1) | Nedåt höger | Right |
| 2 | (-1,1) | Nedåt vänster | Left |
| 3 | (-1,0) | Vänster | Left |
| 4 | (0,-1) | Uppåt vänster | Left, approximation |
| 5 | (1,-1) | Uppåt höger | Right, approximation |

Tabellen är MOZAMBIQUE:s föreslagna bildkonvention, inte ett nytt geometribeslut. `DIRECTIONS` delas av preview och tester. Saknad facing väljer Front. Heltalsvärden normaliseras mod 6 som befintlig geometri; saknat/ogiltigt värde blir null för bildval.

`supportedFacings` anger bildens deklarerade riktningar; `fallbackFacings` måste uttryckligen tillåta approximation för andra riktningar. Valfri `slot.facing` anger en exakt bild. Bakvyer 4/5 utan exakt bild får nivå 2. Resultatets `directionApproximate` gör att kommande renderer kan behålla separat riktningspil. Varken rasterrotation eller spegling används.

`single`, `line2`, `triangle3`, `line3`, `giant7` stöds som layoutnycklar. Saknad flerhexkalibrering ger kompakt porträtt/stand eller neutral markör. Resolvern beräknar eller ändrar aldrig fotavtryck, q/r, kollision eller rotation.

## Deterministisk resolver

`resolveBattleArt(request, flags)` kontrollerar först manifestversion, ägare, stridsinstans, kampanj, åtkomstkontext och synlighet. Därefter filtreras slots på aktiv/verifierad status, granskad utrustning, posture, monteringsprofil, bildreferens, alfa och layout.

1. Exakt kompatibel Battle Pose med rätt vy/exakt facing.
2. Närmaste kompatibla Battle Pose med deklarerad riktningsfallback eller granskad explicit vapenaliaslista.
3. Generell Battle Pose med kompatibla villkor eller granskat `equipmentNeutral`.
4. Kompatibel cutout med samma säkerhetskontroller.
5. Granskat utrustningsneutralt porträtt med stand och bas; annars initialer i stand. Saknad systemkonst ger neutral geometrisk markör.

Rangordning inom nivå är exakt facing, önskad vy, exakt utrustning före godkänd alias, minsta cirkulära avvikelse och stabilt slot-UUID. Manifestet har en aktiv version, så äldre/draft-versioner deltar inte i en tie. Olika bildstorlek, registerordning eller namn påverkar inte valet.

Varje villkor anger båda händerna. `allowedMasterIds` är en uttryckligt granskad visuell aliaslista för just den handen; det ersätter inte kategori, fattning eller sköldvillkor. Villkor kan precisera `instanceId` för unikt utseende. `equipmentNeutral` kräver `reviewed=true` och går alltid till generell nivå. Okända äldre cutouts och combat icons importeras inte automatiskt.

Resultatet innehåller assetreferens, tier, orsak, versionsnyckel, ankare/skala och `mirror=false`. `baseMode=embedded|shared` och `shadowMode=baked|shared` hindrar dubbla baser/skuggor. Delad bas måste vara tillgänglig och returneras separat. Inga URL:er skapas i resolverfunktionen.

## Laddning och livscykel

`createDeliverySession({flags, loadAsset, onChange})` är en isolerad preview-/leveransadapter. Den utför ingen nätverksåtkomst utan injicerad laddare och explicit flagga. `select(request)` publicerar en neutral markör synkront innan någon bild laddas. Tidigare utrustning behålls därför aldrig i väntan på en ny URL.

`loadAsset(ref)` ska kontrollera åtkomst med appens befintliga Storage-väg, skapa URL vid behov, hämta bilden och verifiera avkodning innan den returnerar en HTTPS-URL. Ogiltig URL eller reject markerar asseten som otillgänglig och kör nästa resolversteg. Alla fel leder slutligen till markör; samma asset försöks inte oändligt. Den här adaptern signerar, hämtar eller förnyar inga URL:er själv.

Varje `select` får ett generationsnummer. Sena svar för tidigare utrustning ignoreras även om nyckeln råkar vara lika. `clear()` invalidierar väntande svar och ska användas vid kampanjbyte, logout och stängd preview. Requestnyckeln inkluderar ägare, instans, åtkomstkontext, händer, bildrevision, facing, fotavtryck, Mounted-profil, riddjurs-ID och relationsrevision. Ingen beständig cache införs i fas 2.

Exempel för nästa integrationsfas, efter att runtime och legacy har lästs:

```js
const art = globalThis.AleaBattleArt;
const owner = art.readCombatantOwner(combatant, {
  characters: chars, npcs: campaignNpcs, monsters: campaignMonsters
});
const loadout = art.readCombatantLoadout(combatant, {
  attackProfile: combatAttackProfile,
  normalizeNpc: combatNpcNormalizeProfile,
  ruleWeapons
});
// manifest ska komma från en separat, behörighetskontrollerad läsväg.
const result = art.resolveBattleArt({
  owner: owner.owner, combatantId: combatant.id,
  campaignId: owner.campaignId, visible: true, accessKey,
  loadout, manifest, posture: 'standing', shape: 'single', facing: null
}, art.DEFAULT_FLAGS); // disabled tills den separata aktiveringen beslutas
```

Exemplet är inget installerat renderflöde. Anroparen måste först hantera null-ägare och verifiera att aktören är synlig. `accessKey` är en cache-/kontextnyckel, ingen credential eller ersättning för serverauktorisering. Klienten får inte konstruera ett eget manifest för att kringgå åtkomstkontroll.

## HERMES och Supabase

[hermes.js](../../features/battle-art/hermes.js) återanvänder metadatafält från befintlig `prepare_bytes`, metadata-`schema=1`, som HERMES 4.0-batchen redan använder. `readHermesCandidate(metadata, binding)` kopierar bara derivatfält till en **draft, verified=false**-kandidat. `app_file` är ett lokalt derivatnamn, inte en URL eller Storage-aktivering. Exakt asset-ID, destination och layout tillhandahålls separat. Drive-ID, originalhash och arkivproveniens lämnas utanför klientmanifestet.

HERMES 4.0:s kö-`schema=4`, publicerarens tillåtna kinds, målpekare och CAS-flöde ändras inte. En draftkandidat kan inte väljas av resolver. Även syntetiskt korrekt derivat kräver senare betrodd verifiering och explicit publicerad setversion innan det kan levereras som aktivt.

Nya versionerade WebP-referenser förbereds för `campaign-actor-images`; systemkonst kan använda `alea-hermes-public`. `combat-icons` och originalbucket används inte för nya poser. Inga URL- eller databas-SDK-antaganden läggs till. Den framtida schemaläsaren måste översätta snake_case/FK-fälten till detta leveranskontrakt och filtrera hemlig masterdata.

## Kvarstående beroenden och DJUNGELPATRULLEN

DJUNGELPATRULLEN kan bygga den gemensamma Battle Pose Manager-popupen direkt mot `readOwner`, `readRegistryLoadout`, `readWeaponRegister`, `resolveBattleArt` och syntetiska manifest. Använd samma popup för rollperson, kampanj-SLP, fiende, monster och permanent SLP. Visa tier/orsak, okänd utrustning, approximativa riktningar och draft/verified/active separat. Behåll två matrisrutor per registervapen och glesa specialkombinationer; lagliga handval ska komma från befintliga greppregler.

Följande kräver separata leveranser före aktiv kartintegration:

- DB-tabeller för set/version/slot/asset/systemkonst, typade FK, kampanjintegritet, immutable versioner och CAS-aktivering. Global kopia ska pinna version. RLS, grants, begränsat synlighetsmanifest och Storage-rättigheter ska verifieras med riktiga testroller.
- HERMES-kinds och icke-kvadratiska profiler, versions-/slotidentitet, arkivmål, metadata-/alfagranskning, Storage-återläsning och atomisk aktivering. Ingen lokal PNG-genväg eller riktig publiceringskö i Manager-PR:n.
- Faktiska verifierade systemderivat, basens bakgrundshinna, porträttöppning/mask och bildspecifika markankare. BENGALI verifierar ingen ny konst visuellt.
- En enda rendererintegration med befintliga hit-/tur-/djup-/överhängslager samt browserprov för mobil, zoom och klick. Astrid-piloten får inte automatiskt bli generell fallback.
- Lokala utrustningshooks, NPC-snabbredigering, versionssynk mellan klienter, skydd för osparad lokal data samt begränsad URL-förnyelse. Befintlig stridspollning täcker inte detta generellt.
- Mounted-domän: auktoritativ ryttar-/riddjursrelation, livscykel, samförflyttning, kollision och två mål. BENGALI kräver uttrycklig `mountProfile` + `mountCombatantId` för syntetiska Mounted-poser, kan begränsa slots till ett särskilt par och använder aldrig namnheuristik. Masker och sittpunkter måste vara versionsbundna i en senare kompositor. Produktions-Mounted är fortsatt avstängt.
- Godkänd byggbaslinje samt samlad regelisolering, behörighets-, prestanda- och visuell acceptans före separat bred aktivering.

Ingen automatisk merge eller produktionspublicering ingår i denna leverans.
