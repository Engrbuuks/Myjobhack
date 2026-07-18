/** Turns raw job-description text into editorial typography:
 *  short lines / lines ending ":" become subheads, -/•/* lines become bullet lists,
 *  everything else becomes clean paragraphs. */
export function FormattedJD({ text, dark }: { text: string; dark?: boolean }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks: ({ t: "h"; v: string } | { t: "p"; v: string } | { t: "ul"; v: string[] })[] = [];
  let list: string[] | null = null;

  const flush = () => { if (list?.length) blocks.push({ t: "ul", v: list }); list = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = line.match(/^([-•*·]|\d+[.)])\s+(.*)$/);
    if (bullet) { (list ??= []).push(bullet[2]); continue; }
    flush();
    const isHead =
      (line.endsWith(":") && line.length < 70) ||
      (line.length < 48 && !/[.,]$/.test(line) && (line === line.toUpperCase() || /^[A-Z][^.!?]*$/.test(line)) && line.split(" ").length <= 6);
    if (isHead) blocks.push({ t: "h", v: line.replace(/:$/, "") });
    else blocks.push({ t: "p", v: line });
  }
  flush();

  const mut = dark ? "text-white/70" : "text-ink/75";
  const head = dark ? "text-white" : "text-ink";

  return (
    <div className="space-y-4">
      {blocks.map((b, i) =>
        b.t === "h" ? (
          <h3 key={i} className={`font-display font-semibold text-lg pt-3 first:pt-0 ${head}`}>
            {b.v}
          </h3>
        ) : b.t === "ul" ? (
          <ul key={i} className="space-y-2">
            {b.v.map((li, x) => (
              <li key={x} className={`flex gap-3 text-[15px] leading-relaxed ${mut}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-coral mt-2.5 shrink-0" />
                <span>{li}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className={`text-[15px] leading-relaxed ${mut}`}>{b.v}</p>
        )
      )}
    </div>
  );
}
