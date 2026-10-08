# Galadriel – Lady of Lothlórien, Realtime (v0.34.87)

## Vad Galadriel gör
När SL trycker på **Visa nu**, byter eller avslutar Frodos presentation ska aktiva spelare få ändringen direkt. När SL lägger till eller återkallar material i Sams spelarmapp ska öppna spelarmappar uppdateras automatiskt.

Lösningen använder **Supabase Realtime Postgres Changes**, med WebSocket (Phoenix-protokoll 1.0.0) och autentiserade kampanjbundna prenumerationer. Ingen ny tredjepartsmodul behövs.

## Säker händelsemodell
`public.campaign_material_signals` har endast
- `campaign_id` (primärnyckel)
- `presentation_revision` och `folder_revision` (heltal)
- `updated_at`

Tabellen innehåller **inga filvägar, bildtitlar, NPC-namn, privata anteckningar eller delningsposter**. Två servertriggers ökar räknaren vid ändringar i presentationer respektive delningar. RLS låter endast behörig medlem/SL/admin läsa kampanjens signaler; inga vanliga klienter får INSERT/UPDATE/DELETE. Triggers körs som databasägare och går inte att anropa direkt av vanliga användare.

En signal betyder endast **"kontrollera nytt läge"**. Klienten hämtar riktig presentations-/mappdata på nytt via befintliga REST-anrop och vanliga RLS- och Storage-regler. Det garanterar att även *återkallning* ger en händelse utan att dela den återkallade postens innehåll.

## Fördelar för deltagarna
- Frodos visade bild öppnas i Legolas för deltagaren när ny presentation uppfattas.
- Frodos avslut stänger spelarens automatiska förhandsvisning.
- Sams spelarmapp laddas om när en delning läggs till eller återkallas, om materialpanelen är öppen.
- När en spelare tittar på ett återkallat, permanent delat objekt stängs förhandsvisningen om objektet inte samtidigt presenteras genom Frodo. Filer som spelaren redan laddat ned kan inte återkallas från dennes lokala enhet.
- En liten statusrad `✨ Galadriel · Ansluten · realtid` eller reservlägesstatus visas i materialpanelen.

## Robusthet
- WebSocket med kampanjfilter och aktuellt auth-token, `phx_join`, serverbekräftelse och hjärtslag var 20:e sekund.
- Löpande tokenbyte kan vidarebefordras på kanalen.
- Automatisk återanslutning med backoff 1–30 sekunder.
- Separata kampanjer eller utloggning stänger tidigare prenumeration och rensar revisionsstatus.
- Vid ansluten realtid pausas Frodos gamla femsekunderspollning; en försiktig REST-avstämning körs med längre mellanrum för missade händelser.
- Vid frånkoppling används befintlig Frodo-pollning samt fallback för Sams mapp och förnyade anslutningsförsök.
- Dubbletter och händelser för andra kampanjer ignoreras.

## Filöversikt
- `supabase/migrations/20261008_galadriel_material_realtime_signals.sql`
- `features/material/realtime.js` – socket, protokoll, revisioner, fallback
- `features/material/galadriel-ui.js` – integration med Sam, Frodo, Legolas
- `features/material/realtime.css` – tydlig anslutningsstatus
- `tests/material-galadriel-realtime.test.js` – protokoll, autentisering, duplicerade händelser, kampanjbyte, utloggning, reservläge

**Elrond kvarstår:** praktiskt end-to-end-test med en SL och en spelare i två webbläsare, inklusive nätverksavbrott och omedelbart återkallande av material.
