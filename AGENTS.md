# Alea Crusaders – arbetsinstruktioner för automatiserade agenter

## Bilder: Protokoll HERMES

Vid **ny eller ändrad bild** i appen ska [docs/HERMES.md](docs/HERMES.md) följas. Det är den gemensamma standarden för bildproduktion, äkta binärfilöverföring, optimering, publicering, metadata, kontroller och databaspekare.

- Det gäller **framåt**. Flytta inte gamla bildfiler, byt inte ut äldre lagringskopplingar och genomför inte massmigrering utan ett uttryckligt uppdrag.
- Respektera låsta visuella original (t.ex. ARCANE IVORY), originalets transparens och dess bakgrund **innanför** ramen.
- För ARCANE IVORY: använd [docs/design/arcane-ivory-image-pipeline.md](docs/design/arcane-ivory-image-pipeline.md), [config/hermes-profiles.json](config/hermes-profiles.json) och `node scripts/hermes-verify.mjs`.
- Ändra inte spelvärden, besvärjelseregelverk, bildfält som inte ingår i uppdraget eller åtkomstpolicys som bieffekt.
- Ange verifierade filvägar, relevant GitHub-commit, teststatus och exakt ändrad DB-referens. Ange vad som **inte** kunde verifieras.
