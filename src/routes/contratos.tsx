import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileSignature, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContractFormDialog } from "@/components/contracts/ContractFormDialog";
import { ContractDetailDialog } from "@/components/contracts/ContractDetailDialog";
import {
  ContractStatusBadge,
  type ContractStatus,
} from "@/components/contracts/ContractStatusBadge";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDateBR } from "@/lib/format";

export const Route = createFileRoute("/contratos")({
  head: () => ({ meta: [{ title: "Contratos — Aprova ai" }] }),
  component: ContractsRoute,
});

function ContractsRoute() {
  return (
    <AppLayout>
      <ContractsPage />
    </AppLayout>
  );
}

interface Contract {
  id: string;
  contract_number: string;
  title: string;
  service_type: string;
  service_description: string | null;
  total_value: number;
  payment_method: string;
  start_date: string;
  end_date: string | null;
  clauses: string | null;
  status: ContractStatus;
  public_token: string | null;
  currency?: string | null;
  client_id: string;
  clients: { full_name: string } | null;
}

function ContractsPage() {
  const { user } = useAuth();
  const { planInfo, loading: planLoading } = usePlan();
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selected, setSelected] = useState<Contract | null>(null);

  const limit = planInfo.limits.maxActiveContracts;
  const activeCount = contracts.filter((c) => c.status !== "cancelled").length;
  const handleNewContract = () => {
    if (planLoading) return;
    if (limit !== null && activeCount >= limit) {
      setUpgradeOpen(true);
      return;
    }
    setDialogOpen(true);
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id, contract_number, title, service_type, service_description, total_value, payment_method, start_date, end_date, clauses, status, public_token, currency, client_id, clients(full_name)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setContracts((data ?? []) as unknown as Contract[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.clients?.full_name.toLowerCase().includes(q) ||
        c.service_type.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q)
      );
    });
  }, [contracts, search, statusFilter]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("contracts.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("contracts.subtitle")}
          </p>
        </div>
        <Button className="gap-2" onClick={handleNewContract} disabled={planLoading}>
          <Plus className="h-4 w-4" /> {t("contracts.new")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("contracts.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ContractStatus | "all")}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
            <SelectItem value="draft">{t("contracts.status.draft")}</SelectItem>
            <SelectItem value="sent">{t("contracts.status.sent")}</SelectItem>
            <SelectItem value="awaiting_signature">{t("contracts.status.awaiting_signature")}</SelectItem>
            <SelectItem value="signed">{t("contracts.status.signed")}</SelectItem>
            <SelectItem value="cancelled">{t("contracts.status.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <FileSignature className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold">
              {contracts.length === 0 ? t("contracts.empty") : t("common.nothingFound")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {contracts.length === 0
                ? t("contracts.emptyDesc")
                : t("common.tryAdjustFilters")}
            </p>
            {contracts.length === 0 && (
              <Button className="mt-5 gap-2" onClick={handleNewContract} disabled={planLoading}>
                <Plus className="h-4 w-4" /> {t("contracts.new")}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("contracts.number")}</TableHead>
                <TableHead>{t("common.client")}</TableHead>
                <TableHead>{t("contracts.service")}</TableHead>
                <TableHead>{t("common.value")}</TableHead>
                <TableHead>{t("contracts.startDate")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <TableCell className="font-mono text-xs">
                    {c.contract_number}
                  </TableCell>
                  <TableCell className="font-medium">
                    {c.clients?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.service_type}
                  </TableCell>
                  <TableCell>{formatMoney(Number(c.total_value), c.currency)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateBR(c.start_date)}
                  </TableCell>
                  <TableCell>
                    <ContractStatusBadge status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ContractFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        resource="contratos"
        limit={limit ?? 0}
      />

      <ContractDetailDialog
        contract={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={() => {
          void load();
          // refresh selected with fresh data
          if (selected) {
            supabase
              .from("contracts")
              .select(
                "id, contract_number, title, service_type, service_description, total_value, payment_method, start_date, end_date, clauses, status, public_token, client_id, clients(full_name)",
              )
              .eq("id", selected.id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setSelected(data as unknown as Contract);
              });
          }
        }}
      />
    </div>
  );
}
