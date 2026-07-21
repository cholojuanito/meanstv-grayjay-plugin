// Pure duration parsing. Uscreen reports durations in several formats:
//   - integer seconds (`duration_in_seconds`)
//   - clock strings "SS", "MM:SS" or "HH:MM:SS" (`duration`)
//   - occasionally ISO-8601 ("PT1H16M")
// All normalize to whole seconds

export function parseDuration(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) : 0;
  if (!value) return 0;

  const v = value.trim();

  // Clock form: one or more colon-separated numeric groups (SS / MM:SS / HH:MM:SS).
  if (/^\d+(:\d{1,2})*$/.test(v)) {
    return v
      .split(":")
      .map((p) => parseInt(p, 10))
      .reduce((acc, p) => acc * 60 + (Number.isFinite(p) ? p : 0), 0);
  }

  // ISO-8601 duration (PT#H#M#S).
  const iso = v.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    const h = iso[1] ? parseInt(iso[1], 10) : 0;
    const m = iso[2] ? parseInt(iso[2], 10) : 0;
    const s = iso[3] ? parseInt(iso[3], 10) : 0;
    return h * 3600 + m * 60 + s;
  }

  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}
