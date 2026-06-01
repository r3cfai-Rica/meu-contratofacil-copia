import Stripe from "stripe";
import { getRequestHeader } from "@tanstack/react-start/server";

export type StripeMode = "test" | "live";

/**
 * Decide whether the current request should use Stripe test or live keys.
 *
 * Priority order:
 * 1. STRIPE_MODE env var ("test" | "live") — explicit override, useful in Replit
 * 2. Host-based detection — localhost, Replit dev, Lovable preview → test
 * 3. Fallback → live (requires STRIPE_SECRET_KEY to be set)
 */
export function getStripeModeFromHost(host: string | null | undefined): StripeMode {
  // Explicit override via env var
  const envMode = process.env.STRIPE_MODE?.toLowerCase();
  if (envMode === "test") return "test";
  if (envMode === "live") return "live";

  const hasTestKey = !!process.env.STRIPE_SECRET_KEY_TEST;
  if (!hasTestKey) return "live";
  if (!host) return "live";
  const h = host.toLowerCase();
  if (
    h.startsWith("localhost") ||
    h.startsWith("127.0.0.1") ||
    // Replit dev previews (*.replit.dev) and published apps (*.replit.app)
    h.endsWith(".replit.dev") ||
    h.endsWith(".replit.app") ||
    // Lovable preview environments
    h.includes("id-preview--") ||
    h.endsWith("-dev.lovable.app")
  ) {
    return "test";
  }
  return "live";
}

export function getCurrentStripeMode(): StripeMode {
  let host: string | null | undefined;
  try {
    host =
      getRequestHeader("host") ??
      getRequestHeader("x-forwarded-host") ??
      (() => {
        const origin = getRequestHeader("origin") ?? getRequestHeader("referer");
        if (!origin) return undefined;
        try {
          return new URL(origin).host;
        } catch {
          return undefined;
        }
      })();
  } catch {
    host = undefined;
  }
  return getStripeModeFromHost(host);
}

export function getStripeForMode(mode: StripeMode): Stripe | null {
  const key =
    mode === "test"
      ? process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as any });
}

export function getCurrentStripe(): { stripe: Stripe | null; mode: StripeMode } {
  const mode = getCurrentStripeMode();
  return { stripe: getStripeForMode(mode), mode };
}

export function requireCurrentStripe(): { stripe: Stripe; mode: StripeMode } {
  const { stripe, mode } = getCurrentStripe();
  if (!stripe)
    throw new Error("Pagamentos ainda não foram configurados. Adicione a STRIPE_SECRET_KEY.");
  return { stripe, mode };
}
