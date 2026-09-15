import { getActivePlans } from "./actions";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const plans = await getActivePlans();

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas text-ink-strong px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold">Restro Pro</h1>
          <p className="text-ink-mid mt-1">
            Sign up your restaurant. A platform admin reviews and activates every new account
            before you can log in.
          </p>
        </div>
        <SignupForm plans={plans} />
      </div>
    </main>
  );
}
