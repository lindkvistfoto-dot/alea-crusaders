# ARCANE · rollpersonsprofil — visuell kontraktstandard v7

**Låst målbild:** den godkända Astrid Eldhjärta-kompositionen från 2026-10-19. Ändra inte porträtt, rollpersonsdata eller antikguld/emerald-estetik utan separat uppdrag.

## Varför tidigare försök inte räckte

1. Flera efterföljande CSS-filer (ursprunglig profil, systemgrafik, v5, v6) styrde samma mobilrutnät med blandning av `grid-template-areas`, `nth-child`, semantiska klasser och `!important`. En justering kunde förlita sig på att äldre stilblad fortsatt var laddade.
2. Den befintliga `stat-panel.avif` innehåller transparenta marginaler kring det synliga reliefmaterialet. `row-gap` beskriver därför **inte** det synliga mellanrummet mellan guldramarna. V7 förstorar rasterbakgrunden **inom sin befintliga kortbox** (inte med nya SVG-ramar) och minskar den onödiga tomma ytan.
3. Ras och Yrke saknade samma förutsägbara rasterikonfält som övriga poster i den äldre mobillayouten. V7 sätter `::before` för samtliga åtta poster med redan registrerade AVIF-ikoner.
4. Gamla index/CSS-versioner kan finnas i en mobilwebbläsares cache. V7 ersätter v5 och v6 som **enda mobila profil-layout** och får en separat versionsparameter.

## Ägarskap och geometri

- Grundstilar/skrivbordsstil: `features/character/arcane-profile.css`.
- Verkliga systembilder, laddningsgrind och övrigt återanvändbart gränssnitt: `features/ui/arcane-system.css` och `assets/arcane/system/v1/`.
- **Mobilrutnätets enda layoutägare:** `features/character/arcane-layout-v7.css`. V5/V6 får vara historiska filer men får **inte** importeras samtidigt.
- Referensens innehållsordning: separat bred porträttram, namnskylt, sedan **fyra rader med två lika breda rutor**.
- Exakt fältkarta: rad 1 Namn (bägge kolumner); rad 2 Ras/Yrke; rad 3 Kön/Ålder; rad 4 Längd/Vikt; rad 5 Stridsikon/Stånd.
- Etiketterna och värdena linjerar med gemensam vänsterkant efter en separat ikonkolumn. Ikoner är bildfiler, inte Unicode, ikonfont eller nygenererad SVG.
- Normalt visningsläge: 2 kolumner, smala jämna gutters, samma kortbox i varje rad, matchande textbaseline, oförändrade värden.
- Redigeringsläge: behåller befintliga live-inputs och bildväljaren under Bilder. Ingen separat kopia av fälten.

## Verifikation: visuellt och tekniskt

Efter varje förändring:
1. Läs relevant `AGENTS.md` och befintlig CSS/JS före ändring; skapa aldrig en ny versionsfil enbart för att vinna över `!important`.
2. Säkerställ att exakt **en** `arcane-layout-v*.css` finns som `<link>` i `index.html`.
3. Kör relevanta Vitest-kontroller för semantiska grid-positioner, AVIF-filernas existens/signatur, befintlig editfunktion och cache-parameter. Jämför alla CI-fel med samma commit på `main`.
4. På en verklig mobil: hårduppdatera appen. Om rutorna ser oförändrade ut: kontrollera **vilken fil som laddas** innan någon ny CSS läggs till. V7 har diagnostisk CSS-egenskap `--alea-arcane-profile-version:7` på `#identity`; med DevTools: `getComputedStyle(document.querySelector('#identity')).getPropertyValue('--alea-arcane-profile-version')` ska bli `7`.
5. Kontrollera mot Astrid-referensen: båda kolumnernas **synliga guldramar** ska ligga i samma horisontella linje, de fyra lodräta mellanrummen ska vara lika och betydligt mindre än i den äldre skärmbilden. Alla åtta ikoner ska vara synliga och båda textraderna ska få plats utan klippning på skärmar 320, 375, 390, 430 och 768 CSS-pixlar.
6. Testa separat läs-/redigeringsläge, liggande/porträtt, valfria längre ras/yrkesnamn, egen stridsikon och porträtt som fallback. Använd en faktisk renderad skärmbild: kodtester kan **inte** bevisa pixelmässig likhet.

## Om CSS-överskanning inte räcker

När originalets osynliga pixelmarginaler verkligen stör geometrin är korrekt långsiktig lösning en separat, **förbeskuren transparent rasterpanel**, skapad ur godkänt original och publicerad som ny versionsresurs via HERMES. Den ska användas med nio-delad bildkant (9-slice/border-image) för stabila hörn och jämna sidor. Undvik godtycklig `background-size` som permanent kompensation om ornament börjar deformeras.

För nya ARCANE-moduler: separat designreferens, en layoutägare, versionshanterade grafikresurser, verifierad CSS-aktivering och skärmbildsjämförelse före godkännande.
