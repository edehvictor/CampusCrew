-- Stellar accounts use address ownership proofs and server-owned sessions.
-- These tables keep Stellar Testnet activity identifiable alongside earlier pilot data.
begin;

create table public.campuscrew_stellar_challenges (
  id uuid primary key,
  wallet text not null check (wallet ~ '^G[A-Z2-7]{55}$'),
  binding_hash text not null check (binding_hash ~ '^[0-9a-f]{64}$'),
  message text not null,
  origin text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index campuscrew_stellar_challenges_by_wallet on public.campuscrew_stellar_challenges(wallet, created_at);
create index campuscrew_stellar_challenges_by_expiry on public.campuscrew_stellar_challenges(expires_at);

create table public.campuscrew_stellar_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  wallet text not null check (wallet ~ '^G[A-Z2-7]{55}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index campuscrew_stellar_sessions_by_expiry on public.campuscrew_stellar_sessions(expires_at);

create table public.campuscrew_stellar_profiles (
  wallet text primary key check (wallet ~ '^G[A-Z2-7]{55}$'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  area text not null check (area in ('On campus', 'Around Nsukka', 'Online')),
  skills text[] not null default '{}',
  coverage text[] not null default '{}',
  bio text not null default '' check (char_length(bio) <= 300),
  check (skills <@ array['Cleaning', 'Hair & beauty', 'Tutoring', 'Repairs', 'Tech & design', 'Errands']),
  check (coverage <@ array['On campus', 'Around Nsukka', 'Online']),
  check ((cardinality(skills) = 0) = (cardinality(coverage) = 0))
);

create table public.campuscrew_stellar_tasks (
  id uuid primary key,
  requester_wallet text not null references public.campuscrew_stellar_profiles(wallet),
  network text not null default 'stellar-testnet' check (network = 'stellar-testnet'),
  asset text not null default 'USDC' check (asset = 'USDC'),
  title text not null check (char_length(title) between 1 and 100),
  category text not null check (category in ('Cleaning', 'Hair & beauty', 'Tutoring', 'Repairs', 'Tech & design', 'Errands')),
  area text not null check (area in ('On campus', 'Around Nsukka', 'Online')),
  timing text not null check (char_length(timing) between 1 and 80),
  budget numeric(12,2) not null check (budget > 0 and budget <= 1000000),
  scope text not null check (char_length(scope) between 1 and 750),
  created_at timestamptz not null default now()
);

create table public.campuscrew_stellar_applications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.campuscrew_stellar_tasks(id),
  provider_wallet text not null references public.campuscrew_stellar_profiles(wallet),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  availability text not null check (char_length(availability) between 1 and 80),
  note text not null check (char_length(note) between 1 and 750),
  created_at timestamptz not null default now(),
  unique (request_id, provider_wallet),
  unique (request_id, id)
);

create table public.campuscrew_stellar_bookings (
  request_id uuid primary key references public.campuscrew_stellar_tasks(id),
  application_id uuid not null,
  foreign key (request_id, application_id) references public.campuscrew_stellar_applications(request_id, id),
  network text not null default 'stellar-testnet' check (network = 'stellar-testnet'),
  asset text not null default 'USDC' check (asset = 'USDC'),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  created_at timestamptz not null default now()
);
create index campuscrew_stellar_tasks_by_owner on public.campuscrew_stellar_tasks(requester_wallet);
create index campuscrew_stellar_applications_by_provider on public.campuscrew_stellar_applications(provider_wallet);

alter table public.campuscrew_stellar_challenges enable row level security;
alter table public.campuscrew_stellar_sessions enable row level security;
alter table public.campuscrew_stellar_profiles enable row level security;
alter table public.campuscrew_stellar_tasks enable row level security;
alter table public.campuscrew_stellar_applications enable row level security;
alter table public.campuscrew_stellar_bookings enable row level security;

revoke all on public.campuscrew_stellar_challenges, public.campuscrew_stellar_sessions,
  public.campuscrew_stellar_profiles, public.campuscrew_stellar_tasks,
  public.campuscrew_stellar_applications, public.campuscrew_stellar_bookings
  from public, anon, authenticated;
grant select, insert, update, delete on public.campuscrew_stellar_challenges, public.campuscrew_stellar_sessions to service_role;
grant select, insert, update on public.campuscrew_stellar_profiles, public.campuscrew_stellar_tasks,
  public.campuscrew_stellar_applications, public.campuscrew_stellar_bookings to service_role;

create function public.campuscrew_stellar_issue_challenge(
  p_id uuid, p_wallet text, p_binding_hash text, p_message text, p_origin text
) returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_wallet, 0));
  delete from public.campuscrew_stellar_challenges where expires_at < now() - interval '1 hour';
  delete from public.campuscrew_stellar_sessions where expires_at < now();
  if (select count(*) from public.campuscrew_stellar_challenges
      where wallet = p_wallet and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'Too many sign-in attempts. Wait a minute and try again.';
  end if;
  insert into public.campuscrew_stellar_challenges(id, wallet, binding_hash, message, origin, expires_at)
  values (p_id, p_wallet, p_binding_hash, p_message, p_origin, now() + interval '5 minutes');
end;
$$;

create function public.campuscrew_stellar_consume_challenge(
  p_id uuid, p_wallet text, p_binding_hash text, p_origin text, p_token_hash text
) returns void language plpgsql set search_path = '' as $$
begin
  update public.campuscrew_stellar_challenges set consumed_at = now()
  where id = p_id and wallet = p_wallet and binding_hash = p_binding_hash and origin = p_origin
    and consumed_at is null and expires_at > now();
  if not found then
    raise exception 'Sign-in expired or already used. Connect your wallet again.';
  end if;
  insert into public.campuscrew_stellar_sessions(token_hash, wallet, expires_at)
  values (p_token_hash, p_wallet, now() + interval '7 days');
end;
$$;

create function public.campuscrew_stellar_apply(
  p_wallet text, p_request_id uuid, p_amount numeric, p_availability text, p_note text
) returns void language plpgsql set search_path = '' as $$
declare task public.campuscrew_stellar_tasks;
begin
  select * into task from public.campuscrew_stellar_tasks where id = p_request_id for update;
  if not found or task.requester_wallet = p_wallet
    or exists (select 1 from public.campuscrew_stellar_bookings where request_id = p_request_id) then
    raise exception 'Task unavailable';
  end if;
  if not exists (select 1 from public.campuscrew_stellar_profiles where wallet = p_wallet
    and task.category = any(skills) and task.area = any(coverage)) then
    raise exception 'Add this service and coverage area to your profile before applying';
  end if;
  insert into public.campuscrew_stellar_applications(request_id, provider_wallet, amount, availability, note)
  values (p_request_id, p_wallet, p_amount, p_availability, p_note)
  on conflict (request_id, provider_wallet) do nothing;
end;
$$;

create function public.campuscrew_stellar_select_provider(
  p_wallet text, p_request_id uuid, p_application_id uuid
) returns void language plpgsql set search_path = '' as $$
declare
  task public.campuscrew_stellar_tasks;
  application public.campuscrew_stellar_applications;
  selected uuid;
begin
  select * into task from public.campuscrew_stellar_tasks where id = p_request_id for update;
  if not found or task.requester_wallet <> p_wallet then raise exception 'Task unavailable'; end if;
  select application_id into selected from public.campuscrew_stellar_bookings where request_id = p_request_id;
  if found then
    if selected = p_application_id then return; end if;
    raise exception 'A provider has already been selected';
  end if;
  select * into application from public.campuscrew_stellar_applications
    where id = p_application_id and request_id = p_request_id and provider_wallet <> p_wallet;
  if not found then raise exception 'Application unavailable'; end if;
  insert into public.campuscrew_stellar_bookings(request_id, application_id, amount)
    values (p_request_id, p_application_id, application.amount);
end;
$$;

create function public.campuscrew_stellar_board(p_wallet text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'category', t.category, 'area', t.area, 'timing', t.timing,
    'budget', t.budget, 'scope', t.scope, 'customer', owner.display_name,
    'own', coalesce(t.requester_wallet = p_wallet, false),
    'applicationCount', (select count(*) from public.campuscrew_stellar_applications where request_id = t.id),
    'accepted', case when t.requester_wallet = p_wallet or selected.provider_wallet = p_wallet then b.application_id end,
    'status', case when b.request_id is null then 'Open' else 'Awaiting funding' end,
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'provider', profile.display_name, 'own', a.provider_wallet = p_wallet,
        'amount', a.amount, 'availability', a.availability, 'note', a.note,
        'bio', profile.bio, 'skills', profile.skills, 'coverage', profile.coverage
      ) order by a.created_at)
      from public.campuscrew_stellar_applications a
      join public.campuscrew_stellar_profiles profile on profile.wallet = a.provider_wallet
      where a.request_id = t.id and (t.requester_wallet = p_wallet or a.provider_wallet = p_wallet)
    ), '[]'::jsonb)
  ) order by t.created_at desc), '[]'::jsonb)
  from public.campuscrew_stellar_tasks t
  join public.campuscrew_stellar_profiles owner on owner.wallet = t.requester_wallet
  left join public.campuscrew_stellar_bookings b on b.request_id = t.id
  left join public.campuscrew_stellar_applications selected on selected.id = b.application_id
  where b.request_id is null or t.requester_wallet = p_wallet
    or exists (select 1 from public.campuscrew_stellar_applications a where a.request_id = t.id and a.provider_wallet = p_wallet);
$$;

revoke execute on function public.campuscrew_stellar_issue_challenge(uuid,text,text,text,text),
  public.campuscrew_stellar_consume_challenge(uuid,text,text,text,text),
  public.campuscrew_stellar_apply(text,uuid,numeric,text,text),
  public.campuscrew_stellar_select_provider(text,uuid,uuid), public.campuscrew_stellar_board(text)
  from public, anon, authenticated;
grant execute on function public.campuscrew_stellar_issue_challenge(uuid,text,text,text,text),
  public.campuscrew_stellar_consume_challenge(uuid,text,text,text,text),
  public.campuscrew_stellar_apply(text,uuid,numeric,text,text),
  public.campuscrew_stellar_select_provider(text,uuid,uuid), public.campuscrew_stellar_board(text)
  to service_role;

commit;
