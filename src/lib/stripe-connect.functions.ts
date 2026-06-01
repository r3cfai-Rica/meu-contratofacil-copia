import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAccessToken } from "@/integrations/supabase/server-fn-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCurrentStripe } from "@/lib/stripe-env.server";

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
    console.warn("[stripe-connect] Nenhum header de origem disponível e PUBLIC_APP_URL não está definida. Usando fallback:", fallback);
  }
  return fallback;
}

/**
 * Create (or reuse) a Stripe Standard connected account for the current user
 * and return an Account Link URL for onboarding.
 */
export const createConnectAccountLink = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims as { email?: string }).email;
    const { stripe } = requireCurrentStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_connect_account_id, country")
      .eq("user_id", userId)
      .maybeSingle();

    let accountId = profile?.stripe_connect_account_id ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        email: email ?? undefined,
        metadata: { user_id: userId },
      });
      accountId = account.id;
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("user_id", userId);
    }

    const origin = getOrigin();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/configuracoes?stripe_connect=refresh`,
      return_url: `${origin}/configuracoes?stripe_connect=success`,
      type: "account_onboarding",
    });

    return { url: link.url };
  });

/**
 * Refresh status of the user's connected account (charges_enabled / payouts_enabled / requirements).
 */
export const getConnectAccountStatus = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { stripe } = requireCurrentStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(
        "stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarded_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.stripe_connect_account_id) {
      return {
        connected: false as const,
      };
    }

    const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id);
    const chargesEnabled = account.charges_enabled ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;
    const requirementsDue =
      (account.requirements?.currently_due?.length ?? 0) +
      (account.requirements?.past_due?.length ?? 0);

    const onboardedAt =
      profile.stripe_connect_onboarded_at ??
      (detailsSubmitted ? new Date().toISOString() : null);

    await supabaseAdmin
      .from("profiles")
      .update({
        stripe_connect_charges_enabled: chargesEnabled,
        stripe_connect_payouts_enabled: payoutsEnabled,
        stripe_connect_onboarded_at: onboardedAt,
      })
      .eq("user_id", userId);

    return {
      connected: true as const,
      accountId: account.id,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      requirementsDue,
      country: account.country ?? null,
      email: account.email ?? null,
    };
  });

/**
 * Generate a one-time login link to the connected account's Stripe Express dashboard.
 * Note: Standard accounts use stripe.com login directly; this returns the dashboard URL.
 */
export const createConnectLoginLink = createServerFn({ method: "POST" })
  .middleware([withSupabaseAccessToken, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.stripe_connect_account_id) {
      throw new Error("No connected Stripe account");
    }

    // Standard accounts: user logs in via dashboard.stripe.com directly.
    return { url: "https://dashboard.stripe.com/" };
  });
