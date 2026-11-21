begin;

create table public.campuscrew_stellar_escrows (
  request_id uuid primary key references public.campuscrew_stellar_bookings(request_id),
  chain_id text unique not null check (chain_id ~ '^[a-f0-9]{64}$'),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  token_id text not null check (token_id ~ '^C[A-Z2-7]{55}$'),
  resolver text not null check (resolver ~ '^G[A-Z2-7]{55}$'),
  organizer text not null references public.campuscrew_stellar_profiles(wallet),
  provider text not null references public.campuscrew_stellar_profiles(wallet),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  funding_deadline bigint not null,
  work_deadline bigint not null check (work_deadline > funding_deadline),
  chain_state text check (chain_state in ('Proposed','Funding','Funded','Submitted','Disputed','Paid','Refundable')),
  chain_data jsonb,
  checked_ledger bigint not null default 0,
  funding_tx text check (funding_tx ~ '^[a-f0-9]{64}$'),
  settlement_tx text check (settlement_tx ~ '^[a-f0-9]{64}$'),
  completion_note text check (char_length(completion_note) between 1 and 750),
  check (organizer <> provider and resolver <> organizer and resolver <> provider)
);

create table public.campuscrew_stellar_payment_intents (
  id uuid primary key,
  request_id uuid not null references public.campuscrew_stellar_escrows(request_id),
  wallet text not null references public.campuscrew_stellar_profiles(wallet),
  operation text not null check (operation in ('create','accept','fund','submit','release','claim','cancel','refund','dispute')),
  tx_hash text unique not null check (tx_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'prepared' check (status in ('prepared','submitted','confirmed','failed')),
  expires_at timestamptz not null,
  completion_note text check (char_length(completion_note) between 1 and 750),
  created_at timestamptz not null default now(),
  check ((operation = 'submit') = (completion_note is not null))
);
create index campuscrew_stellar_pending_payments on public.campuscrew_stellar_payment_intents(request_id, status);

alter table public.campuscrew_stellar_escrows enable row level security;
alter table public.campuscrew_stellar_payment_intents enable row level security;
revoke all on public.campuscrew_stellar_escrows, public.campuscrew_stellar_payment_intents from public, anon, authenticated;
grant select, insert, update on public.campuscrew_stellar_escrows, public.campuscrew_stellar_payment_intents to service_role;

create function public.campuscrew_stellar_prepare_escrow(
  p_wallet text, p_request_id uuid, p_chain_id text, p_contract text, p_token text, p_resolver text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  terms public.campuscrew_stellar_escrows;
  owner_wallet text;
  provider_wallet text;
  agreed_amount numeric;
begin
  perform 1 from public.campuscrew_stellar_bookings where request_id = p_request_id for update;
  if not found then raise exception 'Booking unavailable'; end if;
  select t.requester_wallet, a.provider_wallet, b.amount into owner_wallet, provider_wallet, agreed_amount
    from public.campuscrew_stellar_bookings b
    join public.campuscrew_stellar_tasks t on t.id = b.request_id
    join public.campuscrew_stellar_applications a on a.id = b.application_id
    where b.request_id = p_request_id;
  if owner_wallet <> p_wallet then raise exception 'Only the task owner can create this escrow'; end if;
  select * into terms from public.campuscrew_stellar_escrows where request_id = p_request_id;
  if found then
    if terms.contract_id <> p_contract or terms.token_id <> p_token or terms.resolver <> p_resolver or terms.chain_id <> p_chain_id then
      raise exception 'This booking belongs to a different escrow deployment';
    end if;
    return to_jsonb(terms);
  end if;
  insert into public.campuscrew_stellar_escrows(request_id,chain_id,contract_id,token_id,resolver,organizer,provider,amount,funding_deadline,work_deadline)
    values (p_request_id,p_chain_id,p_contract,p_token,p_resolver,owner_wallet,provider_wallet,agreed_amount,
      extract(epoch from now())::bigint + 86400, extract(epoch from now())::bigint + 1209600)
    returning * into terms;
  return to_jsonb(terms);
end;
$$;

-- A late response may add its verified receipt, but cannot roll the cached chain state backwards.
create function public.campuscrew_stellar_record_escrow(
  p_request_id uuid, p_ledger bigint, p_state text, p_data jsonb,
  p_intent_id uuid default null, p_tx_hash text default null
) returns void language plpgsql set search_path = '' as $$
declare intent public.campuscrew_stellar_payment_intents;
begin
  perform 1 from public.campuscrew_stellar_escrows where request_id = p_request_id for update;
  if not found then raise exception 'Escrow unavailable'; end if;
  if p_intent_id is not null then
    select * into intent from public.campuscrew_stellar_payment_intents where id = p_intent_id for update;
    if not found or intent.request_id <> p_request_id or intent.tx_hash <> p_tx_hash then
      raise exception 'Payment receipt does not match this booking';
    end if;
  end if;
  update public.campuscrew_stellar_escrows set
    chain_state = case when p_ledger >= checked_ledger then p_state else chain_state end,
    chain_data = case when p_ledger >= checked_ledger then p_data else chain_data end,
    checked_ledger = greatest(checked_ledger, p_ledger),
    funding_tx = case when intent.operation = 'fund' then intent.tx_hash else funding_tx end,
    settlement_tx = case when intent.operation in ('release','claim','refund') then intent.tx_hash else settlement_tx end,
    completion_note = case when intent.operation = 'submit' then intent.completion_note else completion_note end
    where request_id = p_request_id;
  if p_intent_id is not null then
    update public.campuscrew_stellar_payment_intents set status = 'confirmed' where id = p_intent_id;
  end if;
end;
$$;

revoke execute on function public.campuscrew_stellar_prepare_escrow(text,uuid,text,text,text,text),
  public.campuscrew_stellar_record_escrow(uuid,bigint,text,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.campuscrew_stellar_prepare_escrow(text,uuid,text,text,text,text),
  public.campuscrew_stellar_record_escrow(uuid,bigint,text,jsonb,uuid,text) to service_role;
commit;
