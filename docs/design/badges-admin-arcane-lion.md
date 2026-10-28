# Badges-admin – ARCANE LION (designspecifikation, ingen implementation)

Status: **Specifikation**. Badge-adminens bildvarianter och lagerordning implementeras separat i [PR #342](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/342). Automatisk utvärdering av karriärmått återstår tills mätvärdesregister och händelsekällor är definierade.

## Troférummets tre väggar
- Vänster: **Utmärkelser** – automatiska prestationer inom en strid eller session, brons/silver/guld; en ägd utmärkelse per typ och rollperson, separat historik över antal uppnåenden.
- Mitten: **Medaljer** – äventyrsmedaljer.
- Höger: **Badges** – långsiktiga automatiska karriärmilstolpar och manuellt tilldelade specialbadges.

## Badges-admin: formulär
1. Grunduppgifter: namn, beskrivning, typ (automatisk / special), status (utkast/aktiv/inaktiv). Internt ID finns men **visas inte** för webbanvändaren.
2. Automatiska badges: välj ett maskinläsbart karriärmätvärde och tre stigande trösklar för brons, silver, guld i **en enda badgepost**. Uppgradera automatiskt högsta ägda valör; historik bevaras.
3. Specialbadges: kriteriebeskrivning, spelledartilldelning och motivering; inga påtvingade statistiska kriterier. Valörer ska kunna konfigureras där det är relevant.
4. Bildvarianter: material **Emalj / Metallrelief / Snidat trä / Övrigt**, flera uppladdningar, en aktiv variant (första uppladdningen väljs automatiskt), knapptext **Ta bort bild**. Ingen arkiveringsfunktion.
5. Presentation: förhandsgranska motiv med ram för brons/silver/guld, synlighet före upplåsning, text vid tilldelning.

## ARCANE LION – ram och bild
- Tre separata systemramar för Badges: **guld med blå fana/ädelsten**, **silver med röd fana/ädelsten**, **brons med grön fana/ädelsten**.
- Ramarna är systemresurser, inte filer som måste laddas upp för varje badge. Ram väljs automatiskt efter valör.
- **Alla uppladdade badge-bilder ska vara kvadratiska (1:1)**. Kvadratisk canvas gäller även när motivet sticker ut.
- Val i formuläret: **Tillåt motiv utanför ramen (3D-effekt)**.
- Av: ramen ritas **framför** badge-bilden.
- På: badge-bilden ritas **framför** ramen och får sticka utanför ramens kanter.
- Kryssrutan styr alltså bildens och ramens lagerordning. Den kräver inte separata bakgrunds- och motivlager.
- Badgebilden ska ha **äkta RGBA-transparens (alfa 0)** där inget motiv finns. Inga schackrutor får vara inbakade i bilden.
- Motivet och ARCANE LION-ramen lagras separat. Förhandsvisningen ska använda samma lagerordning som den faktiska presentationen.
- Validera dimensioner, alfakanal och placering. Avvisa felaktiga bilder med begripligt felmeddelande; gör ingen destruktiv automatisk beskärning.
- Förhandsvisning för alla tre valörer, både med 3D-läge på och av.

## Avgränsning och skydd för HERMES CORE
- **Ingen kodändring i denna PR.**
- Ingen ändring i HERMES CORE, HERMES ALEA, HERMES 4, Supabase, RLS, Storage, GitHub Actions, CI eller bildöverföringsflöden.
- Ingen migration, deploy eller produktionsuppladdning.
- Implementationsarbete kräver separat granskning av aktuella komponenter, bildkontrakt och HERMES CORE-gränssnitt **efter att CORE är stabilt**.
- Denna PR ska förbli Draft tills specifikationen granskats; ingen merge utan uttryckligt beslut.

## Framtida acceptanskriterier (ej implementerade)
- Webbanvändaren ser inget internt ID.
- En badgepost stöder brons/silver/guld med gemensamt mätvärde.
- Flera bildvarianter, exakt en aktiv, och **Ta bort bild**.
- Kvadratisk RGBA-bild, ingen inbakad schackrutig bakgrund.
- 3D-val styr om motiv får synas framför ram; bakgrund hålls i kvadraten.
- Ingen regression i HERMES CORE:s publiceringsflöde.
