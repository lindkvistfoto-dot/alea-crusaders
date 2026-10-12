# Träffområdesbilder – ras × kön (v0.35.130)

## Administration
Öppna **Administration → Träffområdesbilder**. Välj en ras från appens befintliga
rasregister och därefter **Man** eller **Kvinna**. En bildserie består av åtta
transparanta illustrationer med samma proportioner och placerad figur:

| Filnamn | Träffområde |
| --- | --- |
| neutral.webp | Ingen markering |
| head.webp | Huvud/hals |
| chest.webp | Bröstkorg/axlar |
| abdomen.webp | Mage/skrev/bäcken |
| left_arm.webp | Figurens vänstra arm |
| right_arm.webp | Figurens högra arm |
| left_leg.webp | Figurens vänstra ben |
| right_leg.webp | Figurens högra ben |

Du kan ladda upp varje bild separat eller välja flera filer med dessa filnamn
samtidigt. PNG/JPEG/WebP godtas vid import och sparas som WebP med bibehållen
alfakanal. Bildförhållandet måste vara 2:3 (t.ex. 1024 × 1536).
Max 12 MB per original och 4 MB efter optimering.

En bildserie blir **aktiv först när samtliga åtta bilder finns registrerade**.
Administrationen visar antal klara platser (0–8) per ras/kön.

## Automatisk bildserie i attackrutan

När träffområdets tärning är färdig visar attackrutan motsvarande markerade
illustration. Det är **försvararens** ras och kön som används. Raskoden normaliseras
mot Expert-registret (t.ex. Dvärg → dvarg, Människa → manniska).

Reservordning för träffad **kvinna av rasen dvärg**:

1. Dvärg/kvinna
2. Dvärg/man
3. Människa/kvinna
4. Människa/man
5. Tidigare anatomisk standardbild om ingen komplett serie finns

För okänt eller ej angivet kön används **man**. För okänd eller ej registrerad
ras används människa. Man byter aldrig träffområdestabell eller skaderegler:
det är en **ren presentationsfunktion**.

Vid ny strid sparas ras/kön på kombatantens state och kopieras till resultatet
från träffområdesslaget. Äldre pågående strider kompletteras tillfälligt från
underliggande rollperson/SLP/monster när SL öppnar dem.

## Lagring och behörighet

Registrering: `public.rule_hit_figure_images` med unik nyckel
`(race_id, gender, body_part)`.

Bildfiler: privat Supabase Storage bucket `alea-hit-figures`.

- Endast systemadministratörer får ladda upp, byta ut och radera.
- Inloggade spelare får läsa bildserierna så de kan se stridsresultat.
- Bildfilerna är aldrig publika webbadresser; klienten använder autentiserad
  nedladdning och tillfälliga Blob-URL:er.
- Bilbo/Gimli och befintligt kampanjmaterial påverkas inte.
- Vid fel eller saknad bild visas den tidigare anatomiska träffmarkeringen.

## Kod
- `features/combat/hit-figures.js`: administration, valalgoritm och bildhämtning.
- `features/combat/hit-figures.css`: responsiv bildadministration.
- `features/combat/runtime.js`: sparar försvararens ras och kön.
- `src/main.js`: bildbehållare och anatomisk fallback.
- `tests/combat-hit-figure-packs.test.js`: prioritering och integrationskontroll.
