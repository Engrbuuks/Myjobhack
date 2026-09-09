-- 0056 · Repair phone numbers stored before the apply form validated them.
--
-- Applications taken before validation hold whatever the person typed, which
-- in Nigeria is almost always the local form: 09029815294. That is correct on
-- a handset and useless anywhere international. A WhatsApp link built from it
-- becomes wa.me/09029815294, and since no country has dialling code 0, the
-- chat never opens.
--
-- The leading zero is a national trunk prefix. It has to be REPLACED by the
-- country code, not merely stripped or kept.
--
-- Conservative on purpose: only numbers that are unambiguously local Nigerian
-- eleven digit numbers, or ten digit numbers missing the zero, are touched.
-- Anything already international, or any shape that could mean more than one
-- thing, is left exactly as it is. A wrong number is worse than a missing one.

begin;

-- 1 · Local eleven digit form: 0XXXXXXXXXX  ->  +234XXXXXXXXXX
update applications
   set guest_phone = '+234' || substring(regexp_replace(guest_phone, '\D', '', 'g') from 2)
 where guest_phone is not null
   and regexp_replace(guest_phone, '\D', '', 'g') ~ '^0[789]\d{9}$';

-- 2 · Ten digits with the zero already dropped: XXXXXXXXXX -> +234XXXXXXXXXX
update applications
   set guest_phone = '+234' || regexp_replace(guest_phone, '\D', '', 'g')
 where guest_phone is not null
   and regexp_replace(guest_phone, '\D', '', 'g') ~ '^[789]\d{9}$';

-- 3 · Country code present but no plus: 234XXXXXXXXXX -> +234XXXXXXXXXX
update applications
   set guest_phone = '+' || regexp_replace(guest_phone, '\D', '', 'g')
 where guest_phone is not null
   and guest_phone not like '+%'
   and regexp_replace(guest_phone, '\D', '', 'g') ~ '^234[789]\d{9}$';

-- 4 · Already correct but carrying spaces or dashes: tidy to bare E.164.
update applications
   set guest_phone = '+' || regexp_replace(guest_phone, '\D', '', 'g')
 where guest_phone is not null
   and guest_phone like '+%'
   and guest_phone <> '+' || regexp_replace(guest_phone, '\D', '', 'g');

-- The same four passes for registered users.
update profiles
   set phone = '+234' || substring(regexp_replace(phone, '\D', '', 'g') from 2)
 where phone is not null and regexp_replace(phone, '\D', '', 'g') ~ '^0[789]\d{9}$';

update profiles
   set phone = '+234' || regexp_replace(phone, '\D', '', 'g')
 where phone is not null and regexp_replace(phone, '\D', '', 'g') ~ '^[789]\d{9}$';

update profiles
   set phone = '+' || regexp_replace(phone, '\D', '', 'g')
 where phone is not null and phone not like '+%'
   and regexp_replace(phone, '\D', '', 'g') ~ '^234[789]\d{9}$';

update profiles
   set phone = '+' || regexp_replace(phone, '\D', '', 'g')
 where phone is not null and phone like '+%'
   and phone <> '+' || regexp_replace(phone, '\D', '', 'g');

commit;

-- What is left unrepaired, and why. Run this after, and check by hand:
--
--   select guest_phone, count(*)
--     from applications
--    where guest_phone is not null and guest_phone not like '+%'
--    group by 1 order by 2 desc;
--
-- Anything listed is a shape this migration would not guess at: too short,
-- too long, or a foreign number written locally. Those need a person to look.
