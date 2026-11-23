begin;
create function public.campuscrew_experience_refund_event() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='confirmed' and old.status is distinct from 'confirmed' and new.operation='refund' then
 perform public.campuscrew_experience_event(new.request_id,'refund:'||new.tx_hash,'Contribution refunded - funds returned');
 end if;
 return new;
end; $$;
create trigger campuscrew_refund_notice after update on public.campuscrew_stellar_payment_intents for each row execute function public.campuscrew_experience_refund_event();
revoke execute on function public.campuscrew_experience_refund_event() from public,anon,authenticated;
grant execute on function public.campuscrew_experience_refund_event() to service_role;
notify pgrst,'reload schema';
commit;
