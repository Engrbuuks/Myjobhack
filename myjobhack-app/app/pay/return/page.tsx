import { verifyPaystack } from "@/lib/paystack";
import { settlePayment } from "@/lib/settlePayment";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PayReturnPage({ searchParams }: { searchParams: { reference?: string; trxref?: string } }) {
  const reference = searchParams.reference || searchParams.trxref;
  let ok = false; let message = "We couldn't confirm your payment.";

  if (reference) {
    const v = await verifyPaystack(reference);
    if (v.ok && v.data) {
      // Backstop: settle here too in case the webhook is delayed. Idempotent.
      await settlePayment(v.data);
      ok = true; message = "Payment confirmed — everything is unlocked.";
    } else if (v.data && v.data.status !== "success") {
      message = "Your payment was not completed.";
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-paper p-6">
      <div className="card p-8 max-w-md text-center">
        <div className={`w-14 h-14 rounded-full grid place-items-center text-2xl mx-auto mb-4 ${ok ? "bg-coral text-white" : "bg-paper-2 text-muted"}`}>
          {ok ? "✓" : "!"}
        </div>
        <h1 className="font-display font-semibold text-2xl mb-2">{ok ? "Thank you" : "Hmm"}</h1>
        <p className="text-muted-2 text-sm mb-6">{message}</p>
        <Link href="/portal" className="btn-coral">Go to your portal</Link>
      </div>
    </main>
  );
}
