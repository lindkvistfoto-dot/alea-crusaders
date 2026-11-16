-- Fixed reusable elemental SLP templates. Stats and attacks are explicitly SL-provisional test values, NOT official Expert statistics.
with forms(npc_key,name,element,attack,sort_order) as (
 values ('sylf_frammanad','Sylf','Luft','Vindstöt',261),
        ('gnom_frammanad','Gnom','Jord','Stenslag',262),
        ('undin_frammanad','Undin','Vatten','Vattenstöt',263)
)
insert into public.campaign_npcs
(campaign_id,npc_key,name,title,race,profession,description,gm_notes,player_visible,active,sort_order,attributes,skills,weapons,shield,armor,spells,updated_at)
select c.id,f.npc_key,f.name,'Frammanad '||lower(f.element)||'elementar',f.name,'',
 'Elementar av '||lower(f.element)||', frammanad genom elementarmagi.',
 'FAST SLP-MALL: Skapas i strid vid lyckad besvärjelse, kontrolleras av magikern. Alla grundegenskaper, KP 11, förflyttning 10 samt '||f.attack||' FV 11 / 1T6 är ENDAST PROVISORISKA TESTVÄRDEN – inte verifierad statistik från Expert. SL anpassar värden, kontroll och EG-skalning utifrån Magiboken.',
 false,true,f.sort_order,
 jsonb_build_object('STY',0,'FYS',0,'STO',8,'SMI',11,'INT',0,'PSY',12,'KAR',0,'KP',11,'FORFLYTTNING',10),
 jsonb_build_array(jsonb_build_object('name',f.attack,'fv',11)),
 jsonb_build_array(jsonb_build_object('name',f.attack,'fv',11,'damage','1T6','weaponCategory','melee','category','melee','length',1,'handling','1H','tags',jsonb_build_array('elemental','provisional'),'masterNotes','SL-provisorisk – ej Expertverifierad.')),
 jsonb_build_object('name','','bv',null,'fv',null),jsonb_build_object('name','','absorption',0),'[]'::jsonb,now()
from public.campaigns c cross join forms f
where not exists(select 1 from public.campaign_npcs n where n.campaign_id=c.id and n.npc_key=f.npc_key);
