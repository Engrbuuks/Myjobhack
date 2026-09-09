/**
 * Phone number validation for applications.
 *
 * WHY THIS EXISTS: phone was optional and free text, so the field arrived
 * empty, or as "0803 123 4567", or "+234 803 123 4567", or "803-1234567".
 * Those are the same person, and a recruiter trying to call them from a
 * spreadsheet has to work out which. Worse, some applicants left it blank
 * entirely and then could not be reached at all.
 *
 * Accepts what people actually type in Nigeria and across Africa, and stores
 * one consistent form.
 */

/** Dial codes for the markets this platform serves. */
export const DIAL_CODES: { code: string; label: string; iso: string; nsn: number }[] = [
  { code: "+234", label: "Nigeria", iso: "NG", nsn: 10 },
  { code: "+233", label: "Ghana", iso: "GH", nsn: 9 },
  { code: "+254", label: "Kenya", iso: "KE", nsn: 9 },
  { code: "+27",  label: "South Africa", iso: "ZA", nsn: 9 },
  { code: "+256", label: "Uganda", iso: "UG", nsn: 9 },
  { code: "+255", label: "Tanzania", iso: "TZ", nsn: 9 },
  { code: "+250", label: "Rwanda", iso: "RW", nsn: 9 },
  { code: "+237", label: "Cameroon", iso: "CM", nsn: 9 },
  { code: "+225", label: "Côte d'Ivoire", iso: "CI", nsn: 10 },
  { code: "+221", label: "Senegal", iso: "SN", nsn: 9 },
  { code: "+260", label: "Zambia", iso: "ZM", nsn: 9 },
  { code: "+263", label: "Zimbabwe", iso: "ZW", nsn: 9 },
  { code: "+1",   label: "United States or Canada", iso: "US", nsn: 10 },
  { code: "+44",  label: "United Kingdom", iso: "GB", nsn: 10 }
];

export type PhoneCheck =
  | { ok: true; e164: string; national: string }
  | { ok: false; error: string };

/**
 * Validate and normalise, given a chosen dial code.
 *
 * Accepts the two things Nigerians actually type: the full eleven digits
 * starting with zero (08031234567), or the ten digits without it
 * (8031234567). Both mean the same number, so both are accepted and stored
 * identically as +2348031234567.
 */
export function checkPhone(rawInput: string, dialCode = "+234"): PhoneCheck {
  const country = DIAL_CODES.find((d) => d.code === dialCode) ?? DIAL_CODES[0];
  let raw = (rawInput || "").trim();

  if (!raw) return { ok: false, error: "A phone number is required so we can reach you about your application." };

  // Strip anything that is not a digit or a leading plus.
  raw = raw.replace(/[\s()\-.]/g, "");

  // If they pasted a full international number, honour it rather than
  // pretending the picker beside the box is the truth.
  if (raw.startsWith("+")) {
    const match = DIAL_CODES
      .slice()
      .sort((a, b) => b.code.length - a.code.length)
      .find((d) => raw.startsWith(d.code));
    if (!match) return { ok: false, error: "That country code is not one we recognise. Pick your country from the list and enter the number without it." };
    const rest = raw.slice(match.code.length).replace(/\D/g, "").replace(/^0+/, "");
    if (rest.length !== match.nsn)
      return { ok: false, error: `A ${match.label} number needs ${match.nsn} digits after ${match.code}. You entered ${rest.length}.` };
    return { ok: true, e164: `${match.code}${rest}`, national: rest };
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) return { ok: false, error: "Enter your phone number using digits." };

  // A leading zero is the national trunk prefix and is dropped in E.164.
  const national = digits.replace(/^0+/, "");

  if (national.length !== country.nsn) {
    const expectedWithZero = country.nsn + 1;
    return {
      ok: false,
      error: digits.length === expectedWithZero || digits.length === country.nsn
        ? `That number does not look complete. A ${country.label} number is ${country.nsn} digits, or ${expectedWithZero} starting with 0.`
        : `A ${country.label} number should be ${country.nsn} digits after ${country.code}, or ${expectedWithZero} digits starting with 0. You entered ${digits.length}.`
    };
  }

  // Guard against a number of the right length that is obviously not one.
  if (/^(\d)\1+$/.test(national))
    return { ok: false, error: "That does not look like a real phone number." };

  return { ok: true, e164: `${country.code}${national}`, national };
}

/**
 * Repair a number that was stored before normalisation existed.
 *
 * Applications taken before the apply form validated phone numbers hold
 * whatever the person typed: 09029815294, 0803 123 4567, 803-123-4567. Those
 * are correct locally and useless internationally, and a wa.me link built
 * from 09029815294 is rejected because there is no country with dialling code
 * 0. The leading zero is a national trunk prefix and must be replaced by the
 * country code, not merely kept.
 *
 * Returns E.164, or null when it genuinely cannot be salvaged.
 */
export function toE164(raw: string | null | undefined, defaultDial = "+234"): string | null {
  if (!raw) return null;
  let v = String(raw).trim().replace(/[\s()\-.]/g, "");
  if (!v) return null;

  // Already international.
  if (v.startsWith("+")) {
    const digits = v.slice(1).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = v.replace(/\D/g, "");
  if (!digits) return null;

  const country = DIAL_CODES.find((d) => d.code === defaultDial) ?? DIAL_CODES[0];
  const cc = country.code.replace("+", "");

  // Written with the country code but no plus: 2348031234567
  if (digits.startsWith(cc) && digits.length === cc.length + country.nsn)
    return `+${digits}`;

  // Local form with the trunk zero: 08031234567
  const national = digits.replace(/^0+/, "");
  if (national.length === country.nsn) return `+${cc}${national}`;

  // Some other country's international number written without the plus.
  const guess = DIAL_CODES.find((d) => {
    const code = d.code.replace("+", "");
    return digits.startsWith(code) && digits.length === code.length + d.nsn;
  });
  if (guess) return `+${digits}`;

  return null;
}

/** Readable form for tables and exports: +234 803 123 4567 */
export function formatPhone(e164: string): string {
  const match = DIAL_CODES.slice().sort((a, b) => b.code.length - a.code.length)
    .find((d) => e164.startsWith(d.code));
  if (!match) return e164;
  const rest = e164.slice(match.code.length);
  const grouped = rest.length === 10
    ? `${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`
    : `${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  return `${match.code} ${grouped}`.trim();
}
