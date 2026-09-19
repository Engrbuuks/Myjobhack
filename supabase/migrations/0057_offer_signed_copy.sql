-- 0057 · Keep the signed offer letter as its own record.
--
-- On acceptance the countersigned PDF used to be written over pdf_path, so
-- the letter as originally sent was lost the moment someone signed. Both
-- matter later: the sent letter is what was offered, the signed one is what
-- was agreed. They are now stored side by side.
--
-- The date line, reference and start position are also kept, so the signed
-- copy is rebuilt from exactly what was sent rather than from defaults. A
-- countersigned document that differs from the original, even by a missing
-- reference number, is harder to rely on in a dispute.
--
-- Safe to run more than once.

alter table offer_letters
  add column if not exists signed_pdf_path text,
  add column if not exists signed_pdf_bucket text,
  add column if not exists signed_pdf_provider text,
  add column if not exists reference text,
  add column if not exists date_line text,
  add column if not exists start_offset int not null default 0,
  add column if not exists company_name text;

-- Offers already accepted: their pdf_path holds the SIGNED copy, because it
-- overwrote the original. Move it to where a signed copy belongs. The letter
-- as sent can still be rebuilt from the stored body, so nothing is lost by
-- clearing pdf_path; leaving it would show the signed copy as the original.
update offer_letters
   set signed_pdf_path     = pdf_path,
       signed_pdf_bucket   = pdf_bucket,
       signed_pdf_provider = pdf_provider,
       pdf_path = null
 where signed_at is not null
   and signed_pdf_path is null
   and pdf_path like '%-accepted.pdf';

create index if not exists offer_letters_signed_idx
  on offer_letters (signed_at desc) where signed_at is not null;

comment on column offer_letters.signed_pdf_path is
  'The countersigned copy, written on acceptance. pdf_path remains the letter as it was sent.';
