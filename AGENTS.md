# Alea Crusaders – arbetsinstruktioner för automatiserade agenter

## Bilder: Protokoll HERMES

**HERMES CORE** är standard för utvecklarinitierade systembilder via Google Drive och den befintliga CORE-kedjan. Börja med [HERMES CORE-manifestet](hermes/core/manifest.json). Om åtkomst är osäker, följ den icke-destruktiva [hälsokontrollen](hermes/core/healthcheck.md). Läs därefter [operativt kontrakt](features/hermes-core/OPERATIONAL_ACCEPTANCE.md) och [kökontrakt](hermes/core/queue/README.md). Läs Drive-mål ur konfigurationen; välj aldrig mappar på gissning.

**HERMES ALEA är den enda standarden för användar- och administratörsinitierade bilder från ALEA-gränssnittet.** Samma klient, publiceringskedja, asset resolver och grundläggande behörighetsmodell används överallt. Bildprofiler, målpekare och rättigheter får variera; publiceringsarkitekturen får inte. Anpassa ALEA:s miljö och konsumentvyer till HERMES ALEA, aldrig med en lokal publiceringsväg för en viss bildtyp eller vy. Följ [HERMES ALEA-besluten](docs/hermes-alea/DECISIONS.md).

Nya HERMES ALEA-bilder får inte dubbelpubliceras till legacy-buckets och får inte använda äldre publika Storage-sökvägar. Gamla `image_path`-värden är endast läsreserv tills de republishats via standardflödet. HERMES ALEA-display lagras privat och visas genom den gemensamma resolvern med begränsad signerad åtkomst. Återinför inte HERMES 4.1, dess OAuth-refresh-token eller motsvarande workerflöde.

- Det gäller **framåt**. Flytta inte gamla bildfiler, byt inte ut äldre lagringskopplingar och genomför inte massmigrering utan ett uttryckligt uppdrag.
- Respektera låsta visuella original (t.ex. ARCANE IVORY), originalets transparens och dess bakgrund **innanför** ramen.
- För ARCANE IVORY: använd [docs/design/arcane-ivory-image-pipeline.md](docs/design/arcane-ivory-image-pipeline.md), [config/hermes-profiles.json](config/hermes-profiles.json) och `node scripts/hermes-verify.mjs`.
- Ändra inte spelvärden, besvärjelseregelverk, bildfält som inte ingår i uppdraget eller åtkomstpolicys som bieffekt.
- Ange verifierade filvägar, relevant GitHub-commit, teststatus och exakt ändrad DB-referens. Ange vad som **inte** kunde verifieras.
