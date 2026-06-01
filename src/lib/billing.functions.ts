import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { withSupabaseAccessToken } from "@/integrations/supabase/server-fn-auth";
import { PLANS, planFromProductId, getPlanPriceId, type PlanTier } from "./plans";
import {
  getCurrentStripe,
  requireCurrentStripe,
  type StripeMode,
} from "./stripe-env.server";

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
    console.warn("[billing] Nenhum header de origem disponível e PUBLIC_APP_URL não está definida. Usando fallback:", fallback);
  }
  return fallback;
}

async function findOrCreateCustomerByEmail(stripe: Stripe, email: string, name?: string) {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) return existing.data[0];
  return stripe.customers.create({ email, name });
}

/**
 * Sync the user's subscription state from Stripe into our DB and return current plan.
 * Called on login, page load, and after checkout.
 */
export const checkSubscription = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) {
      return { plan: "free" as PlanTier, status: "active", current_period_end: null, cancel_at_period_end: false };
    }

    const { stripe } = getCurrentStripe();
    if (!stripe) {
      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          { user_id: userId, plan: "free", status: "active" },
          { onConflict: "user_id" },
        );
      return { plan: "free" as PlanTier, status: "active", current_period_end: null, cancel_at_period_end: false };
    }
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          { user_id: userId, plan: "free", status: "active" },
          { onConflict: "user_id" },
        );
      return { plan: "free" as PlanTier, status: "active", current_period_end: null, cancel_at_period_end: false };
    }

    const customer = customers.data[0];

    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 5,
    });

    const active = subs.data.find((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );

    let plan: PlanTier = "free";
    let status: string = "active";
    let currentPeriodEnd: string | null = null;
    let cancelAtPeriodEnd = false;
    let stripeSubscriptionId: string | null = null;
    let stripePriceId: string | null = null;

    if (active) {
      const item = active.items.data[0];
      const productId =
        typeof item.price.product === "string" ? item.price.product : item.price.product?.id;
      plan = planFromProductId(productId);
      status = active.status;
      const sub = active as unknown as { current_period_end?: number };
      currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      cancelAtPeriodEnd = active.cancel_at_period_end ?? false;
      stripeSubscriptionId = active.id;
      stripePriceId = item.price.id;
    }

    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan,
          status: status as
            | "active"
            | "trialing"
            | "past_due"
            | "canceled"
            | "incomplete",
          stripe_customer_id: customer.id,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_price_id: stripePriceId,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
        },
        { onConflict: "user_id" },
      );

    return {
      plan,
      status,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    };
  });

/** Create a Stripe Checkout Session for a subscription upgrade. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .inputValidator((input: { plan: "pro" | "business" }) => {
    if (input.plan !== "pro" && input.plan !== "business") {
      throw new Error("Plano inválido");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) throw new Error("Email não disponível");

    const { stripe, mode } = requireCurrentStripe();
    const priceId = getPlanPriceId(data.plan, mode);
    if (!priceId) {
      throw new Error(
        mode === "test"
          ? "Plano não configurado em modo de teste. Crie os produtos em test mode no Stripe."
          : "Plano não configurado",
      );
    }

    const customer = await findOrCreateCustomerByEmail(stripe, email);

    const origin = getOrigin();
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      // Restrict to card only — disables Stripe Link prompts (saved phone/email autofill).
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/configuracoes?checkout=success`,
      cancel_url: `${origin}/planos?checkout=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { user_id: userId, plan: data.plan },
      },
      metadata: { user_id: userId, plan: data.plan },
    });

    return { url: session.url };
  });

/** Create a Stripe Billing Portal session so the user can manage their subscription. */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) throw new Error("Email não disponível");

    const { stripe } = requireCurrentStripe();
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("Nenhuma assinatura encontrada para gerenciar");
    }

    const origin = getOrigin();
    const portal = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${origin}/configuracoes`,
    });

    return { url: portal.url };
  });

async function findActiveSubscription(stripe: Stripe, email: string) {
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) return null;
  const subs = await stripe.subscriptions.list({
    customer: customers.data[0].id,
    status: "all",
    limit: 5,
  });
  const active = subs.data.find((s) =>
    ["active", "trialing", "past_due"].includes(s.status),
  );
  return active ? { customer: customers.data[0], subscription: active } : null;
}

/** Cancel the current subscription at the end of the billing period. */
export const cancelSubscriptionAtPeriodEnd = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Email não disponível");
    const { stripe } = requireCurrentStripe();
    const found = await findActiveSubscription(stripe, email);
    if (!found) throw new Error("Nenhuma assinatura ativa encontrada");
    const updated = await stripe.subscriptions.update(found.subscription.id, {
      cancel_at_period_end: true,
    });
    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("user_id", context.userId);
    return { ok: true, cancel_at_period_end: updated.cancel_at_period_end };
  });

/** Undo a scheduled cancellation. */
export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Email não disponível");
    const { stripe } = requireCurrentStripe();
    const found = await findActiveSubscription(stripe, email);
    if (!found) throw new Error("Nenhuma assinatura encontrada");
    await stripe.subscriptions.update(found.subscription.id, {
      cancel_at_period_end: false,
    });
    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: false })
      .eq("user_id", context.userId);
    return { ok: true };
  });

/** Change plan immediately (upgrade or downgrade) with prorated billing. */
export const changePlan = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .inputValidator((input: { plan: "pro" | "business" }) => {
    if (input.plan !== "pro" && input.plan !== "business") {
      throw new Error("Plano inválido");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Email não disponível");
    const { stripe, mode } = requireCurrentStripe();
    const priceId = getPlanPriceId(data.plan, mode);
    if (!priceId) throw new Error("Plano não configurado");
    const found = await findActiveSubscription(stripe, email);
    if (!found) throw new Error("Nenhuma assinatura ativa encontrada");
    const itemId = found.subscription.items.data[0].id;
    if (found.subscription.items.data[0].price.id === priceId) {
      return { ok: true, unchanged: true };
    }
    await stripe.subscriptions.update(found.subscription.id, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });
    return { ok: true };
  });

/** Admin-only: check if Stripe is configured and return account info. */
export const getStripeStatus = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado");

    const { stripe, mode } = getCurrentStripe();
    if (!stripe) {
      return { configured: false as const };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (stripe.accounts as any).retrieve();
      return {
        configured: true as const,
        livemode: mode === "live",
        mode: mode as StripeMode,
        accountId: account.id,
        accountEmail: account.email ?? null,
        businessName:
          account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
        country: account.country ?? null,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
      };
    } catch (err) {
      return {
        configured: true as const,
        error: err instanceof Error ? err.message : "Falha ao validar a chave do Stripe",
      };
    }
  });

/** List the user's invoices from Stripe. */
export const listInvoices = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) return { invoices: [] };

    const { stripe } = getCurrentStripe();
    if (!stripe) return { invoices: [] };
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return { invoices: [] };

    const invoices = await stripe.invoices.list({
      customer: customers.data[0].id,
      limit: 24,
    });

    return {
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        amount_paid: inv.amount_paid,
        amount_due: inv.amount_due,
        currency: inv.currency,
        status: inv.status,
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
      })),
    };
  });
