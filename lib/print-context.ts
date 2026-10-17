/** Restaurant name + paper width for printed bills, read from the settings once and kept for a minute. */
let cache: { at: number; value: { restaurantName: string; paper: string } } | null = null;

export async function getSlipContext(): Promise<{ restaurantName: string; paper: string }> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  let value = { restaurantName: "", paper: "80" };
  try {
    const d = await (await fetch("/api/settings")).json();
    value = { restaurantName: d.restaurant?.name ?? "", paper: d.settings?.paper_width ? String(d.settings.paper_width) : "80" };
    cache = { at: Date.now(), value };
  } catch {
    /* print without the name rather than not at all */
  }
  return value;
}
