import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword } from "@/lib/auth/password";
import { computeStatus, isUsable } from "@/lib/subscription";

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: restaurant, error } = await admin
      .from("restaurants")
      .select(`
        id,
        slug,
        name,
        email,
        password_hash,
        status
      `)
      .eq("email", email.trim().toLowerCase())
      .single();

    if (error || !restaurant) {
      return NextResponse.json(
        { error: "Incorrect email or password" },
        { status: 401 }
      );
    }

    if (!restaurant.password_hash) {
      return NextResponse.json(
        { error: "Restaurant login has not been configured yet." },
        { status: 403 }
      );
    }

    const validPassword = await verifyPassword(
      password,
      restaurant.password_hash
    );

    if (!validPassword) {
      return NextResponse.json(
        { error: "Incorrect email or password" },
        { status: 401 }
      );
    }

    if (restaurant.status !== "active") {
      return NextResponse.json(
        {
          error: `This restaurant's account is ${restaurant.status}.`,
        },
        { status: 403 }
      );
    }

    const { data: sub } = await admin
      .from("subscriptions")
      .select("current_period_end, grace_until, status")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (sub) {
      const subscriptionStatus = computeStatus(sub);

      if (!isUsable(subscriptionStatus)) {
        return NextResponse.json(
          {
            error:
              "Subscription expired. Contact support to reactivate.",
          },
          { status: 402 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
    });
  } catch (error) {
    console.error("Restaurant login error:", error);

    return NextResponse.json(
      { error: "Something went wrong while signing in." },
      { status: 500 }
    );
  }
}