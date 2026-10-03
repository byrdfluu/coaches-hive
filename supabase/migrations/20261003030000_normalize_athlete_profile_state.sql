-- Normalize family-entered U.S. state values before athlete profile constraints run.
-- Mobile clients historically submitted a mix of full names, lowercase codes, and
-- blank strings. Keep the canonical database representation as a two-letter code.

create or replace function public.canonical_us_state(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case upper(regexp_replace(trim(coalesce(value, '')), '[^A-Za-z]', '', 'g'))
    when '' then null
    when 'AL' then 'AL' when 'ALABAMA' then 'AL'
    when 'AK' then 'AK' when 'ALASKA' then 'AK'
    when 'AZ' then 'AZ' when 'ARIZONA' then 'AZ'
    when 'AR' then 'AR' when 'ARKANSAS' then 'AR'
    when 'CA' then 'CA' when 'CALIFORNIA' then 'CA'
    when 'CO' then 'CO' when 'COLORADO' then 'CO'
    when 'CT' then 'CT' when 'CONNECTICUT' then 'CT'
    when 'DE' then 'DE' when 'DELAWARE' then 'DE'
    when 'DC' then 'DC' when 'DISTRICTOFCOLUMBIA' then 'DC'
    when 'FL' then 'FL' when 'FLORIDA' then 'FL'
    when 'GA' then 'GA' when 'GEORGIA' then 'GA'
    when 'HI' then 'HI' when 'HAWAII' then 'HI'
    when 'ID' then 'ID' when 'IDAHO' then 'ID'
    when 'IL' then 'IL' when 'ILLINOIS' then 'IL'
    when 'IN' then 'IN' when 'INDIANA' then 'IN'
    when 'IA' then 'IA' when 'IOWA' then 'IA'
    when 'KS' then 'KS' when 'KANSAS' then 'KS'
    when 'KY' then 'KY' when 'KENTUCKY' then 'KY'
    when 'LA' then 'LA' when 'LOUISIANA' then 'LA'
    when 'ME' then 'ME' when 'MAINE' then 'ME'
    when 'MD' then 'MD' when 'MARYLAND' then 'MD'
    when 'MA' then 'MA' when 'MASSACHUSETTS' then 'MA'
    when 'MI' then 'MI' when 'MICHIGAN' then 'MI'
    when 'MN' then 'MN' when 'MINNESOTA' then 'MN'
    when 'MS' then 'MS' when 'MISSISSIPPI' then 'MS'
    when 'MO' then 'MO' when 'MISSOURI' then 'MO'
    when 'MT' then 'MT' when 'MONTANA' then 'MT'
    when 'NE' then 'NE' when 'NEBRASKA' then 'NE'
    when 'NV' then 'NV' when 'NEVADA' then 'NV'
    when 'NH' then 'NH' when 'NEWHAMPSHIRE' then 'NH'
    when 'NJ' then 'NJ' when 'NEWJERSEY' then 'NJ'
    when 'NM' then 'NM' when 'NEWMEXICO' then 'NM'
    when 'NY' then 'NY' when 'NEWYORK' then 'NY'
    when 'NC' then 'NC' when 'NORTHCAROLINA' then 'NC'
    when 'ND' then 'ND' when 'NORTHDAKOTA' then 'ND'
    when 'OH' then 'OH' when 'OHIO' then 'OH'
    when 'OK' then 'OK' when 'OKLAHOMA' then 'OK'
    when 'OR' then 'OR' when 'OREGON' then 'OR'
    when 'PA' then 'PA' when 'PENNSYLVANIA' then 'PA'
    when 'RI' then 'RI' when 'RHODEISLAND' then 'RI'
    when 'SC' then 'SC' when 'SOUTHCAROLINA' then 'SC'
    when 'SD' then 'SD' when 'SOUTHDAKOTA' then 'SD'
    when 'TN' then 'TN' when 'TENNESSEE' then 'TN'
    when 'TX' then 'TX' when 'TEXAS' then 'TX'
    when 'UT' then 'UT' when 'UTAH' then 'UT'
    when 'VT' then 'VT' when 'VERMONT' then 'VT'
    when 'VA' then 'VA' when 'VIRGINIA' then 'VA'
    when 'WA' then 'WA' when 'WASHINGTON' then 'WA'
    when 'WV' then 'WV' when 'WESTVIRGINIA' then 'WV'
    when 'WI' then 'WI' when 'WISCONSIN' then 'WI'
    when 'WY' then 'WY' when 'WYOMING' then 'WY'
    when 'AS' then 'AS' when 'AMERICANSAMOA' then 'AS'
    when 'GU' then 'GU' when 'GUAM' then 'GU'
    when 'MP' then 'MP' when 'NORTHERNMARIANAISLANDS' then 'MP'
    when 'PR' then 'PR' when 'PUERTORICO' then 'PR'
    when 'VI' then 'VI' when 'USVIRGINISLANDS' then 'VI' when 'VIRGINISLANDS' then 'VI'
    else trim(value)
  end
$$;

create or replace function public.normalize_athlete_profile_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.state := public.canonical_us_state(new.state);
  return new;
end;
$$;

drop trigger if exists normalize_athlete_profile_state on public.athlete_profiles;
create trigger normalize_athlete_profile_state
before insert or update of state on public.athlete_profiles
for each row execute function public.normalize_athlete_profile_state();

-- Normalize existing recognizable values without changing other profile data.
update public.athlete_profiles
set state = public.canonical_us_state(state)
where state is not null
  and public.canonical_us_state(state) ~ '^[A-Z]{2}$'
  and state is distinct from public.canonical_us_state(state);

notify pgrst, 'reload schema';
