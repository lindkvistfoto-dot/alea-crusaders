# Gimli – Bergets skattkammare (v0.34.78)

## Leverans

Gimli har skapat en privat Supabase Storage-yta för nya kampanjbilder och dokument, samt en enkel SL-uppladdning under **Administration → Materiallagring**.

- Bucket: `campaign-materials`, **public=false**, filstorleksgräns 20 MiB.
- Format: JPEG, PNG, WebP, PDF och vanlig text (`text/plain`).
- Filplacering: `<kampanj-UUID>/<fil-UUID>/<rensat-filnamn>`.
- Klienten kontrollerar storlek, MIME/filändelse och signatur före uppladdning. Storage kontrollerar MIME/storlek och RLS kontrollerar kampanjprefix och roll.
- Bilder får en privat WebP-miniatyr med längsta sida högst 420 pixlar där webbläsaren stöder bildkonvertering. Om konvertering inte stöds kan originalbilden förhandsvisas; inga stora eller ogiltiga miniatyrer skrivs.
- Filer laddas upp före metadata. Om metadataregistrering misslyckas försöker klienten ta bort sina uppladdade filer och visar ett fel.
- Metadata sparas i Gandalfs `campaign_materials` utan att befintliga SLP- eller platsbilder flyttas eller dupliceras.
- Senaste uppladdningar kan förhandsgranskas via autentiserad Storage-hämtning. Inga publika filadresser skapas.

## Behörighetsmodell

**INSERT**: bara admin eller SL inom kampanjen, med rätt kampanjprefix i objektets sökväg.

**SELECT**: SL får läsa kampanjens filer. En spelare får läsa registrerad, ej arkiverad originalfil eller miniatyr först när materialet antingen har en aktiv, ej återkallad delning i `campaign_material_shares` eller är kampanjens aktuella presentation i `campaign_material_presentations`.

**DELETE**: bara SL/admin; bara om filen inte längre används i `campaign_materials` (gäller även miniatyr). Detta möjliggör säker städning av övergivna uppladdningar.

**UPDATE**: ingen Storage-policy för överskrivning. Ändrade bilder får en ny unik filreferens.

**Anon**: ingen åtkomst till privata materialfiler.

Läs-/delningsflöden byggs ut i Frodo/Sam/Galadriel. Befintliga gamla privata buckets får inga nya generella SELECT-regler genom Gimli.

## Implementerade filer

- `supabase/migrations/20261008_gimli_material_storage.sql`
- `features/material/storage.js`
- `src/main.js` (import och registrering av administrationspanelen)
- `legacy/app.js` (adminsektion och laddningsväg)
- `src/styles/app.css` (mobilanpassad, kontraststark form)
- `tests/material-gimli-storage.test.js`

## Begränsningar

Den fullständiga administrationsvyn med sökning, kategorisering av redan uppladdade äldre filer, metadataredigering och arkivering hör till **Bilbo**. **Aragorn** kopplar nytt och befintligt material till personer och platser, utan filkopiering.

Gimlis uppladdningsruta ligger inledningsvis under Aleas **Administration**, som i befintlig navigering bara är tillgänglig för globala administratörer. Storage-RLS och uppladdningsfunktionerna tillåter även kampanjens SL; en separat SL-ingång kan läggas i den senare Materialpanelen utan att öppna övriga adminfunktioner.

Verifiering: `npm run check` via GitHub Actions; Supabase-migrering installerad. Faktiska uppladdningar i webbläsare med separata SL- och spelarkonton ska verifieras inför slutprovet Elrond.

## Nästa: Bilbo

Bygg **Administration → Bildbibliotek** med sökning, miniatyrrutnät, metadataredigering, kategorier, arkivering och återanvändning av `campaign_materials`.
