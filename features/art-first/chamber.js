// Image coordinates are measured on the supplied 1447 × 1536 painting.
// Each logical map unit is two image pixels. Cartography and camera share this plane.
const points = values => values.map(([x,y]) => [x/2,y/2]);
const obstacle = (name, vertices, sight = false) => ({name,points:points(vertices),sight});
export const chamber = {
  artFirst:true, width:723.5, height:768, pixelsPerMeter:36,
  outline:points([[200,566],[256,465],[352,431],[510,404],[962,404],[1115,440],[1164,502],
    [1224,558],[1280,716],[1306,909],[1233,958],[1210,1095],[1010,1100],[955,1156],
    [815,1168],[814,1330],[829,1496],[785,1534],[643,1534],[614,1460],[632,1330],
    [632,1168],[490,1158],[402,1105],[220,1097],[161,1051],[160,788],[195,730]]),
  obstacles:[
    obstacle('Gravmonument',[[556,421],[605,390],[866,391],[894,552],[882,570],[553,569]],true),
    obstacle('Bokhylla',[[166,500],[281,405],[326,429],[325,557],[189,612],[162,577]],true),
    obstacle('Skrivbord och stol',[[248,832],[268,776],[327,752],[349,803],[457,777],[524,845],[494,968],[316,1005],[253,925]]),
    obstacle('Kista',[[1103,917],[1141,861],[1240,914],[1208,1014],[1093,965]]),
    obstacle('Västra tunnan',[[158,590],[187,574],[226,588],[239,642],[222,676],[172,682],[151,650]]),
    obstacle('Östra tunnor',[[1150,567],[1207,550],[1235,585],[1226,642],[1242,663],[1244,718],[1212,753],[1170,736],[1157,674],[1148,638]])
  ],
  table:{id:'table',x:132,y:408,width:112,height:58},
  searchPoint:[263,440], door:{x:316,y:665,endX:407,endY:665}, doorArt:{x:313,y:553,w:96,h:116},
  sun:points([[890,426],[935,430],[1110,753],[1035,741]]),
  lamps:[
    ['Nordvästra kandelabern',418,308,414,445],['Altarljuset',723,305,727,386],
    ['Nordöstra kandelabern',1027,305,1021,441],['Östra väggljuset',1276,651,1245,737],
    ['Skrivbordsljuset',395,795,516,824],['Västra väggljuset',175,904,210,929],
    ['Vänstra portljuset',576,1242,644,1322],['Högra portljuset',873,1242,801,1322]
  ].map(([name,x,y,fx,fy],i)=>({id:i,name,x:x/2,y:y/2,foot:[fx/2,fy/2],range:142})),
  starts:{astrid:[272,416],evalin:[466,479],lyra:[369,514]},
  // Variants are chosen by the session host, independently from either paint plate.
  guardSpots:[[350,703],[376,748],[321,747]]
};
