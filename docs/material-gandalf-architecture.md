# Gandalf — Materialarkitektur i Alea Crusaders (v0.34.77)

## Syfte och status

Gandalf etablerar kampanjisolerat register, kopplingar, synlighetsmodell och behörigheter inför projektet **Ringens brödraskap – Bildbibliotek och materialdelning**.

**Implementerat:** Postgres-schema + RLS + validering av objektkopplingar, utan förändringar av befintliga bilder eller lagringsbehörigheter.

**Inte implementerat ännu:** uppladdning, Storage-bucket `campaign-materials`, bibliotekets UI, klicket **Visa nu**, klientprenumerationer/Realtimesynk, åtkomst till äldre opublicerade bilder eller automatisk filborttagning. Dessa byggs i senare etapper och får inte betraktas som live i Gandalf.

## Inventering av befintliga data (2026-10-08)

| Objekt | Plats | Kommentar |
| --- | --- | --- |
| SLP- och monsterporträtt | `campaign-actor-images`, `campaign_npcs.image_path`, `campaign_monsters.image_path` | Privat bucket, befintliga SELECT-policies |
| Platsbilder | `campaign-location-assets`, `campaign_location_assets.storage_path` | Privat bucket, egna platspolicies |
| Kampanjkartor | `campaign-maps`, `campaign_maps.image_path` | Privat bucket, separate RLS |
| Stridskartor | `combat-scene-maps`, `campaign_combat_scenes.background_image_path` | Privat bucket, i dag huvudsakligen GM-åtkomst |
| Kombatantikoner | `combat-icons` | Privat bucket, redan i stridsvyn |

**Ingen fil migreras eller dupliceras av Gandalf.**

## Datamodell

| Tabell | Roll |
| --- | --- |
| `campaign_materials` | En rad per unik fysisk fil inom en kampanj. Titel, beskrivning (spelarsäker efter delning), kategori, typ, bucket/path, metadata, arkivering. Samma rad kan användas på flera ställen. |
| `campaign_material_gm_notes` | Privata SL-anteckningar (separat tabell). Kan aldrig läsas med spelarens material-SELECT. |
| `campaign_material_links` | Många-till-många-relationer till plats, SLP, monster, händelse, stridsscen. Valideringstrigger förhindrar korskoppling till annan kampanj. Föremål kan få en koppling när föremålsregistret är fastställt. |
| `campaign_material_shares` | Permanenta spelarmappen. `revoked_at` återkallar visningen utan att radera filen. |
| `campaign_material_presentations` | Högst en aktiv presentation per kampanj. `material_id = null` innebär avslutad visning; `revision` kan användas vid realtime/konflikthantering. |

**Filprincip:** registrera referens `(campaign_id, storage_bucket, storage_path)` och återanvänd posten; registrera inte samma fysiska fil flera gånger. Nya filer ska heta `<campaign_uuid>/<random_uuid>/<safe_filename>` i privat bucket `campaign-materials` från Gimli. Gamla filer ligger kvar.

## Behörighetsmodell

- **SL/admin:** kan hantera metadata, kopplingar, anteckningar, shares och presentationer enligt befintliga hjälpfunktioner `private.is_admin` / `private.is_campaign_gm`.
- **Spelare:** får endast SELECT på `campaign_materials` inom den kampanj de tillhör **och** endast om posten inte är arkiverad **och** antingen är aktiv presentation eller har aktiv (`revoked_at IS NULL`) share.
- **Spelare får aldrig:** läsa `campaign_material_gm_notes`, se kopplingstabellen eller skriva till material-/delnings-/presentationstabeller.
- **Anonym användare:** inga tabellprivilegier eller policies har öppnats.
- **Samma kampanj:** komposit-FK för materialreferenser plus triggerkontroll av varje länkat objekt.
- **Filåtkomst:** RLS i databasen räcker INTE för att ge tillgång till filbytes i Storage. **Gimli** måste skapa en privat bucket med Storage-RLS. **Aragorn** måste lösa kontrollerad läsning/delning av gamla bilder utan att göra hela SLP- eller platsregistret publikt. Visa inte osäker public URL.

## API-flöden för senare etapper

1. **Registrera fil** (Gimli): GM lägger fil i kampanjprefixad privat bucket och upprättar metadata i `campaign_materials`. Avbruten uppladdning städas säkert; maxstorlek och mime-validering även på Storage-nivå.
2. **Koppla fil** (Aragorn): sätt `campaign_material_links` till valt existerande objekt utan filkopiering. Originalbilden förblir kvar.
3. **Visa nu** (Frodo): GM `UPSERT` på `campaign_material_presentations`; spelaren ser endast den aktivt presenterade posten.
4. **Spelarmapp** (Sam): GM skapar `campaign_material_shares`; återkalla genom att sätta `revoked_at`. Ingen radering av fil.
5. **Realtid** (Galadriel): klienterna prenumererar på ändringar i presentationen och hämtar då metadata/fil genom auktoriserad åtkomst, med återhämtning efter anslutningsavbrott.
6. **Radering** (Gimli/Bilbo): arkivera först. Ta bara bort själva filen när alla referenser är borta och det verifierats att ingen extern originalpost använder den. Radera aldrig en gammal SLP-bild som bieffekt av att ta bort en delningspost.

## Säkerhetsgräns som måste testas inför bildvisning

Befintliga privata buckets har **olika** RLS-villkor, bland annat för platsupptäckt, SLP-synlighet och stridskartor. En ny `campaign_material_shares`-rad får inte automatiskt kringgå dessa skydd. Lös filåtkomsten explicit, exempelvis via signerad kortlivad länk skapad först efter serverkontroll av kampanjmedlemskap + aktiv delning. Ändra inte generellt befintliga SELECT-policies för att lösa ett enskilt delat porträtt.

## Godkännande av Gandalf

- [x] Kartlagt fem befintliga privata buckets och äldre tabeller.
- [x] Definierat fem nya kampanjisolerade tabeller och RLS.
- [x] Säkra länkar via kompositnycklar och trigger.
- [x] Inga filer rörda eller upplåsta.
- [ ] Gimli skapar verklig lagringsbucket, uppladdning och Storage-policies.
- [ ] Frodo/Sam skapar användarflöden för delning.
- [ ] Elrond testar riktiga separata spelarkonton och publicering.

## Nästa steg: Gimli

1. Skapa privat `campaign-materials` bucket, rimlig filstorleksgräns och MIME-lista.
2. Implementera Storage-RLS efter kampanjprefix och GM/medlemskap/materialdelning.
3. Skapa återanvändbar uppladdning inklusive miniatyrer.
4. Testa olovlig uppladdning, olovlig läsning, avbruten uppladdning och borttagning.
