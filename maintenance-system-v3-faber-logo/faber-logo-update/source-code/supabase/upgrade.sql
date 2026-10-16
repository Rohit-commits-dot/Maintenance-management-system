-- Run AFTER schema.sql (SQL Editor). Adds evidence storage, spare transactions, PM functions.
insert into storage.buckets(id,name,public) values('evidence','evidence',true) on conflict do nothing;
create policy ev_up on storage.objects for insert to authenticated with check (bucket_id='evidence');
create policy ev_rd on storage.objects for select using (bucket_id='evidence');

create or replace function set_evidence(p_id uuid,p_kind text,p_url text) returns void language plpgsql security definer set search_path=public as $$
declare me profiles; b breakdowns;
begin
 select * into me from profiles where id=auth.uid() and active; select * into b from breakdowns where id=p_id;
 if me.id is null or b.id is null then raise exception 'No access'; end if;
 if p_kind='production' and me.role in('PRODUCTION','ADMIN') then update breakdowns set photo_url=concat_ws(',',photo_url,p_url) where id=p_id;
 elsif p_kind='maintenance' and me.role in('MAINTENANCE','ADMIN') then update breakdowns set m_evidence=concat_ws(',',m_evidence,p_url) where id=p_id;
 elsif p_kind='verification' and me.role in('PRODUCTION','ADMIN') then update breakdowns set v_evidence=concat_ws(',',v_evidence,p_url) where id=p_id;
 else raise exception 'Not allowed'; end if;
 insert into breakdown_events(breakdown_id,event,status,user_id,user_name,role) values(p_id,'Evidence uploaded ('||p_kind||')',b.status,me.id,me.full_name,me.role);
 perform audit(me,'Evidence uploaded','breakdown',b.uid,null,p_url);
end $$;

create or replace function spare_txn(p_spare uuid,p_kind text,p_qty numeric,p_bd uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare me profiles; s spares; b breakdowns;
begin
 select * into me from profiles where id=auth.uid() and active;
 if me.id is null or me.role not in('ADMIN','MAINTENANCE') then raise exception 'Not allowed'; end if;
 select * into s from spares where id=p_spare for update;
 if p_kind='OUT' and s.stock<p_qty then raise exception 'Insufficient stock'; end if;
 insert into spare_txns(spare_id,kind,qty,breakdown_id,by_user) values(p_spare,p_kind,p_qty,p_bd,me.id);
 if p_kind='OUT' and p_bd is not null then
  update breakdowns set sp_cost=coalesce(sp_cost,0)+p_qty*s.unit_cost, spare_used=concat_ws(', ',spare_used,s.name||' x'||p_qty) where id=p_bd returning * into b;
  insert into breakdown_events(breakdown_id,event,status,user_id,user_name,role) values(p_bd,'Spare issued: '||s.name||' x'||p_qty,b.status,me.id,me.full_name,me.role);
 end if;
 perform audit(me,case when p_kind='OUT' then 'Spare issued' else 'Spare stock '||p_kind end,'spare',s.part_no,s.stock::text,p_qty::text);
end $$;

create or replace function pm_add(p_machine uuid,p_task text,p_freq int,p_checklist jsonb,p_first date) returns void language plpgsql security definer set search_path=public as $$
declare me profiles; m uuid;
begin
 select * into me from profiles where id=auth.uid() and active;
 if me.id is null or me.role not in('ADMIN','MAINTENANCE') then raise exception 'Not allowed'; end if;
 insert into pm_master(machine_id,task,frequency_days,checklist) values(p_machine,p_task,p_freq,p_checklist) returning id into m;
 insert into pm_schedule(pm_id,due_date) values(m,p_first);
 perform audit(me,'PM created','pm',p_task,null,null);
end $$;

create or replace function pm_complete(p_id uuid,p_result jsonb) returns void language plpgsql security definer set search_path=public as $$
declare me profiles; s pm_schedule; f int;
begin
 select * into me from profiles where id=auth.uid() and active;
 if me.id is null or me.role not in('ADMIN','MAINTENANCE') then raise exception 'Not allowed'; end if;
 select * into s from pm_schedule where id=p_id and completed_at is null for update;
 if s.id is null then raise exception 'Already completed'; end if;
 update pm_schedule set completed_at=now(),completed_by=me.id,checklist_result=p_result where id=p_id;
 select frequency_days into f from pm_master where id=s.pm_id;
 insert into pm_schedule(pm_id,due_date) values(s.pm_id,(now() at time zone 'Asia/Kolkata')::date+f);
 perform audit(me,'PM completed','pm',p_id::text,null,null);
end $$;

-- Hardening: only active staff can read people/machines; machine changes are audited; speed indexes
drop policy if exists r_prof on profiles;
create policy r_prof on profiles for select to authenticated using (my_role() is not null or id=auth.uid());
drop policy if exists r_mach on machines;
create policy r_mach on machines for select to authenticated using (my_role() is not null);
create or replace function trg_machine_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare me profiles;
begin select * into me from profiles where id=auth.uid();
 perform audit(me,case TG_OP when 'INSERT' then 'Machine created' else 'Machine edited' end,'machine',new.machine_no,null,new.name); return new; end $$;
create trigger t_mach_audit after insert or update on machines for each row execute function trg_machine_audit();
create index if not exists i_bd_status on breakdowns(status);
create index if not exists i_bd_rep on breakdowns(reported_at desc);
create index if not exists i_bd_mach on breakdowns(machine_id);
create index if not exists i_not_user on notifications(user_id,created_at desc);
create index if not exists i_ev_bd on breakdown_events(breakdown_id,at);
