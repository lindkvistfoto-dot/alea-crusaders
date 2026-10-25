# Magiska områden på hexkartan

## Kartmodell

Stridskartan visar endast yta. Centrumhexen är alltid markerad; varje ring lägger till de sex hexarna runt föregående ytterkant. Avståndet mellan hexar används bara för att översätta uttryckliga mått till en visuell spelmodell. Besvärjelsens räckvidd från magikern till centrum är ett separat mått.

Besvärjelsens regeltext styr fortfarande vilka som påverkas, skada, motståndsslag och skydd. Att en kombattant står i de markerade hexarna är bara en områdeslista, inte ett automatiskt träffbesked.

## Förslag per besvärjelse

| Besvärjelse | Vad grundregeln anger | Föreslagen kartmodell |
| --- | --- | --- |
| **ELD (F)** | En eller flera skadebärande sfärer. Effektgrader kan koncentrera skadan eller fördela den mellan flera sfärer. Sidorna anger ingen sfärdiameter. | En vald centrumhex per sfär tills en diameter finns i regeldata. Effektgrader fördelas mellan antal sfärer och skada enligt regeln. Kartan gissar inte en större radie. |
| **FROST (F)** | Sfär med 1 m diameter; kan skapa flera sfärer och fördela skadan efter effektgrad. | En centrumhex per sfär. Enmeterssfären ryms i en hex i standardrutnätet. Effektgrader styr antal sfärer/skada, inte radien. |
| **MÖRKER (F)** | Sfär med 6 m diameter. Ytterligare effektgrad kan ge 3 m större diameter eller 5 min längre varaktighet. | Grundradie 2 hexar vid standardavståndet 1,5 m mellan hexcentra. Varje effektgrad som läggs på diameter ökar radien med en ring. Grader lagda på varaktighet ändrar inte området. |
| **BESKYDDARE** | Permanent skyddskub 3 × 3 × 3 m vid EG 1; ytterligare grader ändrar ett valt mått. Magi prövas mot Antimagi EG 1 vid gränsen; föremål möter Energistråle EG 1. | Projicera kubens 3 × 3 m markyta till radie 1: centrumhex plus angränsande ring. Varje extra EG som används för storlek lägger till en ring. Höjd ignoreras på stridskartan och påverkar inte markytan. Barriärkontrollen sker vid områdets kant; innehåll i zonen blir inte automatiskt påverkat. |
| **STENVÄGG (F)** | Vägg från marken, 1 × 3 × 3 m; extra grad lägger 1 m till ett valt mått. | Rita en vägglinje på kartan, en hex bred. Baslängden blir två hexsteg vid 1,5 m hexavstånd; storleksgrader förlänger linjen med ett hexsteg per grad. Höjd ignoreras på kartan. Detta är en linjeform, inte en radie. |
| **DIMMA och andra områden utan synligt mått på de uppladdade sidorna** | Ingen användbar diameter/radie framgår av det tillgängliga underlaget. | Behåll ett centrumhex och låt spelledaren justera området manuellt. Fyll inte i ett regelmått genom gissning. |

## Effektgrad och manuell hantering

Om en regel erbjuder flera användningar av extra effektgrader, ska modellen spara fördelningen. För Mörker innebär det till exempel `radius_eg` och `duration_eg`; summan av extra grader får inte överstiga tillgängliga grader. För Eld och Frost behöver en framtida multisentermodell spara sfärernas centrum och skadetilldelning. Till dess väljs en hex per sfär och spelledaren hanterar flera centrum om kastet använder flera sfärer.

Räckviddstext som `S×10 rutor` används endast för avståndet från magikern till valt centrum. Den används aldrig som områdesradie.

## Dokumenterad spelabstraktion

Hexringen är en praktisk 2D-projektion, inte en ny tolkning av volymregeln. Beskyddares höjd och kubform samt Stenväggens höjd går inte att spela ut i en 2D-hexkarta utan ett separat höjdspel. Därför påverkar bara markytan kartmarkeringen; den ursprungliga regeltexten och spelledarens bedömning gäller fortsatt för vertikala situationer.
