import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  FileSignature,
  QrCode,
  Users,
  ShieldCheck,
  Sparkles,
  Check,
  Loader2,
  Clock,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { createLaunchOfferCheckout } from "@/lib/launchOffer.functions";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    launch: typeof search.launch === "string" ? search.launch : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Aprova ai — Contratos, cobranças e clientes em um só lugar" },
      {
        name: "description",
        content:
          "SaaS para MEIs, autônomos e prestadores de serviço gerenciarem contratos digitais, cobranças via PIX e clientes com simplicidade.",
      },
      {
        property: "og:title",
        content: "Aprova ai — Contratos, cobranças e clientes em um só lugar",
      },
      {
        property: "og:description",
        content:
          "Gerencie contratos digitais, receba via PIX e organize seus clientes em uma única plataforma feita para o profissional brasileiro.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { launch } = Route.useSearch();
  const checkoutFn = useServerFn(createLaunchOfferCheckout);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  useEffect(() => {
    if (launch === "canceled") {
      toast.info(t("plans.checkoutCanceled"));
      void navigate({ to: "/", search: {}, replace: true });
    }
  }, [launch, navigate, t]);

  const handleLaunchOffer = async () => {
    if (!user) {
      void navigate({ to: "/signup", search: { next: "/?launch=checkout" } });
      return;
    }
    setLoadingCheckout(true);
    try {
      const result = await checkoutFn();
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error(t("landing.launchOffer.checkoutError"));
        setLoadingCheckout(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("landing.launchOffer.checkoutError");
      toast.error(msg);
      setLoadingCheckout(false);
    }
  };

  // Auto-trigger checkout when user lands here after signup with ?launch=checkout
  useEffect(() => {
    if (user && launch === "checkout") {
      void navigate({ to: "/", search: {}, replace: true });
      void handleLaunchOffer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, launch]);

  const benefits = [
    { icon: FileSignature, title: t("landing.feature1Title"), description: t("landing.feature1Desc") },
    { icon: QrCode, title: t("landing.feature2Title"), description: t("landing.feature2Desc") },
    { icon: Users, title: t("landing.feature3Title"), description: t("landing.feature3Desc") },
  ];

  const offerFeatures = [
    t("landing.launchOffer.feature1"),
    t("landing.launchOffer.feature2"),
    t("landing.launchOffer.feature3"),
    t("landing.launchOffer.feature4"),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--gradient-glow)" }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 text-center sm:pt-28 sm:pb-32">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t("landing.badge")}
          </div>

          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            {t("landing.headline1")}{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              {t("landing.headline2")}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            {t("landing.subhead")}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link to="/signup">
                {t("landing.ctaStart")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/login">{t("nav.haveAccount")}</Link>
            </Button>
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t("landing.trust")}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border/70 bg-card p-6 transition hover:border-primary/40 hover:shadow-[var(--shadow-glow)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Launch Offer */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div
          className="relative overflow-hidden rounded-3xl border-2 border-primary bg-card p-8 shadow-[var(--shadow-glow)] sm:p-12"
          style={{ backgroundImage: "var(--gradient-glow)" }}
        >
          <div className="absolute right-6 top-6 rotate-6 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg sm:right-10 sm:top-10 sm:text-base">
            {t("landing.launchOffer.discountBadge")}
          </div>

          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Clock className="h-3.5 w-3.5" />
                {t("landing.launchOffer.eyebrow")}
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {t("landing.launchOffer.title")}
              </h2>
              <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
                {t("landing.launchOffer.description")}
              </p>

              <ul className="mt-6 space-y-2.5 text-sm">
                {offerFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-6 backdrop-blur-sm sm:p-8">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("landing.launchOffer.regularPriceLabel")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground line-through">
                {t("landing.launchOffer.regularPrice")}
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight text-primary">
                  {t("landing.launchOffer.promoPrice")}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium text-muted-foreground">
                {t("landing.launchOffer.promoSuffix")}
              </div>

              <Button
                onClick={() => void handleLaunchOffer()}
                disabled={loadingCheckout}
                size="lg"
                className="mt-6 w-full gap-2"
              >
                {loadingCheckout ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("landing.launchOffer.ctaLoading")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t("landing.launchOffer.cta")}
                  </>
                )}
              </Button>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t("landing.launchOffer.paymentMethods")}
              </p>
              <p className="mt-4 border-t border-border/60 pt-4 text-center text-xs text-muted-foreground">
                {t("landing.launchOffer.disclaimer")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 rounded-3xl border border-border/70 bg-card p-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("landing.finalCtaTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            {t("landing.finalCtaDesc")}
          </p>
          <Button asChild size="lg" className="mt-6 gap-2">
            <Link to="/signup">
              {t("landing.ctaStart")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-xs text-muted-foreground">
          © <span suppressHydrationWarning>{new Date().getFullYear()}</span> {t("common.brandPrefix")}{t("common.brandSuffix")}. {t("landing.footer")}
        </div>
      </footer>
    </div>
  );
}
