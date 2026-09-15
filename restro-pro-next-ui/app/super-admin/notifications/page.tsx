import { listRestaurantsForPicker, sendNotification, listSentNotifications } from "./actions";

export default async function NotificationsPage() {
  const [restaurants, sent] = await Promise.all([listRestaurantsForPicker(), listSentNotifications()]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-8 max-w-3xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Notifications</h1>
      <p className="text-neutral-400 text-sm mb-6">Send a message to one, some, or all restaurants.</p>

      <form action={sendNotification} className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 mb-8">
        <input
          name="title"
          placeholder="Title"
          required
          className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2"
        />
        <textarea
          name="body"
          placeholder="Message"
          required
          rows={3}
          className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2"
        />
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Audience</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="audience" value="all" defaultChecked /> All restaurants
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="audience" value="selected" /> Selected restaurants:
          </label>
          <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-800 p-2 grid grid-cols-2 gap-1">
            {restaurants.map((r: any) => (
              <label key={r.id} className="flex items-center gap-2 text-xs text-neutral-300">
                <input type="checkbox" name="restaurantIds" value={r.id} /> {r.name}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="rounded-lg bg-chili-500 hover:bg-chili-600 text-white font-semibold px-4 py-2">
          Send notification
        </button>
      </form>

      <h2 className="font-display text-lg font-semibold mb-3">Recently sent</h2>
      <div className="space-y-2">
        {sent.map((n: any) => (
          <div key={n.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="flex justify-between items-baseline">
              <span className="font-semibold text-sm">{n.title}</span>
              <span className="text-xs text-neutral-500">{new Date(n.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-neutral-400 mt-1">{n.body}</p>
            <span className="text-xs text-neutral-600">
              {n.audience === "all" ? "Sent to all restaurants" : `Sent to ${n.notification_recipients?.[0]?.count ?? 0} restaurant(s)`}
            </span>
          </div>
        ))}
        {sent.length === 0 && <p className="text-neutral-500 text-sm">Nothing sent yet.</p>}
      </div>
    </main>
  );
}
