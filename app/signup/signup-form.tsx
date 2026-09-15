"use client";
import { useFormState, useFormStatus } from "react-dom";
import { signupRestaurant, type SignupState } from "./actions";

type Plan = { id: string; name: string; monthly_price: number; yearly_price: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5"
    >
      {pending ? "Submitting…" : "Request account"}
    </button>
  );
}

export function SignupForm({ plans }: { plans: Plan[] }) {
  const initialState: SignupState = {};
  const [state, formAction] = useFormState(signupRestaurant, initialState);

  if (state.success) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center">
        <p className="text-lg font-semibold mb-2">Request received 🎉</p>
        <p className="text-ink-mid text-sm">
          A Restro Pro platform admin will review and activate your restaurant shortly. You'll be
          able to log in with the owner email/password you just set once that happens — the
          4-digit PIN you chose becomes your admin staff PIN at that point.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Restaurant name" name="restaurantName" required />
        <Field label="Owner name" name="ownerName" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner email" name="email" type="email" required />
        <Field label="Owner password" name="password" type="password" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" />
        <Field label="City" name="city" />
      </div>
      <div className="border-t border-line pt-4">
        <p className="text-xs uppercase tracking-wide text-ink-faint mb-3">
          Admin staff login (used once your account is activated)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Admin name" name="adminName" required />
          <Field label="4-digit PIN" name="adminPin" maxLength={4} pattern="\d{4}" required />
        </div>
      </div>
      {plans.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Plan</span>
            <select name="planId" className="mt-1 w-full rounded-md bg-raised border border-line px-3 py-2">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — Rs {p.monthly_price}/mo
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Billing cycle</span>
            <select name="billingCycle" className="mt-1 w-full rounded-md bg-raised border border-line px-3 py-2">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>
      )}
      {state.error && <p className="text-crimson-400 text-sm">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
}) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <input
        {...rest}
        className="mt-1 w-full rounded-md bg-raised border border-line px-3 py-2"
      />
    </label>
  );
}
