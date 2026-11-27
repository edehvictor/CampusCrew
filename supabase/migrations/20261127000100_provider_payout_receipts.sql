begin;
alter table public.campuscrew_stellar_escrows
  add column provider_payout_tx text check(provider_payout_tx ~ '^[0-9a-f]{64}$'),
  add column provider_payout_amount numeric(20,7) check(provider_payout_amount > 0),
  add column provider_payout_at timestamptz;

-- Called only after the server verifies the successful transaction, exact
-- booking invocation, and token transfer against the on-chain booking.
create function public.campuscrew_stellar_record_provider_payout(
  p_request_id uuid, p_hash text, p_amount numeric, p_at timestamptz
) returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows;
begin
  select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
  if not found or e.chain_state not in ('Paid','Refundable') or e.chain_data is null
    or p_amount <= 0 or p_at is null
    or p_amount <> ((e.chain_data->>'funded')::numeric-(e.chain_data->>'refund_pool')::numeric)/10000000
    or p_amount > e.amount then raise exception 'Provider payout does not match the confirmed booking';end if;
  if e.provider_payout_tx is not null then
    if e.provider_payout_tx<>p_hash or e.provider_payout_amount<>p_amount then
      raise exception 'A different provider payout is already recorded';
    end if;
    return;
  end if;
  update public.campuscrew_stellar_escrows set provider_payout_tx=p_hash,
    provider_payout_amount=p_amount,provider_payout_at=p_at where request_id=p_request_id;
end; $$;
revoke execute on function public.campuscrew_stellar_record_provider_payout(uuid,text,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.campuscrew_stellar_record_provider_payout(uuid,text,numeric,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
