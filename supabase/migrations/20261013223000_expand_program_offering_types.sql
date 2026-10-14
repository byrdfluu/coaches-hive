begin;
alter table public.programs drop constraint if exists programs_type_check;
alter table public.programs add constraint programs_type_check check(type in ('camp','clinic','league','program','course','academy','workshop','event'));
notify pgrst,'reload schema';
commit;
