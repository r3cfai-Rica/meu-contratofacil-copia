import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Settings,
  Save,
  Sparkles,
  CreditCard,
  Upload,
  ExternalLink,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/hooks/use-plan";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import {
  listInvoices,
  getStripeStatus,
  cancelSubscriptionAtPeriodEnd,
  resumeSubscription,
  changePlan,
} from "@/lib/billing.functions";
import {
  createConnectAccountLink,
  getConnectAccountStatus,
} from "@/lib/stripe-connect.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PLAN_ORDER, PLANS, type PlanTier } from "@/lib/plans";
import { formatCurrencyBRL, formatDateBR } from "@/lib/format";
import { CheckCircle2, AlertTriangle, KeyRound, Globe } from "lucide-react";

type KeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Aprova ai" }] }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <AppLayout>
      <SettingsPage />
    </AppLayout>
  );
}

interface InvoiceItem {
  id: string;
  number: string | null;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string | null;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { planInfo, currentPeriodEnd, cancelAtPeriodEnd, refresh } = usePlan();
  const { isAdmin } = useIsAdmin();
  const cancelFn = useServerFn(cancelSubscriptionAtPeriodEnd);
  const resumeFn = useServerFn(resumeSubscription);
  const changePlanFn = useServerFn(changePlan);
  const invoicesFn = useServerFn(listInvoices);
  const stripeStatusFn = useServerFn(getStripeStatus);

