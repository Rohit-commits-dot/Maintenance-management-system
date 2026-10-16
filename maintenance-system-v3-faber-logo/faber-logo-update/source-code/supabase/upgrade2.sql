-- Run THIRD (after schema.sql and upgrade.sql): custom form fields, editable dropdown lists, delete functions
alter table breakdowns add column if not exists extra jsonb default '{}';
create table if not exists form_options(id bigserial primary key, kind text not null, value text not null, sort int default 0);
create table if not exists form_fields(id bigserial primary key, label text not null, ftype text default 'text', options text, required boolean default false, sort int default 0, active boolean default true);
alter table form_options enable row level security; alter table form_fields enable row level security;
create policy fo_r on form_options for select to authenticated using (my_role() is not null);
create policy fo_w on form_options for all to authenticated using (my_role()='ADMIN') with check (my_role()='ADMIN');
create policy ff_r on form_fields for select to authenticated using (my_role() is not null);
create policy ff_w on form_fields for all to authenticated using (my_role()='ADMIN') with check (my_role()='ADMIN');
insert into form_options(kind,value,sort) values
 ('shift','Morning Shift',1),('shift','Afternoon Shift',2),('shift','Night Shift',3),
 ('bd_category','Mechanical',1),('bd_category','Electrical',2),('bd_category','Pneumatic',3),('bd_category','Hydraulic',4),('bd_category','Instrumentation',5),('bd_category','Utility',6),('bd_category','Other',7),
 ('bd_type','Breakdown',1),('bd_type','Minor Stoppage',2),('bd_type','Quality Issue',3),('bd_type','Safety Issue',4);

-- keep history when a user is deleted: their name stays in timeline text, links become empty
do $$ declare r record; begin
 for r in select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint
  where contype='f' and confrelid='public.profiles'::regclass and pg_get_constraintdef(oid) not ilike '%on delete%' loop
  execute format('alter table %s drop constraint %I', r.t, r.conname);
  execute format('alter table %s add constraint %I %s on delete set null', r.t, r.conname, r.d);
 end loop; end $$;

create or replace function report_breakdown(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare me profiles; n int; v_uid text; v_id uuid;
begin
 select * into me from profiles where id=auth.uid() and active;
 if me.id is null or me.role not in ('PRODUCTION','ADMIN') then raise exception 'Not allowed'; end if;
 perform pg_advisory_xact_lock(7001);
 select count(*)+1 into n from breakdowns where (reported_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date;
 v_uid:='BD-'||to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD')||'-'||lpad(n::text,4,'0');
 insert into breakdowns(uid,machine_id,shift,bd_category,bd_type,problem,priority,machine_stopped,reported_by,updated_by,extra)
 values(v_uid,(p->>'machine_id')::uuid,p->>'shift',p->>'bd_category',p->>'bd_type',p->>'problem',coalesce(p->>'priority','MEDIUM'),coalesce((p->>'machine_stopped')::boolean,true),me.id,me.id,coalesce(p->'extra','{}')) returning id into v_id;
 insert into breakdown_events(breakdown_id,event,status,user_id,user_name,role) values(v_id,'Breakdown reported','NEW',me.id,me.full_name,me.role);
 perform audit(me,'Breakdown created','breakdown',v_uid,null,'NEW');
 perform notify('MAINTENANCE',v_id,'NEW_BD','New breakdown '||v_uid,'New breakdown '||v_uid||' reported: '||(p->>'problem'));
 return v_id;
end $$;

create or replace function delete_breakdown(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare me profiles; b breakdowns;
begin
 select * into me from profiles where id=auth.uid() and active; select * into b from breakdowns where id=p_id;
 if me.id is null or b.id is null then raise exception 'Not found'; end if;
 if not (me.role='ADMIN' or (b.reported_by=me.id and b.status='NEW')) then raise exception 'Not allowed to delete this breakdown'; end if;
 delete from notifications where breakdown_id=p_id; update spare_txns set breakdown_id=null where breakdown_id=p_id;
 delete from breakdowns where id=p_id;
 perform audit(me,'Breakdown deleted','breakdown',b.uid,b.status,null);
end $$;

create or replace function delete_user(p_id uuid) returns void language plpgsql security definer set search_path=public,auth as $$
declare me profiles; t profiles;
begin
 if my_role()<>'ADMIN' then raise exception 'Admin only'; end if;
 if p_id=auth.uid() then raise exception 'You cannot delete your own account'; end if;
 select * into t from profiles where id=p_id; if t.id is null then raise exception 'User not found'; end if;
 select * into me from profiles where id=auth.uid();
 delete from notifications where user_id=p_id; delete from auth.users where id=p_id;
 perform audit(me,'User deleted','user',t.username,t.role,null);
end $$;
