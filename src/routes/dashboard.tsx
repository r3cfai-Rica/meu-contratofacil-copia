import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  FileSignature,
  Wallet,
  Clock,
  Plus,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  ContractStatusBadge,
  type ContractStatus,
} from "@/components/contracts/ContractStatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDateByLang, formatDateTimeByLang } from "@/lib/format";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Aprova ai" },
      { name: "description", content: "Painel de controle do Aprova ai." },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <AppLayout>
      <DashboardPage />
    </AppLayout>
  );
}

interface Stats {
  clients: number;
  activeContracts: number;
  pendingAmount: number;
  pendingCurrency?: string | null;
  awaitingSignature: number;
}

interface ContractRow {
  id: string;
  contract_number: string;
  title: string;
  total_value: number;
  start_date: string;
  status: ContractStatus;
  signed_at: string | null;
  currency?: string | null;
  clients: { full_name: string } | null;
}

function DashboardPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    clients: 0,
    activeContracts: 0,
    pendingAmount: 0,
    pendingCurrency: undefined,
    awaitingSignature: 0,
  });
  const [recent, setRecent] = useState<ContractRow[]>([]);
  const [recentlySigned, setRecentlySigned] = useState<ContractRow[]>([]);

  useEffect(() => {
    if (!user) return;

    void (async () => {
      const [clientsRes, contractsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("contracts")
          .select(
            "id, contract_number, title, total_value, start_date, status, signed_at, currency, clients(full_name)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const all = (contractsRes.data ?? []) as unknown as ContractRow[];
      const active = all.filter((c) => c.status === "signed");
      const awaiting = all.filter((c) => c.status === "awaiting_signature");
      const pending = active.reduce((sum, c) => sum + Number(c.total_value), 0);

      // Signed in the last 7 days
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const newlySigned = all
        .filter(
          (c) =>
            c.status === "signed" &&
            c.signed_at &&
            new Date(c.signed_at).getTime() > weekAgo,
        )
        .slice(0, 5);

      setStats({
        clients: clientsRes.count ?? 0,
        activeContracts: active.length,
        pendingAmount: pending,
        pendingCurrency: active[0]?.currency,
        awaitingSignature: awaiting.length,
      });
      setRecent(all.slice(0, 5));
      setRecentlySigned(newlySigned);
    })();
  }, [user]);

  const cards = [
    { label: t("dashboard.stats.clients"), value: stats.clients.toString(), icon: Users },
    {
      label: t("dashboard.stats.activeContracts"),
      value: stats.activeContracts.toString(),
      icon: FileSignature,
    },
    {
      label: t("dashboard.stats.pending"),
      value: formatMoney(stats.pendingAmount, stats.pendingCurrency),
      icon: Wallet,
    },
    {
      label: t("dashboard.stats.awaiting"),
      value: stats.awaitingSignature.toString(),
      icon: Clock,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/contratos">
            <Plus className="h-4 w-4" /> {t("dashboard.newContract")}
          </Link>
        </Button>
      </div>

      {recentlySigned.length > 0 && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-emerald-100">
                {recentlySigned.length === 1
                  ? t("dashboard.signedRecentlyOne")
                  : t("dashboard.signedRecentlyMany", { count: recentlySigned.length })}
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-emerald-200/90">
                {recentlySigned.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      <span className="font-mono text-xs opacity-70">
                        {c.contract_number}
                      </span>{" "}
                      · {c.title} — {c.clients?.full_name ?? "—"}
                    </span>
                    <span className="shrink-0 text-xs opacity-70">
                      {c.signed_at
                        ? formatDateTimeByLang(c.signed_at, i18n.language)
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-border/70 bg-card p-5 transition hover:border-primary/30"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
          </div>
        ))}
      </section>

      {/* Lists */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold">{t("dashboard.lastContracts")}</h2>
            <Button asChild size="sm" variant="ghost" className="gap-1 text-xs">
              <Link to="/contratos">
                {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          {recent.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noContracts")}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link to="/contratos">{t("dashboard.createContract")}</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {recent.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.clients?.full_name ?? "—"} ·{" "}
                      {formatMoney(Number(c.total_value), c.currency)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ContractStatusBadge status={c.status} />
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {formatDateByLang(c.start_date, i18n.language)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold">{t("dashboard.nextInvoices")}</h2>
            <Button asChild size="sm" variant="ghost" className="gap-1 text-xs">
              <Link to="/cobrancas">
                {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {t("dashboard.noUpcomingInvoices")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