  const [profileName, setProfileName] = useState("");
  const [accountType, setAccountType] = useState<string>("autonomo");
  const [country, setCountry] = useState<string>("BR");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pixLoading, setPixLoading] = useState(true);
  const [pixSaving, setPixSaving] = useState(false);
  const [pixId, setPixId] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState("");
  const [keyType, setKeyType] = useState<KeyType>("cpf");
  const [beneficiary, setBeneficiary] = useState("");
  const [city, setCity] = useState("");

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [subBusy, setSubBusy] = useState(false);

  type StripeStatus = Awaited<ReturnType<typeof getStripeStatus>>;
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false);

  type ConnectStatus = Awaited<ReturnType<typeof getConnectAccountStatus>>;
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectStarting, setConnectStarting] = useState(false);
  const connectLinkFn = useServerFn(createConnectAccountLink);
  const connectStatusFn = useServerFn(getConnectAccountStatus);

  const planTierName = (tier: PlanTier) => t(`plans.tiers.${tier}.name`);

  const loadConnectStatus = async () => {
    setConnectLoading(true);
    try {
      const s = await connectStatusFn();
      setConnectStatus(s);
    } catch {
      // ignore
    } finally {
      setConnectLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnectStarting(true);
    try {
      const { url } = await connectLinkFn();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start Stripe onboarding");
      setConnectStarting(false);
    }
  };

  const loadStripeStatus = async () => {
    if (!isAdmin) return;
    setStripeStatusLoading(true);
    try {
      const s = await stripeStatusFn();
      setStripeStatus(s);
    } catch {
      // ignore
    } finally {
      setStripeStatusLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void loadStripeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, account_type, logo_url, country")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile) {
        setProfileName(profile.full_name ?? "");
        setAccountType(profile.account_type ?? "autonomo");
        setLogoUrl(profile.logo_url ?? null);
        setCountry((profile as { country?: string }).country ?? "BR");
      }
      setPixLoading(true);
      const { data: pix } = await supabase
        .from("pix_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pix) {
        setPixId(pix.id);
        setPixKey(pix.pix_key);
        setKeyType(pix.key_type as KeyType);
        setBeneficiary(pix.beneficiary_name);
        setCity(pix.city);
      }
      setPixLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success(t("settings.subscriptionActivated"));
      void refresh();
      window.history.replaceState({}, "", "/configuracoes");
    }
    const connectParam = params.get("stripe_connect");
    if (connectParam === "success") {
      toast.success(t("settings.stripeConnect.returned"));
      window.history.replaceState({}, "", "/configuracoes");
    } else if (connectParam === "refresh") {
      toast.info(t("settings.stripeConnect.refresh"));
      window.history.replaceState({}, "", "/configuracoes");
    }
    void loadInvoices();
    void loadConnectStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const result = await invoicesFn();
      setInvoices(result.invoices as InvoiceItem[]);
    } catch {
      // ignore
    } finally {
      setInvoicesLoading(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profileName.trim(),
        account_type: accountType as "mei" | "autonomo" | "prestador" | "liberal",
        country,
      })
      .eq("user_id", user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success(t("settings.profileSaved"));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!planInfo.limits.customLogo) {
      toast.error(t("settings.logoLocked"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.logoTooLarge"));
      return;
    }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingLogo(false);
      return toast.error(upErr.message);
    }
    const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    await supabase.from("profiles").update({ logo_url: url }).eq("user_id", user.id);
    setLogoUrl(url);
    setUploadingLogo(false);
    toast.success(t("settings.logoUpdated"));
  };

  const handleSavePix = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!pixKey.trim()) return toast.error(t("settings.errorPixKey"));
    if (!beneficiary.trim()) return toast.error(t("settings.errorBeneficiary"));
    if (!city.trim()) return toast.error(t("settings.errorCity"));
    setPixSaving(true);
    const payload = {
      user_id: user.id,
      pix_key: pixKey.trim(),
      key_type: keyType,
      beneficiary_name: beneficiary.trim(),
      city: city.trim(),
    };
    const { error } = pixId
      ? await supabase.from("pix_settings").update(payload).eq("id", pixId)
      : await supabase.from("pix_settings").insert(payload);
    setPixSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("settings.pixSaved"));
  };

  const handleCancel = async () => {
    setSubBusy(true);
    try {
      await cancelFn();
      toast.success(t("settings.subscriptionCancelled"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.errorCancel"));
    } finally {
      setSubBusy(false);
    }
  };

  const handleResume = async () => {
    setSubBusy(true);
    try {
      await resumeFn();
      toast.success(t("settings.subscriptionResumed"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.errorResume"));
    } finally {
      setSubBusy(false);
    }
  };

  const handleChangePlan = async (target: PlanTier) => {
    if (target === "free" || target === planInfo.id) return;
    setSubBusy(true);
    try {
      await changePlanFn({ data: { plan: target as "pro" | "business" } });
      toast.success(t("settings.planChangedTo", { plan: planTierName(target) }));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.errorChangePlan"));
    } finally {
      setSubBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <form
        onSubmit={handleSaveProfile}
        className="space-y-6 rounded-2xl border border-border/70 bg-card p-6"
      >
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Settings className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("settings.profileCard")}</h2>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name">{t("settings.fullName")}</Label>
            <Input
              id="full_name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.accountType")}</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mei">{t("settings.accountTypes.mei")}</SelectItem>
                <SelectItem value="autonomo">{t("settings.accountTypes.autonomo")}</SelectItem>
                <SelectItem value="prestador">{t("settings.accountTypes.prestador")}</SelectItem>
                <SelectItem value="liberal">{t("settings.accountTypes.liberal")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("settings.country")}</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BR">{t("auth.countries.br")}</SelectItem>
                <SelectItem value="US">{t("auth.countries.us")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("settings.countryHint")}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={savingProfile} className="gap-2">
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("settings.saveProfile")}
          </Button>
        </div>
      </form>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Globe className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{t("settings.stripeConnect.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("settings.stripeConnect.description")}
            </p>
          </div>
        </div>

        {connectLoading && !connectStatus ? (
          <div className="py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            {t("settings.stripeConnect.checking")}
          </div>
        ) : !connectStatus?.connected ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <h3 className="text-sm font-semibold">{t("settings.stripeConnect.whyTitle")}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: "💵", titleKey: "whyPoint1Title", descKey: "whyPoint1Desc" },
                  { icon: "🏦", titleKey: "whyPoint2Title", descKey: "whyPoint2Desc" },
                  { icon: "⚡", titleKey: "whyPoint3Title", descKey: "whyPoint3Desc" },
                ].map((p) => (
                  <div key={p.titleKey} className="rounded-lg border border-border/50 bg-card/40 p-3">
                    <div className="text-xl">{p.icon}</div>
                    <p className="mt-1 text-sm font-medium">
                      {t(`settings.stripeConnect.${p.titleKey}`)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`settings.stripeConnect.${p.descKey}`)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-border/50 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("settings.stripeConnect.whatHappensTitle")}
                </p>
                <ol className="mt-2 space-y-1.5 text-sm">
                  {["step1", "step2", "step3"].map((k, i) => (
                    <li key={k} className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span>{t(`settings.stripeConnect.${k}`)}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">
                  ℹ️ {t("settings.stripeConnect.bankNote")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">{t("settings.stripeConnect.notConnected")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.stripeConnect.notConnectedDesc")}
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleConnectStripe}
              disabled={connectStarting}
              className="gap-2"
            >
              {connectStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {t("settings.stripeConnect.connectButton")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                connectStatus.chargesEnabled
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}
            >
              {connectStatus.chargesEnabled ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {connectStatus.chargesEnabled
                    ? t("settings.stripeConnect.connected")
                    : t("settings.stripeConnect.pending")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {connectStatus.email ?? connectStatus.accountId}
                  {connectStatus.country ? ` · ${connectStatus.country}` : ""}
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                {t("settings.charges")}:{" "}
                <span
                  className={
                    connectStatus.chargesEnabled
                      ? "font-medium text-emerald-600"
                      : "font-medium text-amber-600"
                  }
                >
                  {connectStatus.chargesEnabled
                    ? t("settings.enabled")
                    : t("settings.pendingVerification")}
                </span>
              </div>
              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                {t("settings.payouts")}:{" "}
                <span
                  className={
                    connectStatus.payoutsEnabled
                      ? "font-medium text-emerald-600"
                      : "font-medium text-amber-600"
                  }
                >
                  {connectStatus.payoutsEnabled
                    ? t("settings.enabledMasc")
                    : t("settings.pendingVerification")}
                </span>
              </div>
            </div>
            {connectStatus.requirementsDue > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                {t("settings.stripeConnect.requirementsDue", {
                  count: connectStatus.requirementsDue,
                })}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {!connectStatus.chargesEnabled && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConnectStripe}
                  disabled={connectStarting}
                  className="gap-2"
                >
                  {connectStarting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3 w-3" />
                  )}
                  {t("settings.stripeConnect.continueOnboarding")}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" asChild className="gap-2">
                <a
                  href="https://dashboard.stripe.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("settings.stripeConnect.openDashboard")}
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadConnectStatus}
                disabled={connectLoading}
                className="gap-2"
              >
                {connectLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {t("settings.stripeConnect.refresh")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-6">
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <KeyRound className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h2 className="text-base font-semibold">{t("settings.stripeCard")}</h2>
              <p className="text-xs text-muted-foreground">{t("settings.stripeDesc")}</p>
            </div>
            <Badge variant="secondary">{t("settings.adminBadge")}</Badge>
          </div>

          {stripeStatusLoading && !stripeStatus ? (
            <div className="py-4 text-sm text-muted-foreground">{t("settings.checkingConnection")}</div>
          ) : !stripeStatus?.configured ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="font-medium">{t("settings.stripeNotConfigured")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.stripeNotConfiguredDesc")}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.stripeAskUpdate")}</p>
            </div>
          ) : "error" in stripeStatus && stripeStatus.error ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="font-medium">{t("settings.stripeInvalidKey")}</p>
                  <p className="text-xs text-muted-foreground">{stripeStatus.error}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.stripeAskFix")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div className="flex-1">
                  <p className="font-medium">
                    {t("settings.stripeConnected")}{" "}
                    <Badge variant={stripeStatus.livemode ? "default" : "secondary"} className="ml-1">
                      {stripeStatus.livemode ? t("settings.live") : t("settings.test")}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stripeStatus.businessName ?? stripeStatus.accountEmail ?? stripeStatus.accountId}
                    {stripeStatus.country ? ` · ${stripeStatus.country}` : ""}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                  {t("settings.charges")}:{" "}
                  <span className={stripeStatus.chargesEnabled ? "font-medium text-emerald-600" : "font-medium text-amber-600"}>
                    {stripeStatus.chargesEnabled ? t("settings.enabled") : t("settings.pendingVerification")}
                  </span>
                </div>
                <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                  {t("settings.payouts")}:{" "}
                  <span className={stripeStatus.payoutsEnabled ? "font-medium text-emerald-600" : "font-medium text-amber-600"}>
                    {stripeStatus.payoutsEnabled ? t("settings.enabledMasc") : t("settings.pendingVerification")}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.stripeAskChange")}</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadStripeStatus}
              disabled={stripeStatusLoading}
              className="gap-2"
            >
              {stripeStatusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("settings.checkConnection")}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{t("settings.planCard")}</h2>
            <p className="text-xs text-muted-foreground">{t("settings.planDesc")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{planTierName(planInfo.id)}</span>
              <Badge variant="secondary">
                {planInfo.monthlyPriceBRL > 0 ? `R$${planInfo.monthlyPriceBRL}${t("plans.month")}` : t("settings.free")}
              </Badge>
              {cancelAtPeriodEnd && <Badge variant="destructive">{t("settings.cancelling")}</Badge>}
            </div>
            {currentPeriodEnd && (
              <p className="mt-1 text-xs text-muted-foreground">
                {cancelAtPeriodEnd ? t("settings.accessUntil") : t("settings.nextRenewal")}{" "}
                {formatDateBR(currentPeriodEnd)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {planInfo.id === "free" ? (
              <Button asChild className="gap-2">
                <Link to="/planos">
                  <Sparkles className="h-4 w-4" /> {t("settings.viewPlans")}
                </Link>
              </Button>
            ) : (
              <>
                {PLAN_ORDER.filter((tier) => tier !== "free" && tier !== planInfo.id).map((tier) => (
                  <Button
                    key={tier}
                    variant="outline"
                    className="gap-2"
                    disabled={subBusy}
                    onClick={() => handleChangePlan(tier)}
                  >
                    {subBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t("settings.switchTo", { plan: planTierName(tier) })}
                  </Button>
                ))}
                {cancelAtPeriodEnd ? (
                  <Button onClick={handleResume} disabled={subBusy} className="gap-2">
                    {subBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {t("settings.resumeRenewal")}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={subBusy} className="gap-2">
                        {t("settings.cancelSubscription")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("settings.cancelDialogTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("settings.cancelDialogDesc", {
                            plan: planTierName(planInfo.id),
                            period: currentPeriodEnd
                              ? t("settings.untilDate", { date: formatDateBR(currentPeriodEnd) })
                              : t("settings.untilEndOfPeriod"),
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("settings.keepSubscription")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel}>
                          {t("settings.cancelAnyway")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("settings.invoicesHistory")}</h3>
            <Button variant="ghost" size="sm" onClick={loadInvoices} disabled={invoicesLoading}>
              {invoicesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : t("settings.refresh")}
            </Button>
          </div>
          {invoices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
              {invoicesLoading ? t("settings.loading") : t("settings.noInvoices")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.invoiceNumber")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.invoiceDate")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.invoiceAmount")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("settings.invoiceStatus")}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono text-xs">{inv.number ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateBR(new Date(inv.created * 1000).toISOString())}
                      </td>
                      <td className="px-3 py-2">
                        {formatCurrencyBRL((inv.amount_paid || inv.amount_due) / 100)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                          {inv.status ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {inv.invoice_pdf && (
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                            <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ImageIcon className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{t("settings.logoCard")}</h2>
            <p className="text-xs text-muted-foreground">{t("settings.logoDesc")}</p>
          </div>
          {!planInfo.limits.customLogo && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" /> {t("settings.proBadge")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-2" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!planInfo.limits.customLogo || uploadingLogo}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {logoUrl ? t("settings.changeLogo") : t("settings.uploadLogo")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("settings.logoFormats")}</p>
            {!planInfo.limits.customLogo && (
              <Link to="/planos" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Sparkles className="h-3 w-3" /> {t("settings.logoUpgrade")}
              </Link>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSavePix}
        className="space-y-6 rounded-2xl border border-border/70 bg-card p-6"
      >
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Settings className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("settings.pixCard")}</h2>
            <p className="text-xs text-muted-foreground">{t("settings.pixDesc")}</p>
          </div>
        </div>
        {pixLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("settings.loading")}</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.pixKeyType")} *</Label>
                <Select value={keyType} onValueChange={(v) => setKeyType(v as KeyType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">{t("settings.keyTypes.cpf")}</SelectItem>
                    <SelectItem value="cnpj">{t("settings.keyTypes.cnpj")}</SelectItem>
                    <SelectItem value="email">{t("settings.keyTypes.email")}</SelectItem>
                    <SelectItem value="phone">{t("settings.keyTypes.phone")}</SelectItem>
                    <SelectItem value="random">{t("settings.keyTypes.random")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="key">{t("settings.pixKey")} *</Label>
                <Input
                  id="key"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder={t("settings.pixKeyPlaceholder")}
                  maxLength={120}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ben">{t("settings.beneficiary")} *</Label>
                <Input
                  id="ben"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  maxLength={25}
                />
                <p className="text-xs text-muted-foreground">{t("settings.beneficiaryHelp")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t("settings.city")} *</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={15}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pixSaving} className="gap-2">
                {pixSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("settings.savePix")}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
