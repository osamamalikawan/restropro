/** "14:00" or "14:00:00" (Postgres `time` columns come back as strings) → "2:00 PM".
 *  Ported 1:1 from the prototype's fmtTime() in scripts/restaurant/admin.js. */
export function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}
