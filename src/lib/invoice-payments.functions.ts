import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCurrentStripe } from "@/lib/stripe-env.server";

const InputSchema = z.object({
  invoiceToken: z.string().uuid(),
});

function getOrigin(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const referer = getRequestHeader("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHeader("host") ?? getRequestHeader("x-forwarded-host");
  if (host) return `${proto}://${host}`;
  const fallback = process.env.PUBLIC_APP_URL ?? "https://meu-contrato-na-mao.lovable.app";
  if (!process.env.PUBLIC_APP_URL) {
    console.warn("[invoice-payments] Nenhum header de origem disponível e PUBLIC_APP_URL não está definida. Usando fallback:", fallback);
  }
  return fallback;
}

export const createInvoiceCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { stripe } = requireCurrentStripe();

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, user_id, description, amount, currency, status, public_token, stripe_checkout_session_id",
      )
      .eq("public_token", data.invoiceToken)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("Invoice already paid");
    if (invoice.status === "cancelled") throw new Error("Invoice cancelled");

    // Look up the issuer's connected Stripe account.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(
        "stripe_connect_account_id, stripe_connect_charges_enabled",
      )
      .eq("user_id", invoice.user_id)
      .maybeSingle();

    if (!profile?.stripe_connect_account_id || !profile.stripe_connect_charges_enabled) {
      throw new Error(
        "The issuer hasn't finished setting up international card payments yet. Please contact them.",
      );
    }
    const connectedAccountId = profile.stripe_connect_account_id;

    const currency = (invoice.currency || "USD").toLowerCase();
    const amountCents = Math.round(Number(invoice.amount) * 100);
    if (!amountCents || amountCents <= 0) throw new Error("Invalid amount");

    const origin = getOrigin();
    const returnUrl = `${origin}/pagar/${invoice.public_token}`;

    // Direct charge: the Checkout Session is created ON the connected account.
    // Funds settle directly into the user's Stripe balance.
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amountCents,
              product_data: {
                name: invoice.description.slice(0, 200) || "Invoice",
              },
            },
          },
        ],
        success_url: `${returnUrl}?status=success`,
        cancel_url: `${returnUrl}?status=cancelled`,
        metadata: {
          invoice_id: invoice.id,
          invoice_token: invoice.public_token ?? "",
          user_id: invoice.user_id,
        },
        payment_intent_data: {
          // application_fee_amount: 0, // platform fee disabled for now
          metadata: {
            invoice_id: invoice.id,
            user_id: invoice.user_id,
          },
        },
      },
      { stripeAccount: connectedAccountId },
    );

    await supabaseAdmin
      .from("invoices")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", invoice.id);

    await supabaseAdmin.from("payment_logs").insert({
      invoice_id: invoice.id,
      user_id: invoice.user_id,
      provider: "stripe",
      event_type: "checkout.session.created",
      amount_cents: amountCents,
      currency: currency.toUpperCase(),
      raw: { session_id: session.id, connected_account: connectedAccountId },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  });
