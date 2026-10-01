'use client';
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Payment Methods lives inside Settings; this keeps old links working. */
export default function PaymentMethodsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings#payment-methods");
  }, [router]);
  return null;
}
