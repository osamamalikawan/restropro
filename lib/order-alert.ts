/** New-order alert sound for the Ticket Rail. A short two-tone chime made with the Web Audio API (no sound file
 *  to ship). Browsers only allow audio after the user has interacted with the page, so the rail calls
 *  primeOrderSound() on the first click/keypress; the on/off choice is remembered in this browser. */
const KEY = "rp_order_sound";
let ctx: AudioContext | null = null;

export function isOrderSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setOrderSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/** Create / wake the audio context (call from a user gesture). */
export function primeOrderSound() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* no audio available */
  }
}

/** "ding-dong", repeated twice so it is hard to miss in a noisy kitchen. */
export function playOrderChime() {
  try {
    primeOrderSound();
    if (!ctx || ctx.state !== "running") return;
    const c = ctx;
    const t0 = c.currentTime + 0.02;
    const tone = (freq: number, start: number, dur: number) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    };
    for (const offset of [0, 0.9]) {
      tone(880, t0 + offset, 0.45);
      tone(660, t0 + offset + 0.3, 0.6);
    }
  } catch {
    /* ignore */
  }
}

// ---- orders placed on THIS device: no alert for them -------------------------------------------------------------
const OWN_KEY = "rp_own_orders";
const OWN_MS = 10 * 60_000;

/** The POS calls this when it saves a sale, so the new-order alert doesn't announce your own order back to you. */
export function markOwnOrder(orderNo: string | number | null | undefined) {
  if (orderNo === null || orderNo === undefined || orderNo === "") return;
  try {
    const now = Date.now();
    const list = (JSON.parse(localStorage.getItem(OWN_KEY) || "[]") as { n: string; at: number }[]).filter((o) => now - o.at < OWN_MS);
    list.push({ n: String(orderNo), at: now });
    localStorage.setItem(OWN_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* storage unavailable */
  }
}
export function isOwnOrder(s: { order_no?: string | number | null; display_id?: string | null }): boolean {
  try {
    const now = Date.now();
    const list = (JSON.parse(localStorage.getItem(OWN_KEY) || "[]") as { n: string; at: number }[]).filter((o) => now - o.at < OWN_MS);
    return list.some((o) => o.n === String(s.order_no) || (!!s.display_id && o.n === s.display_id));
  } catch {
    return false;
  }
}
