# Alea Crusaders — LÅST designstandard för navigeringsknappar

Status: **LÅST (2026-10-11)**. Hem-ikonparet är implementerat som klickbar länk i desktopbannerns vänstra kolumn från v0.35.111. Övriga navigeringsikoner följer fortfarande designstandarden inför kommande implementering.

## Förlaga
De två godkända Hem-ikonerna i ChatGPT-konversationen den 11 oktober 2026 är **stilförlaga**:
- Normal/ej vald: vertikalt svärd med hjaltet uppåt, omgivet av symmetrisk lagerkrans på mörk metall-/stenplatta.
- Vald/aktiv: **samma** svärd, lagerkrans, proportioner, konturer, vinkel och ram, men med markant starkare gyllene glöd.

Skapa inte alternativa former eller lägg till kompassros. Hem-symbolen är Aleas emblem med svärd + lagerkrans, inte en husikon.

## Gemensamt för alla navigeringsikoner
- **Två PNG-filer per ikon:** normal och vald. Transparent bakgrund **utanför** knappens kontur och eventuell mjuk glöd.
- **Kvadratiskt 1:1-format**, samma bildyta, centrering, marginaler och dimensioner för båda tillstånden. Passar nedskalning i den kompakta topplisten.
- **Knappform:** rundad kvadrat med diskret fasad ram; premium high-fantasy-känsla med realistiska, hantverksmässiga detaljer, lätta repor/patina, skarpa silhuetter.
- **Färgskala:** mörkt kol/brun/svart, antik brons, mässing och guld. Samstämmig med Alea Crusaders-banner och appens befintliga designspråk.
- **Ej vald:** mörk **semitransparent** inre bakgrund, nedtonade bronshöjdpunkter, mycket återhållen ljuseffekt. Symbolen ska synas tydligt i liten storlek.
- **Vald:** samma grafik och form; förgylld kant, varmare/ljusare metall och tydligt gyllene sken omkring symbolen/ramen, utan att konturerna försvinner.
- **Ingen inbakad text** i bildfilerna. Tillgängligt namn/etikett och knappfunktion ligger i HTML, oberoende av bilderna.
- Undvik detaljförändringar mellan tillstånden: skillnaden ska vara **ljus, färg och glöd**, inte motiv eller position.
- Symbolerna för övriga destinationer anpassas till samma rundade platta, material, ram, ljussättning och skala. Hem-paret är kalibreringsreferens.

## Implementation och fortsatt utbyggnad
- Behåll befintliga navigationselement, klickfunktioner och aria-etiketter.
- Bilderna ska vara separata från tidsdygnsbannern, så både bildbakgrund och navigeringsikoner kan ersättas oberoende av varandra.
- Föreslagen konsekvent namngivning: `assets/navigation/<id>-normal.png` och `assets/navigation/<id>-active.png`.
- När ikonerna är slutgodkända går det att ansluta dem som CSS-/bildlager. Ändra **inte** mobilnavigeringen förrän den separat godkänns.
