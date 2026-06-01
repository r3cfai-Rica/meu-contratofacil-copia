import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAccessToken } from "@/integrations/supabase/server-fn-auth";
import { getLaunchOfferPriceId } from "./plans";
import { requireCurrentStripe } from "./stripe-env.server";

function getOrigin(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const referer = getRequestHeader("referer")?.replace(/\/[^/]*$/, "");
  if (referer) return referer;
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHeader("host") ?? getRequestHeader("x-forwarded-host");
  if (host) return `${proto}://${host}`;
  const fallback = process.env.PUBLIC_APP_URL ?? "https://meu-contrato-na-mao.lovable.app";
  if (!process.env.PUBLIC_APP_URL) {
    console.warn("[launchOffer] Nenhum header de origem disponível e PUBLIC_APP_URL não está definida. Usando fallback:", fallback);
  }
  return fallback;
}

/**
 * Create a Stripe Checkout Session for the one-time launch offer.
 * Accepts both card and PIX (BRL).
 */
export const createLaunchOfferCheckout = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) throw new Error("Email não disponível");

    const { stripe, mode } = requireCurrentStripe();
    const priceId = getLaunchOfferPriceId(mode);

    // Reuse customer if exists
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer =
      existing.data[0] ?? (await stripe.customers.create({ email }));

    const origin = getOrigin();
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "payment",
      payment_method_types: ["card", "pix"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/configuracoes?launch=success`,
      cancel_url: `${origin}/?launch=canceled`,
      allow_promotion_codes: true,
      metadata: {
        user_id: userId,
        type: "launch_offer",
      },
      payment_intent_data: {
        metadata: {
          user_id: userId,
          type: "launch_offer",
        },
      },
    });

    return { url: session.url };
  });
