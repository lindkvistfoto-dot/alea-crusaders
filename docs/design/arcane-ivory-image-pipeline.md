# ARCANE IVORY – bildkedja (låst teknisk standard)

1. **Original**: `assets/spells/arcane-ivory/<spell_key>.png`, kvadratisk RGBA-PNG med verklig transparens utanför ramen. Krackelerat elfenben inuti ramen bevaras. Original-PNG ändras aldrig av konverteringen.
2. **Appfil**: `assets/spells/arcane-ivory/<spell_key>.webp`, 640 × 640 pixlar, WebP med identiskt alfakanalvärde för varje pixel efter nedskalning. Hög kvalitet 90/87/84/80/76, först som är högst 500 000 byte väljs.
3. **Manifest**: `assets/spells/arcane-ivory/manifest.json` med filnamn, bytes, vald kvalitet och kontrollsumma för original.
4. **GitHub Actions**: `arcane-ivory-optimize.yml` kör vid ändring av original-PNG eller kod för optimeringen. Det skriver enbart WebP och manifest med GitHub Git Data REST (inte git push). En ny Pages-build begärs explicit då GitHub Actions-token inte automatiskt triggar Pages.
5. **App**: `rule_spells.icon_path` ska för dessa ikoner peka på `assets/spells/arcane-ivory/<spell_key>.webp`. Gamla privata Supabase-WebP fortsätter fungera. Ändra inte `effect_image_path`, `cutout_path` eller spelvärden.
6. **Lokalt/kvalitetskontroll**: `python -m pip install Pillow==12.3.0`, sedan `python scripts/optimize_arcane_ivory.py --write`. Kontrollera med `--check`. Fail vid oriktigt format, avsaknad av äkta transparens, för stora bilder eller ändrad alfa.
7. **Publicering**: Webbplatsen skall leverera WebP-filen, inte begära original-PNG i kryptexen. Byggprocessen kopierar bara WebP till `dist/assets/spells/arcane-ivory`.
8. **Framtida batcher**: Varje ny `<spell_key>.png` läggs in med binär GitHub API-överföring, arbetsflödet gör WebP och slutligen sätts respektive `icon_path` till genererad WebP. Vänta med DB-pekare tills publiceringen är verifierad.

Arkivera alltid den ursprungliga PNG-filen. Utför inte destruktiva massändringar i besvärjelseregistret.
