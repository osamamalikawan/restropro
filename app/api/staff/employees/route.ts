import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Step 2 of staff login.
 *
 * The restaurant has already authenticated in Step 1.
 *
 * Query:
 *   /api/staff/employees?restaurantId=<restaurant-id>
 *
 * The restaurantId comes from the successful restaurant login.
 *
 * Only active employees belonging to that restaurant are returned.
 *
 * IMPORTANT:
 * pin_hash is never returned to the client.
 */
export async function GET(req: Request) {
  const restaurantId = new URL(req.url).searchParams.get(
    "restaurantId"
  );

  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  /*
   * Find the restaurant using its exact ID.
   */
  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select("id, name, status")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404 }
    );
  }

  /*
   * Restaurant must still be active.
   */
  if (restaurant.status !== "active") {
    return NextResponse.json(
      {
        error: `This restaurant's account is ${restaurant.status}.`,
      },
      { status: 403 }
    );
  }

  /*
   * Get only active employees belonging to this restaurant.
   *
   * pin_hash is intentionally NOT selected.
   */
  const { data: employees, error: employeesError } = await admin
    .from("employees")
    .select("id, name, role")
    .eq("restaurant_id", restaurant.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (employeesError) {
    console.error(
      "Failed to load restaurant employees:",
      employeesError
    );

    return NextResponse.json(
      { error: "Could not load staff" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    employees: employees ?? [],
  });
}