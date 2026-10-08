-- Eldsalamander: återanvändbar SLP för elementarmagi / frambesvärjning i Skelettbyn.
-- En spelbar provmall: egenskaper/KP 11/förflyttning 10 är hämtade
-- från exempel-salamandern i äventyret "Det yttersta mörkret",
-- INTE officiell generell Expert-statistik.
-- Naturligt eldanfall (FV 11, 1T6) är SL-provisoriskt till dess
-- originalregeln för salamanderns attack och EG-skalning verifierats.
insert into public.campaign_npcs(
 campaign_id,npc_key,name,title,race,profession,description,gm_notes,
 player_visible,active,sort_order,attributes,skills,weapons,shield,armor,spells,updated_at
)
select
 c.id,'eldsalamander_frammanad','Eldsalamander','Frammanad eldelementar',
 'Eldsalamander','',
 'En levande, orm- och ödleliknande gestalt av glödande eld som kan träda fram när elementarmagi frammanar eldens element.',
 'FRAMMANINGSMALL – EJ UTPLACERAD. Avsedd som SLP/stridskombatant när FRAMMANA/SKICKA BORT ELEMENTAR (F) används för eld. Lägg till den på magikerns sida och sätt ut den i en ledig hex när besvärjelsen lyckats. Ta bort den när magin upphör eller elementaren skickas bort. Granska antal, räckvidd, kontroll och varaktighet mot Expert Magiboken innan automatisering. Exempelvärden för salamander: STY 0, FYS 0, STO 8, SMI 11, INT 0, PSY 12, KAR 0, KP 11, förflyttning L10. KÄLLA: Det yttersta mörkret (äventyr), s. 69, ej verifierad generell Expert-regeltabell. Eldberöring FV 11, 1T6 eld är ett PROVISORISKT STRIDSVÄRDE, inte belagd Expert-regel; anpassa efter effekten/EG när ursprungsregeln finns. Egenskapsnycklarna KP och FORFLYTTNING är avsiktliga kampanjspecifika överstyrningar för elementarer med FYS 0.',
 false,true,260,
 jsonb_build_object('STY',0,'FYS',0,'STO',8,'SMI',11,'INT',0,'PSY',12,'KAR',0,'KP',11,'FORFLYTTNING',10),
 jsonb_build_array(jsonb_build_object('name','Eldberöring','fv',11)),
 jsonb_build_array(jsonb_build_object('name','Eldberöring','fv',11,'damage','1T6','weaponCategory','melee',
 'category','melee','length',1,'handling','1H','range','','tags',jsonb_build_array('fire','elemental','natural','provisional'),
 'masterNotes','SL-provisorisk eldskada och FV; kontrollera Expert-reglerna före slutlig automatisering.')),
 jsonb_build_object('name','','bv',null,'fv',null),
 jsonb_build_object('name','','absorption',0),
 '[]'::jsonb,now()
from public.campaigns c
where c.name='Skelettbyns Hemlighet'
and not exists(select 1 from public.campaign_npcs old where old.campaign_id=c.id
 and (old.npc_key='eldsalamander_frammanad' or old.name='Eldsalamander'));
