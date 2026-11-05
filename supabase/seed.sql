-- Optional demo data for the CRM (safe to run once on an empty database).
with c as (
  insert into contacts (name,email,phone,company,status) values
  ('Aisyah Rahman','aisyah@nusantaratrading.my','+60 12-345 6789','Nusantara Trading Sdn Bhd','Customer'),
  ('Daniel Lim','daniel@pixelforge.my','+60 16-221 8890','PixelForge Studio Sdn Bhd','Prospect'),
  ('Priya Nair','priya@greenleafmfg.com.my','+60 19-778 3321','GreenLeaf Manufacturing Bhd','Prospect'),
  ('Tan Wei Ming','weiming@klretailgroup.my','+60 11-2345 7788','KL Retail Group Sdn Bhd','Lead'),
  ('Hafiz Abdullah','hafiz@borneologistics.my','+60 13-882 1200','Borneo Logistics Sdn Bhd','Lead'),
  ('Sarah Wong','sarah@sunwayfoods.my','+60 12-998 4411','Sunway Foods Sdn Bhd','Customer')
  returning id, name
), o as (
  insert into opportunities (contact_id,title,value_rm,stage)
  select id, t, v, s from c join (values
   ('Aisyah Rahman','e-Invoice integration rollout',85000,'Won'),
   ('Daniel Lim','Annual SST compliance advisory',32000,'Proposal'),
   ('Priya Nair','ERP tax module upgrade',150000,'Qualified'),
   ('Tan Wei Ming','POS e-Invoice onboarding',45000,'Contacted'),
   ('Hafiz Abdullah','Logistics service tax review',18000,'New'),
   ('Sarah Wong','Transfer pricing documentation',60000,'Lost'),
   ('Sarah Wong','Quarterly SST filing support',24000,'Proposal')
  ) as x(n,t,v,s) on x.n = c.name
  returning id, contact_id, title
)
insert into activities (contact_id, opportunity_id, type, activity_date, description)
select o.contact_id, o.id, a.type, now() - a.ago, a.descr
from o join (values
 ('e-Invoice integration rollout','Meeting', interval '2 days','Kick-off meeting with finance team on e-Invoice phase timelines.'),
 ('Annual SST compliance advisory','Call', interval '1 day','Discussed whether their packaging service is a taxable service under SST.'),
 ('ERP tax module upgrade','Email', interval '5 hours','Sent technical scope and pricing breakdown.'),
 ('POS e-Invoice onboarding','Note', interval '3 hours','Client unsure if their turnover threshold requires e-Invoicing yet.'),
 ('Quarterly SST filing support','Call', interval '30 minutes','Follow-up on proposal; asked about SST-02 filing deadlines.')
) as a(title,type,ago,descr) on a.title = o.title;
