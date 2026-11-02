# OLYMPIA 2.0 – SAFE EVOLUTION baseline (2026-11-02)

## Verifierad utgångspunkt
- DEV baseline: `b00fd92e1c89a0249ba940ca2af2752528bb4d2f`.
- Behåll ALEA DEV-session, Zeus-kontroll, GitHub PR-lista, CI-bedömning och fungerande DEV-merge.
- PR #513 är **inte** mergad. Dess extra LIVE-förberedelseknapp ska inte införas i den beslutade slutmodellen.
- Ingen förändring av `main` eller LIVE-Supabase i detta steg.

## Beslutad modell
1. Förhandsgranska DEV.
2. Zeus: Godkänn DEV / Omarbeta / Kasta.
3. Efter bekräftad DEV-merge: skapa en isolerad LIVE-kandidat automatiskt, utan extra Zeus-beslut.
4. Förhandsgranska exakt LIVE-kandidat i säker preview; verifiera SHA, innehåll, CI och att inga LIVE-skrivningar kan ske.
5. Zeus: Godkänn LIVE (Pandoras ask) / Lägg i releasepaket / Omarbeta / Kasta.

## Säkerhetsvillkor för automatisk kandidat
- Starta **endast efter bekräftad DEV-merge** och serververifierad Zeus-acceptans. Aldrig vid sidladdning eller klientens refresh.
- Idempotent per käll-PR och verifierad commit; upprepade triggers får inte skapa dubbla releaseärenden.
- Om kandidatförberedelse misslyckas behålls DEV-merge; kortet visar separat fel och säker återförsöksväg.
- Kandidatens innehåll måste vara selektivt mot aktuell LIVE-bas, utan orelaterade DEV-ändringar.
- Preview får inte skriva till LIVE-data; Cloudflare-preview är inte i sig ett bevis för säker isolering.
- Ingen merge till `main` utan uttryckligt, serververifierat slutbeslut från Zeus och kontrollerad kandidat.

## Återgång / stopplinje
- Varje ändring görs i isolerad PR mot `development`, med CI, MINOTAURUS och relevanta regressionstester före merge.
- Om klientändringen orsakar regression: revert den specifika PR-committen i DEV, inte en generell reset som tappar senare ändringar.
- Om Edge Function deployas: bevara föregående version och återställ den separat vid serverregression; kod-revert ensam återställer inte driftsatt funktion.
- Redan genomförda GitHub-beslut, merge-commits eller releaseärenden rullas inte tillbaka genom frontend-revert. Verifiera journalen före ny åtgärd.
- Stoppa vid första avvikelse och rapportera faktiska kontroller; bygg inte vidare förrän föregående steg är verifierat.

## Etapper
1. Baslinje och rollback-plan (denna PR, inga runtimeändringar).
2. Serverstyrd automatisk kandidat efter DEV-merge, med idempotens och fail-closed-tester.
3. Verifierad, skrivskyddad LIVE-kandidatpreview.
4. Slutliga LIVE-beslut och separat publiceringskontroll.
