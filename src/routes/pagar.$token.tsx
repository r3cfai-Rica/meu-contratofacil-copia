import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, CheckCircle2, Copy, CreditCard, FileText, Loader2, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildPixPayload } from "@/lib/pix";
import { formatDateByLang, formatMoney } from "@/lib/format";
import { createInvoiceCheckout } from "@/lib/invoice-payments.functions";
import {
  InvoiceStatusBadge,
  getEffectiveStatus,
  type InvoiceStatus,
} from "@/components/invoices/InvoiceStatusBadge";

type PaymentSearch = { status?: "success" | "cancelled"; lang?: "pt-BR" | "en-US" };

export const Route = createFileRoute("/pagar/$token")({
  validateSearch: (search: Record<string, unknown>): PaymentSearch => ({
    status:
      search.status === "success" || search.status === "cancelled"
        ? search.status
        : undefined,
    lang:
      search.lang === "en-US" || search.lang === "pt-BR"
        ? (search.lang as "en-US" | "pt-BR")
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pay invoice — Aprova ai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicInvoicePage,
});

interface PublicInvoice {
  id: string;
  description: string;
  amount: number;
  currency: string | null;
  due_date: string;
  status: InvoiceStatus;
  paid_at: string | null;
  user_id: string;
  public_token: string | null;
  clients: { full_name: string } | null;
}

interface PixSettings {
  pix_key: string;
  beneficiary_name: string;
  city: string;
}

function PublicInvoicePage() {
  const { token } = Route.useParams();
  const { t, i18n } = useTranslation();
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [pix, setPix] = useState<PixSettings | null>(null);
  const [providerName, setProviderName] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState<"key" | "code" | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingCard, setPayingCard] = useState(false);
  const search = Route.useSearch();
  const createCheckout = useServerFn(createInvoiceCheckout);

  const loadInvoice = async () => {
    const { data } = await supabase.rpc("get_invoice_by_token", { p_token: token });
    return data as unknown as
      | (PublicInvoice & {
          provider?: { full_name: string | null } | null;
          pix?: PixSettings | null;
        })
      | null;
  };

  useEffect(() => {
    void (async () => {
      const inv = await loadInvoice();
      setInvoice(inv);

      if (inv) {
        const pixData = inv.pix ?? null;
        setPix(pixData);
        if (inv.provider?.full_name) setProviderName(inv.provider.full_name);

        if (pixData) {
          const payload = buildPixPayload({
            pixKey: pixData.pix_key,
            beneficiaryName: pixData.beneficiary_name,
            city: pixData.city,
            amount: Number(inv.amount),
            txid: inv.id.replace(/-/g, "").slice(0, 25),
            description: inv.description,
          });
          const url = await QRCode.toDataURL(payload, {
            width: 320,
            margin: 1,
            color: { dark: "#0F172A", light: "#FFFFFF" },
          });
          setQrUrl(url);
        }
      }
      setLoading(false);
    })();
  }, [token]);


  useEffect(() => {
    if (search.lang && i18n.language !== search.lang) {
      void i18n.changeLanguage(search.lang);
    }
  }, [search.lang, i18n]);

  useEffect(() => {
    if (search.status === "success") {
      toast.success(t("publicInvoice.paymentSuccess"));
      void (async () => {
        const fresh = await loadInvoice();
        if (fresh) setInvoice(fresh);
      })();
    } else if (search.status === "cancelled") {
      toast.error(t("publicInvoice.paymentCancelled"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.status]);

  const payWithCard = async () => {
    setPayingCard(true);
    try {
      const { url } = await createCheckout({ data: { invoiceToken: token } });
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setPayingCard(false);
    }
  };

  const copy = async (text: string, type: "key" | "code") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success(type === "key" ? t("publicInvoice.keyCopied") : t("publicInvoice.codeCopied"));
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t("publicInvoice.loading")}</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-2xl border border-border/70 bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">{t("publicInvoice.notFound")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("publicInvoice.notFoundDesc")}</p>
        </div>
      </div>
    );
  }

  const effective = getEffectiveStatus(invoice.status, invoice.due_date);
  const isPaid = effective === "paid";
  const isCancelled = effective === "cancelled";
  const pixPayload =
    pix &&
    buildPixPayload({
      pixKey: pix.pix_key,
      beneficiaryName: pix.beneficiary_name,
      city: pix.city,
      amount: Number(invoice.amount),
      txid: invoice.id.replace(/-/g, "").slice(0, 25),
      description: invoice.description,
    });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70 bg-card/40">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <span>
              {t("common.brandPrefix")}<span className="text-primary">{t("common.brandSuffix")}</span>
            </span>
          </div>
          {providerName && (
            <span className="text-xs text-muted-foreground">
              {t("publicInvoice.providerLabel")}{" "}
              <strong className="text-foreground">{providerName}</strong>
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("publicInvoice.pixBadge")}
              </p>
              <h1 className="mt-1 text-lg font-semibold">{invoice.description}</h1>
              {invoice.clients?.full_name && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("publicInvoice.for", { name: invoice.clients.full_name })}
                </p>
              )}
            </div>
            <InvoiceStatusBadge status={effective} />
          </div>

          <div className="mt-5 grid gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("publicInvoice.amountDue")}</p>
              <p className="mt-1 text-3xl font-semibold text-primary">
                {formatMoney(Number(invoice.amount), invoice.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("publicInvoice.dueDate")}</p>
              <p className="mt-1 text-base font-medium">{formatDateByLang(invoice.due_date, i18n.language)}</p>
            </div>
          </div>
        </div>

        {isPaid ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <h2 className="mt-3 text-lg font-semibold text-emerald-200">
              {t("publicInvoice.paidConfirmed")}
            </h2>
            {invoice.paid_at && (
              <p className="mt-1 text-sm text-emerald-200/80">
                {t("publicInvoice.paidOn", { date: formatDateByLang(invoice.paid_at, i18n.language) })}
              </p>
            )}
          </div>
        ) : isCancelled ? (
          <div className="rounded-2xl border border-border/70 bg-card p-6 text-center">
            <h2 className="text-base font-semibold">{t("publicInvoice.cancelled")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("publicInvoice.cancelledDesc", {
                provider: providerName || t("publicInvoice.providerFallback"),
              })}
            </p>
          </div>
        ) : invoice.currency === "USD" ? (
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <div className="flex items-center gap-2 border-b border-border/60 pb-3">
              <CreditCard className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">{t("publicInvoice.payWithCard")}</h2>
              <span className="ml-auto text-xs text-yellow-300">
                {t("publicInvoice.awaiting")}
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("publicInvoice.payWithCardDesc")}
            </p>
            <Button
              className="mt-5 w-full gap-2"
              size="lg"
              onClick={payWithCard}
              disabled={payingCard}
            >
              {payingCard ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("publicInvoice.processing")}
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  {t("publicInvoice.payNow")}
                </>
              )}
            </Button>
          </div>
        ) : !pix || !pixPayload ? (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center text-sm text-yellow-200">
            {t("publicInvoice.noPix")}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border/70 bg-card p-6">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                <QrCode className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t("publicInvoice.payWithPix")}</h2>
                <span className="ml-auto text-xs text-yellow-300">
                  {t("publicInvoice.awaiting")}
                </span>
              </div>

              <div className="mt-5 grid gap-6 sm:grid-cols-[auto,1fr] sm:items-center">
                {qrUrl && (
                  <div className="mx-auto rounded-xl bg-white p-3">
                    <img src={qrUrl} alt={t("publicInvoice.qrAlt")} className="h-48 w-48" />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("publicInvoice.pixKey", { name: pix.beneficiary_name })}
                    </p>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                      <span className="flex-1 truncate font-mono text-sm">{pix.pix_key}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(pix.pix_key, "key")}
                        className="gap-1"
                      >
                        {copied === "key" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {t("publicInvoice.copy")}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("publicInvoice.copyAndPaste")}</p>
                    <div className="mt-1 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                      <span className="flex-1 break-all font-mono text-[11px] leading-relaxed">
                        {pixPayload}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(pixPayload, "code")}
                        className="shrink-0 gap-1"
                      >
                        {copied === "code" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {t("publicInvoice.copy")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-6">
              <h2 className="text-sm font-semibold">{t("publicInvoice.howTo")}</h2>
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                {[
                  t("publicInvoice.step1"),
                  t("publicInvoice.step2"),
                  t("publicInvoice.step3"),
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {t("publicInvoice.manualNote")}
              </p>
            </div>
          </>
        )}

        <p className="pt-2 text-center text-xs text-muted-foreground">
          {t("publicInvoice.footer")}{" "}
          <span className="font-semibold text-foreground">
            {t("common.brandPrefix")}<span className="text-primary">{t("common.brandSuffix")}</span>
          </span>
        </p>
      </main>
    </div>
  );
}
