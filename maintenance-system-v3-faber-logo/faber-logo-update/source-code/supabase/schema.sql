-- Run this whole file once in Supabase > SQL Editor
create extension if not exists pgcrypto;

create table profiles(id uuid primary key references auth.users on delete cascade,
 username text unique not null, full_name text not null, emp_code text, department text,
 role text not null check (role in ('ADMIN','PRODUCTION','MAINTENANCE')), active boolean not null default true);

create table machines(id uuid primary key default gen_random_uuid(), machine_no text unique not null, name text not null,
 type text, description text, install_year int, location text, loss_per_hour numeric default 0, category text,
 maint_type text, operator text, department text, active boolean default true);

create sequence bd_seq;
create table breakdowns(id uuid primary key default gen_random_uuid(), uid text unique not null, bd_no int default nextval('bd_seq'),
 status text not null default 'NEW', machine_id uuid references machines, shift text, bd_category text, bd_type text,
 problem text not null, priority text default 'MEDIUM', machine_stopped boolean default true, photo_url text,
 reported_at timestamptz default now(), reported_by uuid references profiles,
 accepted_at timestamptz, accepted_by uuid references profiles, started_at timestamptz, started_by uuid references profiles,
 completed_at timestamptz, completed_by uuid references profiles, verified_at timestamptz, verified_by uuid references profiles,
 closed_at timestamptz, reopened_at timestamptz, reopened_by uuid references profiles,
 root_cause text, action_taken text, delay_reason text, service_cost numeric default 0, sp_cost numeric default 0,
 spare_used text, carried_out_by text, m_remarks text, m_evidence text,
 machine_ok boolean, v_remarks text, reopen_reason text, v_evidence text,
 updated_at timestamptz default now(), updated_by uuid references profiles);

create table breakdown_events(id bigserial primary key, breakdown_id uuid references breakdowns on delete cascade,
 event text not null, status text, user_id uuid, user_name text, role text, at timestamptz default now(), note text);
create table notifications(id bigserial primary key, user_id uuid references profiles, breakdown_id uuid references breakdowns,
 type text, title text, message text, read boolean default false, created_at timestamptz default now());
create table audit_logs(id bigserial primary key, user_id uuid, user_name text, role text, action text, record_type text,
 record_id text, old_value text, new_value text, at timestamptz default now());

create table spares(id uuid primary key default gen_random_uuid(), part_no text unique not null, name text not null, machine_id uuid references machines,
 stock numeric default 0, min_stock numeric default 0, max_stock numeric default 0, supplier text, unit_cost numeric default 0);
create table spare_txns(id bigserial primary key, spare_id uuid references spares, kind text check (kind in ('IN','OUT','ADJUSTMENT')),
 qty numeric not null, breakdown_id uuid references breakdowns, by_user uuid, at timestamptz default now());
create or replace function spare_stock() returns trigger language plpgsql security definer set search_path=public as $$
begin update spares set stock = case new.kind when 'IN' then stock+new.qty when 'OUT' then stock-new.qty else new.qty end where id=new.spare_id; return new; end $$;
create trigger t_spare after insert on spare_txns for each row execute function spare_stock();

create table pm_master(id uuid primary key default gen_random_uuid(), machine_id uuid references machines, task text not null, frequency_days int not null, checklist jsonb default '[]');
create table pm_schedule(id uuid primary key default gen_random_uuid(), pm_id uuid references pm_master, due_date date not null, completed_at timestamptz, completed_by uuid references profiles, checklist_result jsonb);

create view bd_view with (security_invoker=true) as
select b.*, m.machine_no, m.name machine_name, m.type machine_type, m.department, m.loss_per_hour,
 to_char(b.reported_at at time zone 'Asia/Kolkata','Mon-YYYY') as month,
 extract(epoch from (b.accepted_at-b.reported_at))/60 response_min,
 extract(epoch from (b.completed_at-b.started_at))/60 repair_min,
 extract(epoch from (coalesce(b.closed_at,now())-b.reported_at))/60 downtime_min,
 extract(epoch from (coalesce(b.closed_at,now())-b.reported_at))/3600*coalesce(m.loss_per_hour,0) production_loss,
 ru.full_name reported_by_name, au.full_name accepted_by_name, su.full_name started_by_name, vu.full_name verified_by_name
from breakdowns b left join machines m on m.id=b.machine_id left join profiles ru on ru.id=b.reported_by
 left join profiles au on au.id=b.accepted_by left join profiles su on su.id=b.started_by left join profiles vu on vu.id=b.verified_by;

-- helpers
create or replace function my_role() returns text language sql stable security definer set search_path=public as
$$ select role from profiles where id=auth.uid() and active $$;

