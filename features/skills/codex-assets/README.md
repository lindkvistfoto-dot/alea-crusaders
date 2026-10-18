# ARCANE SKILL CODEX WIDE — grafik v1
Grafiska UI-resurser är separata från färdighetens egna bilder.

- `wide-frame.svg`: skalbar, transparent 16:9-bronsram med diskreta safirer. Renderas **ovanpå** illustrationens ytterkanter med `pointer-events:none`. Ändrar aldrig illustrationens pixlar.
- `parchment-paper.svg`: sömlös pergamenttextur. Kan upprepas i Y-led och rymmer godtyckligt lång beskrivning utan vertikal förvrängning.
- Befintliga HERMES-resurser: `header.webp`, `leather.webp`, `stat-plate.webp`, `close-button.webp`, `divider.webp`. Titel och text renderas som riktig text, inte i bilden.
- Ikon: befintlig `FÄRDIGHET IKON`, liten i övre vänstra hörnet, ingen ytterligare medaljong.
- Illustrationen kommer från `rule_skills.illustration_wide_path`, enbart 16:9 (inte den kvadratiska `illustration_path`).
- Pergamentets färdiga höjd = rubrik + faktisk text + padding. Enbart den yttre dialogen kan scrollas på skärmar med liten höjd.
