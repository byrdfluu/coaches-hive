-- Canonicalize U.S. family phone numbers for API and direct mobile writes.

create or replace function public.canonical_us_phone(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g');
begin
  if digits = '' then return null; end if;
  if length(digits) = 11 and left(digits, 1) = '1' then digits := right(digits, 10); end if;
  if length(digits) <> 10 then return value; end if;
  return '(' || left(digits, 3) || ') ' || substring(digits from 4 for 3) || '-' || right(digits, 4);
end;
$$;

create or replace function public.normalize_profile_guardian_phone()
returns trigger language plpgsql set search_path = public as $$
begin
  new.guardian_phone := public.canonical_us_phone(new.guardian_phone);
  return new;
end;
$$;

drop trigger if exists normalize_profile_guardian_phone on public.profiles;
create trigger normalize_profile_guardian_phone
before insert or update of guardian_phone on public.profiles
for each row execute function public.normalize_profile_guardian_phone();

create or replace function public.normalize_emergency_contact_phone()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone := public.canonical_us_phone(new.phone);
  return new;
end;
$$;

drop trigger if exists normalize_emergency_contact_phone on public.emergency_contacts;
create trigger normalize_emergency_contact_phone
before insert or update of phone on public.emergency_contacts
for each row execute function public.normalize_emergency_contact_phone();

update public.profiles
set guardian_phone = public.canonical_us_phone(guardian_phone)
where guardian_phone is not null
  and guardian_phone is distinct from public.canonical_us_phone(guardian_phone);

update public.emergency_contacts
set phone = public.canonical_us_phone(phone)
where phone is not null
  and phone is distinct from public.canonical_us_phone(phone);

notify pgrst, 'reload schema';
