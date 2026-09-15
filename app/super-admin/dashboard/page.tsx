import { listRestaurants, activateRestaurant, suspendRestaurant, reactivateRestaurant, terminateRestaurant } from "../actions";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-turmeric-500/20 text-turmeric-400",
  active: "bg-basil-500/20 text-basil-400",
  suspended: "bg-crimson-500/20 text-crimson-400",
  terminated: "bg-crimson-500/20 text-crimson-400",
  expired: "bg-crimson-500/20 text-crimson-400",
};

export default async function SuperAdminDashboard() {
  const restaurants = await listRestaurants();

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Restaurants</h1>
      <p className="text-ink-mid text-sm mb-6">Approve signups and manage tenant lifecycle.</p>

      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Restaurant</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Signed up</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {restaurants.map((r: any) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-ink-mid">
                  {r.owner_name}
                  <div className="text-xs text-ink-faint">{r.email}</div>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-3 text-ink-mid">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-3 space-x-2">
                  {r.status === "pending" && (
                    <form action={activateRestaurant.bind(null, r.id)} className="inline">
                      <button className="rounded-md bg-basil-500 hover:bg-basil-600 text-white text-xs font-semibold px-3 py-1.5">
                        Activate
                      </button>
                    </form>
                  )}
                  {r.status === "active" && (
                    <form action={suspendRestaurant.bind(null, r.id)} className="inline">
                      <button className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-3 py-1.5">
                        Suspend
                      </button>
                    </form>
                  )}
                  {r.status === "suspended" && (
                    <form action={reactivateRestaurant.bind(null, r.id)} className="inline">
                      <button className="rounded-md bg-basil-500 hover:bg-basil-600 text-white text-xs font-semibold px-3 py-1.5">
                        Reactivate
                      </button>
                    </form>
                  )}
                  {r.status !== "terminated" && (
                    <form action={terminateRestaurant.bind(null, r.id)} className="inline">
                      <button className="rounded-md bg-crimson-500/20 hover:bg-crimson-500/30 text-crimson-400 text-xs font-semibold px-3 py-1.5">
                        Terminate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {restaurants.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-faint">
                  No restaurants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