create or replace function notify(p_role text, p_bd uuid, p_type text, p_title text, p_msg text) returns void language sql security definer set search_path=public as
$$ insert into notifications(user_id,breakdown_id,type,title,message) select id,p_bd,p_type,p_title,p_msg from profiles where role=p_role and active $$;

create or replace function audit(p_me profiles, p_action text, p_type text, p_rec text, p_old text, p_new text) returns void language sql security definer set search_path=public as
$$ insert into audit_logs(user_id,user_name,role,action,record_type,record_id,old_value,new_value) values(p_me.id,p_me.full_name,p_me.role,p_action,p_type,p_rec,p_old,p_new) $$;

create or replace function report_breakdown(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare me profiles; n int; v_uid text; v_id uuid;
begin
 select * into me from profiles where id=auth.uid() and active;
 if me.id is null or me.role not in ('PRODUCTION','ADMIN') then raise exception 'Not allowed'; end if;
 perform pg_advisory_xact_lock(7001);
 select count(*)+1 into n from breakdowns where (reported_at at time zone 'Asia/Kolkata')::date=(now() at time zone 'Asia/Kolkata')::date;
 v_uid:='BD-'||to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD')||'-'||lpad(n::text,4,'0');
 insert into breakdowns(uid,machine_id,shift,bd_category,bd_type,problem,priority,machine_stopped,reported_by,updated_by)
 values(v_uid,(p->>'machine_id')::uuid,p->>'shift',p->>'bd_category',p->>'bd_type',p->>'problem',coalesce(p->>'priority','MEDIUM'),coalesce((p->>'machine_stopped')::boolean,true),me.id,me.id) returning id into v_id;
 insert into breakdown_events(breakdown_id,event,status,user_id,user_name,role) values(v_id,'Breakdown reported','NEW',me.id,me.full_name,me.role);
 perform audit(me,'Breakdown created','breakdown',v_uid,null,'NEW');
 perform notify('MAINTENANCE',v_id,'NEW_BD','New breakdown '||v_uid,'New breakdown '||v_uid||' reported: '||(p->>'problem'));
 return v_id;
end $$;

create or replace function bd_action(p_id uuid, p_action text, p jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare me profiles; b breakdowns; ns text; ev text; ok boolean;
begin
 select * into me from profiles where id=auth.uid() and active;
 if me.id is null then raise exception 'No access'; end if;
 select * into b from breakdowns where id=p_id for update;
 if b.id is null then raise exception 'Not found'; end if;
 if p_action='accept' and me.role in('MAINTENANCE','ADMIN') and b.status in('NEW','REOPENED') then
  ns:='ACCEPTED'; ev:='Accepted by Maintenance';
  update breakdowns set status=ns,accepted_at=now(),accepted_by=me.id where id=p_id;
  perform notify('PRODUCTION',p_id,'ACCEPTED',b.uid||' accepted',b.uid||' accepted by '||me.full_name);
 elsif p_action='start' and me.role in('MAINTENANCE','ADMIN') and b.status='ACCEPTED' then
  ns:='UNDER MAINTENANCE'; ev:='Maintenance started';
  update breakdowns set status=ns,started_at=now(),started_by=me.id where id=p_id;
  perform notify('PRODUCTION',p_id,'STARTED',b.uid||' under maintenance',b.uid||' maintenance started by '||me.full_name);
 elsif p_action='complete' and me.role in('MAINTENANCE','ADMIN') and b.status='UNDER MAINTENANCE' then
  ns:='WAITING FOR PRODUCTION VERIFICATION'; ev:='Maintenance completed';
  update breakdowns set status=ns,completed_at=now(),completed_by=me.id,root_cause=p->>'root_cause',action_taken=p->>'action_taken',
   delay_reason=p->>'delay_reason',service_cost=coalesce(service_cost,0)+coalesce(nullif(p->>'service_cost','')::numeric,0),sp_cost=coalesce(sp_cost,0)+coalesce(nullif(p->>'sp_cost','')::numeric,0),
   spare_used=concat_ws(', ',nullif(spare_used,''),nullif(p->>'spare_used','')),carried_out_by=p->>'carried_out_by',m_remarks=p->>'m_remarks' where id=p_id;
  perform notify('PRODUCTION',p_id,'COMPLETED','Verification required','Maintenance completed for '||b.uid||'. Machine verification required.');
 elsif p_action='verify' and me.role in('PRODUCTION','ADMIN') and b.status='WAITING FOR PRODUCTION VERIFICATION' then
  ok:=(p->>'ok')::boolean;
  if ok then ns:='CLOSED'; ev:='Production verified machine OK - breakdown closed';
   update breakdowns set status=ns,machine_ok=true,verified_at=now(),verified_by=me.id,closed_at=now(),v_remarks=p->>'remarks' where id=p_id;
  else
   if coalesce(p->>'reason','')='' then raise exception 'Reopen reason required'; end if;
   ns:='REOPENED'; ev:='Reopened by Production: '||(p->>'reason');
   update breakdowns set status=ns,machine_ok=false,reopen_reason=p->>'reason',reopened_at=now(),reopened_by=me.id,verified_at=now(),verified_by=me.id,closed_at=null where id=p_id;
   perform notify('MAINTENANCE',p_id,'REOPENED',b.uid||' reopened',b.uid||' has been reopened by Production.');
  end if;
 else raise exception 'Action % not allowed for role % in status %',p_action,me.role,b.status; end if;
 update breakdowns set updated_at=now(),updated_by=me.id where id=p_id;
 insert into breakdown_events(breakdown_id,event,status,user_id,user_name,role) values(p_id,ev,ns,me.id,me.full_name,me.role);
 perform audit(me,'Status changed','breakdown',b.uid,b.status,ns);
end $$;

create or replace function log_login() returns void language sql security definer set search_path=public as
$$ select audit(p,'Login','user',p.username,null,null) from profiles p where id=auth.uid() $$;

-- user management (username -> internal email username@factory.local)
create or replace function _mk_user(u text,pw text,nm text,code text,dept text,r text) returns uuid language plpgsql security definer set search_path=public,auth,extensions as $$
declare uid uuid:=gen_random_uuid(); em text:=lower(u)||'@factory.local';
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
 values('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',em,crypt(pw,gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
 values(gen_random_uuid(),uid,uid::text,jsonb_build_object('sub',uid::text,'email',em),'email',now(),now(),now());
 insert into profiles(id,username,full_name,emp_code,department,role) values(uid,lower(u),nm,code,dept,r);
 return uid;
end $$;
revoke all on function _mk_user from public,anon,authenticated;

create or replace function create_user(u text,pw text,nm text,code text,dept text,r text) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid;
begin
 if my_role()<>'ADMIN' then raise exception 'Admin only'; end if;
 id:=_mk_user(u,pw,nm,code,dept,r);
 perform audit((select p from profiles p where p.id=auth.uid()),'User created','user',lower(u),null,r);
 return id;
end $$;
create or replace function set_user_active(uid uuid, a boolean) returns void language plpgsql security definer set search_path=public as $$
begin if my_role()<>'ADMIN' then raise exception 'Admin only'; end if; update profiles set active=a where id=uid; end $$;
create or replace function reset_password(uid uuid, pw text) returns void language plpgsql security definer set search_path=public,auth,extensions as $$
begin if my_role()<>'ADMIN' then raise exception 'Admin only'; end if; update auth.users set encrypted_password=crypt(pw,gen_salt('bf')) where id=uid; end $$;

-- RLS: reads for signed-in users; ALL writes go through the functions above (admin can edit masters)
alter table profiles enable row level security; alter table machines enable row level security; alter table breakdowns enable row level security;
alter table breakdown_events enable row level security; alter table notifications enable row level security; alter table audit_logs enable row level security;
alter table spares enable row level security; alter table spare_txns enable row level security; alter table pm_master enable row level security; alter table pm_schedule enable row level security;
create policy r_prof on profiles for select to authenticated using (true);
create policy r_mach on machines for select to authenticated using (true);
create policy w_mach on machines for all to authenticated using (my_role()='ADMIN') with check (my_role()='ADMIN');
create policy r_bd on breakdowns for select to authenticated using (my_role() is not null);
create policy r_ev on breakdown_events for select to authenticated using (my_role() is not null);
create policy r_not on notifications for select to authenticated using (user_id=auth.uid() or my_role()='ADMIN');
create policy u_not on notifications for update to authenticated using (user_id=auth.uid());
create policy r_aud on audit_logs for select to authenticated using (my_role()='ADMIN');
create policy a_sp on spares for all to authenticated using (my_role() in ('ADMIN','MAINTENANCE')) with check (my_role() in ('ADMIN','MAINTENANCE'));
create policy a_spt on spare_txns for all to authenticated using (my_role() in ('ADMIN','MAINTENANCE')) with check (my_role() in ('ADMIN','MAINTENANCE'));
create policy a_pm on pm_master for all to authenticated using (my_role() in ('ADMIN','MAINTENANCE')) with check (my_role() in ('ADMIN','MAINTENANCE'));
create policy a_pms on pm_schedule for all to authenticated using (my_role() in ('ADMIN','MAINTENANCE')) with check (my_role() in ('ADMIN','MAINTENANCE'));
grant select on bd_view to authenticated;
alter publication supabase_realtime add table notifications, breakdowns;

-- First admin (CHANGE THE PASSWORD after first login via Users > Reset)
select _mk_user('admin','Admin@12345','Administrator','A001','Admin','ADMIN');
