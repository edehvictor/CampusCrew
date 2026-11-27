begin;
create table public.campuscrew_dispute_cases (
 request_id uuid primary key references public.campuscrew_stellar_escrows(request_id),
 opened_by text, reason text not null, summary text not null check(char_length(summary) between 1 and 2000),
 review_status text not null default 'open' check(review_status in ('open','reviewing')),
 created_at timestamptz not null default now()
);
create table public.campuscrew_dispute_statements (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.campuscrew_dispute_cases(request_id),
 wallet text not null, body text not null check(char_length(body) between 1 and 2000),
 client_id uuid not null, created_at timestamptz not null default now(), unique(wallet,client_id)
);
create table public.campuscrew_dispute_decisions (
 id uuid primary key, request_id uuid not null references public.campuscrew_dispute_cases(request_id),
 wallet text not null, provider_units numeric(20,0) not null check(provider_units>=0),
 rationale text not null check(char_length(rationale) between 20 and 2000),
 tx_hash text not null unique check(tx_hash ~ '^[0-9a-f]{64}$'), unsigned_xdr text not null,
 status text not null default 'prepared' check(status in ('prepared','submitted','confirmed','failed')),
 expires_at timestamptz not null, created_at timestamptz not null default now(), confirmed_at timestamptz
);
create index campuscrew_decision_pending on public.campuscrew_dispute_decisions(status,created_at);
-- Import live disputes opened directly on-chain or before this interface existed.
insert into public.campuscrew_dispute_cases(request_id,reason,summary)
 select request_id,'Other','Dispute opened on-chain. Participant statements have not been provided.'
 from public.campuscrew_stellar_escrows where chain_state='Disputed';

create function public.campuscrew_dispute_report(p_wallet text,p_request_id uuid,p_reason text,p_summary text)
returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows;
begin
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or p_wallet not in(e.organizer,e.provider) then raise exception 'This booking is private';end if;
 if e.chain_state not in ('Funded','Submitted','Disputed') then raise exception 'This booking is not available for a dispute';end if;
 if p_reason not in('Not delivered','Incomplete work','Quality issue','Missed deadline','Payment issue','Other')
 or char_length(trim(p_summary)) not between 20 and 2000 then raise exception 'Describe the problem in at least 20 characters';end if;
 insert into public.campuscrew_dispute_cases(request_id,opened_by,reason,summary)
 values(p_request_id,p_wallet,p_reason,trim(p_summary)) on conflict(request_id) do nothing;
 perform public.campuscrew_experience_event(p_request_id,'case:'||p_request_id,'A dispute report was saved - on-chain pause still requires wallet confirmation');
end; $$;

create function public.campuscrew_dispute_statement(p_wallet text,p_request_id uuid,p_body text,p_client_id uuid)
returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows;
begin
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or not exists(select 1 from public.campuscrew_dispute_cases where request_id=p_request_id)
 or (p_wallet not in(e.organizer,e.provider) and p_wallet<>e.resolver) then raise exception 'This case is private';end if;
 if e.chain_state not in('Funded','Submitted','Disputed') then raise exception 'This case is settled';end if;
 if char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Write a statement';end if;
 if exists(select 1 from public.campuscrew_dispute_statements where wallet=p_wallet and client_id=p_client_id and request_id<>p_request_id)
 then raise exception 'Statement belongs to a different case';end if;
 if (select count(*) from public.campuscrew_dispute_statements where wallet=p_wallet and created_at>now()-interval '1 minute')>=10
 then raise exception 'Wait a moment before adding another statement';end if;
 insert into public.campuscrew_dispute_statements(request_id,wallet,body,client_id)
 values(p_request_id,p_wallet,trim(p_body),p_client_id) on conflict(wallet,client_id) do nothing;
 perform public.campuscrew_experience_event(p_request_id,'case-statement:'||p_client_id,'A new dispute statement is available');
end; $$;

create function public.campuscrew_dispute_review(p_wallet text,p_request_id uuid)
returns void language plpgsql set search_path='' as $$
begin
 perform 1 from public.campuscrew_stellar_escrows where request_id=p_request_id and resolver=p_wallet and chain_state='Disputed' for update;
 if not found then raise exception 'Only the configured resolver can review an open dispute';end if;
 update public.campuscrew_dispute_cases set review_status='reviewing' where request_id=p_request_id;
 if not found then raise exception 'Case unavailable';end if;
 perform public.campuscrew_experience_event(p_request_id,'case-review:'||p_request_id,'The resolver is reviewing your dispute');
end; $$;

create function public.campuscrew_dispute_confirm(p_id uuid,p_ledger bigint,p_at timestamptz)
returns void language plpgsql set search_path='' as $$
declare d public.campuscrew_dispute_decisions; e public.campuscrew_stellar_escrows;
begin
 select * into d from public.campuscrew_dispute_decisions where id=p_id for update;
 if not found then raise exception 'Decision unavailable';end if;
 if d.status='confirmed' then return;end if;
 select * into e from public.campuscrew_stellar_escrows where request_id=d.request_id for update;
 if e.resolver<>d.wallet or e.chain_state not in('Paid','Refundable') or e.checked_ledger<p_ledger
 or d.provider_units<>((e.chain_data->>'funded')::numeric-(e.chain_data->>'refund_pool')::numeric)
 then raise exception 'Decision does not match the confirmed settlement';end if;
 update public.campuscrew_dispute_decisions set status='confirmed',confirmed_at=p_at where id=p_id;
 perform public.campuscrew_experience_event(d.request_id,'case-resolved:'||d.tx_hash,'Dispute resolved - view the decision and payment breakdown');
end; $$;

-- Existing work evidence stays private. Both participants may add dispute files
-- while payout is paused, with a per-uploader quota so neither blocks the other.
create or replace function public.campuscrew_experience_evidence(p_wallet text,p_request_id uuid,p_id uuid,p_name text,p_path text,p_mime text,p_bytes integer)
returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows;
begin
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or not ((e.provider=p_wallet and e.chain_state='Funded')
  or (p_wallet in(e.organizer,e.provider) and e.chain_state='Disputed'))
 then raise exception 'Upload evidence as a participant in the permitted booking state';end if;
 if (select count(*) from public.campuscrew_booking_evidence where request_id=p_request_id and uploader=p_wallet)>=3
 then raise exception 'Up to three evidence files per person per booking';end if;
 insert into public.campuscrew_booking_evidence(id,request_id,uploader,name,object_path,mime,bytes)
 values(p_id,p_request_id,p_wallet,p_name,p_path,p_mime,p_bytes);
end; $$;

do $$ declare tab text;begin
 foreach tab in array array['campuscrew_dispute_cases','campuscrew_dispute_statements','campuscrew_dispute_decisions'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant select,insert,update on public.%I to service_role',tab);
 end loop;
end; $$;
revoke execute on function public.campuscrew_dispute_report(text,uuid,text,text),public.campuscrew_dispute_statement(text,uuid,text,uuid),
 public.campuscrew_dispute_review(text,uuid),public.campuscrew_dispute_confirm(uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.campuscrew_dispute_report(text,uuid,text,text),public.campuscrew_dispute_statement(text,uuid,text,uuid),
 public.campuscrew_dispute_review(text,uuid),public.campuscrew_dispute_confirm(uuid,bigint,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
