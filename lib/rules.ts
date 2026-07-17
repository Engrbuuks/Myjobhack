export type FieldDef = {
  id: string; label: string; field_type: string;
  options: string[] | null; required: boolean;
  eligibility: { op: string; value: any } | null;
};

export function evaluateRules(fields: FieldDef[], answers: Record<string, any>) {
  const failures: string[] = [];
  for (const f of fields) {
    if (!f.eligibility?.op) continue;
    const raw = answers[f.id];
    const { op, value } = f.eligibility;
    let ok = false;
    const num = (x: any) => (x === "" || x == null ? NaN : Number(x));
    const asBool = (x: any) => x === true || x === "true" || x === "yes" || x === "Yes";

    switch (op) {
      case ">=": ok = num(raw) >= num(value); break;
      case "<=": ok = num(raw) <= num(value); break;
      case ">":  ok = num(raw) > num(value); break;
      case "<":  ok = num(raw) < num(value); break;
      case "equals":
        ok = f.field_type === "boolean"
          ? asBool(raw) === asBool(value)
          : String(raw ?? "").trim().toLowerCase() === String(value ?? "").trim().toLowerCase();
        break;
      case "not_equals":
        ok = String(raw ?? "").trim().toLowerCase() !== String(value ?? "").trim().toLowerCase();
        break;
      case "in": {
        const list = Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim());
        ok = list.map((s) => String(s).toLowerCase()).includes(String(raw ?? "").toLowerCase());
        break;
      }
      case "contains": {
        const arr = Array.isArray(raw) ? raw : [raw];
        ok = arr.map((s) => String(s).toLowerCase()).includes(String(value).toLowerCase());
        break;
      }
      default: ok = true;
    }
    if (!ok) failures.push(f.label);
  }
  return { passed: failures.length === 0, failures };
}
