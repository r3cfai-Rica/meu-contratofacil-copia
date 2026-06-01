import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileSignature,
  Loader2,
  PenLine,
  Type as TypeIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  ContractStatusBadge,
  type ContractStatus,
} from "@/components/contracts/ContractStatusBadge";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/contracts/SignaturePad";
import { renderTypedSignature } from "@/lib/typedSignature";
import { generateContractPdf } from "@/lib/contractPdf";
import { formatMoneyByLang, formatDateByLang, maskDocument, isValidDocument } from "@/lib/format";

export const Route = createFileRoute("/c/$token")({
  validateSearch: (search: Record<string, unknown>) => ({
    lang:
      search.lang === "en-US" || search.lang === "pt-BR"
        ? (search.lang as "en-US" | "pt-BR")
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign contract — Aprova ai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicContractPage,
});

interface PublicContract {
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
  client_id: string;
  user_id: string;
  signer_name: string | null;
  signer_document: string | null;
  signer_birth_date: string | null;
  signer_display_name: string | null;
  signature_data: string | null;
  signature_type: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  clients: { full_name: string; document: string | null; email: string | null } | null;
}

function PublicContractPage() {
  const { token } = Route.useParams();
  const { lang } = Route.useSearch();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (lang && i18n.language !== lang) {
      void i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  const [contract, setContract] = useState<PublicContract | null>(null);
  const [providerName, setProviderName] = useState<string>("");
  const [providerLogo, setProviderLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  const [agreed, setAgreed] = useState(false);

  const [signerName, setSignerName] = useState("");
  const [document, setDocumentValue] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [signMode, setSignMode] = useState<"draw" | "type">("draw");
  const padRef = useRef<SignaturePadHandle>(null);
  const [signing, setSigning] = useState(false);

  const STEPS = [
    { id: 1, label: t("publicContract.steps.read") },
    { id: 2, label: t("publicContract.steps.data") },
    { id: 3, label: t("publicContract.steps.sign") },
  ];

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_contract_by_token", {
        p_token: token,
      });

      if (error) toast.error(error.message);
      const raw = data as (PublicContract & { provider?: { full_name: string | null; logo_url: string | null } }) | null;
      const c = raw as unknown as PublicContract | null;
      setContract(c);

      if (c) {
        setSignerName(c.signer_name || c.clients?.full_name || "");
        setDocumentValue(c.signer_document || c.clients?.document || "");
        setDisplayName(c.signer_display_name || c.signer_name || c.clients?.full_name || "");
        setBirthDate(c.signer_birth_date || "");

        const provider = raw?.provider;
        if (provider?.full_name) setProviderName(provider.full_name);
        if (provider?.logo_url) setProviderLogo(provider.logo_url);
      }
      setLoading(false);
    })();
  }, [token]);


  useEffect(() => {
    if (!displayName && signerName) setDisplayName(signerName);
  }, [signerName, displayName]);

  const isSigned = contract?.status === "signed";
  const isCancelled = contract?.status === "cancelled";

  const validateStep2 = (): string | null => {
    if (!signerName.trim()) return t("publicContract.errFullName");
    if (!isValidDocument(document)) return t("publicContract.errInvalidCpf");
    if (document.replace(/\D/g, "").length !== 11) return t("publicContract.errCpfDigits");
    if (!birthDate) return t("publicContract.errBirthDate");
    if (!displayName.trim()) return t("publicContract.errDisplayName");
    return null;
  };

  const goToStep2 = () => {
    if (!agreed) return;
    setStep(2);
  };

  const goToStep3 = () => {
    const err = validateStep2();
    if (err) {
      toast.error(err);
      return;
    }
    setStep(3);
  };

  const fetchClientIp = async (): Promise<string | null> => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const json = await res.json();
      return typeof json.ip === "string" ? json.ip : null;
    } catch {
      return null;
    }
  };

  const handleSign = async () => {
    if (!contract) return;
    let signatureData = "";
    if (signMode === "draw") {
      if (padRef.current?.isEmpty()) {
        toast.error(t("publicContract.drawHint"));
        return;
      }
      signatureData = padRef.current?.toDataURL() ?? "";
    } else {
      if (!displayName.trim()) {
        toast.error(t("publicContract.typedHint"));
        return;
      }
      signatureData = renderTypedSignature(displayName);
    }

    setSigning(true);
    const ip = await fetchClientIp();

    const { data, error } = await supabase.rpc("sign_contract_by_token", {
      p_token: token,
      p_signer_name: signerName.trim(),
      p_signer_document: document,
      p_signer_birth_date: birthDate,
      p_signer_display_name: displayName.trim(),
      p_signature_data: signatureData,
      p_signature_type: signMode === "draw" ? "drawn" : "typed",
      p_signer_ip: ip ?? "",
    });

    setSigning(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("publicContract.signed"));
    setContract(data as unknown as PublicContract);

  };

  const downloadPdf = async () => {
    if (!contract) return;
    const pdf = await generateContractPdf({
      ...contract,
      provider_name: providerName,
      provider_logo_url: providerLogo,
      client_name: contract.clients?.full_name ?? null,
      language: i18n.language === "en-US" ? "en-US" : "pt-BR",
    });
    pdf.save(`${contract.contract_number}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-2xl border border-border/70 bg-card p-10 text-center">
          <h1 className="text-lg font-semibold">{t("publicContract.notFound")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("publicContract.notFoundDesc")}</p>
        </div>
      </div>
    );
  }

  const paymentLabel = (m: string) => {
    if (m === "one_time" || m === "installments" || m === "recurring") {
      return t(`publicContract.paymentMethods.${m}`);
    }
    return m;
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <PublicHeader />

      <main className="mx-auto max-w-4xl px-4 pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("publicContract.provider")}
            </div>
            <div className="text-sm font-medium">{providerName || t("publicContract.providerFallback")}</div>
          </div>
          <ContractStatusBadge status={contract.status} />
        </div>

        {isSigned ? (
          <SignedConfirmation
            contract={contract}
            providerName={providerName}
            onDownload={downloadPdf}
            paymentLabel={paymentLabel}
          />
        ) : isCancelled ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
            {t("publicContract.cancelled")}
          </div>
        ) : (
          <>
            <ProgressBar step={step} steps={STEPS} />

            <ContractDocument contract={contract} paymentLabel={paymentLabel} />

            {step === 1 && (
              <StepCard>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="agree"
                    checked={agreed}
                    onCheckedChange={(c) => setAgreed(c === true)}
                  />
                  <Label htmlFor="agree" className="text-sm leading-relaxed">
                    {t("publicContract.agree")}
                  </Label>
                </div>
                <div className="mt-5 flex justify-end">
                  <Button onClick={goToStep2} disabled={!agreed}>
                    {t("publicContract.continue")}
                  </Button>
                </div>
              </StepCard>
            )}

            {step === 2 && (
              <StepCard title={t("publicContract.yourData")}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="full">{t("publicContract.fullName")}</Label>
                    <Input
                      id="full"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">{t("publicContract.cpf")}</Label>
                    <Input
                      id="cpf"
                      value={document}
                      onChange={(e) => setDocumentValue(maskDocument(e.target.value))}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth">{t("publicContract.birthDate")}</Label>
                    <Input
                      id="birth"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="display">{t("publicContract.signAs")}</Label>
                    <Input
                      id="display"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("publicContract.signAsPlaceholder")}
                    />
                  </div>
                </div>
                <div className="mt-5 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    {t("publicContract.back")}
                  </Button>
                  <Button onClick={goToStep3}>{t("publicContract.continue")}</Button>
                </div>
              </StepCard>
            )}

            {step === 3 && (
              <StepCard title={t("publicContract.digitalSignature")}>
                <Tabs value={signMode} onValueChange={(v) => setSignMode(v as "draw" | "type")}>
                  <TabsList className="grid w-full grid-cols-2 sm:w-80">
                    <TabsTrigger value="draw" className="gap-2">
                      <PenLine className="h-3.5 w-3.5" /> {t("publicContract.draw")}
                    </TabsTrigger>
                    <TabsTrigger value="type" className="gap-2">
                      <TypeIcon className="h-3.5 w-3.5" /> {t("publicContract.type")}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="draw" className="mt-4">
                    <SignaturePad ref={padRef} />
                  </TabsContent>

                  <TabsContent value="type" className="mt-4">
                    <TypedPreview name={displayName} />
                  </TabsContent>
                </Tabs>

                <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  {t("publicContract.legalNote")}
                </div>

                <div className="mt-5 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    {t("publicContract.back")}
                  </Button>
                  <Button onClick={handleSign} disabled={signing} className="gap-2">
                    {signing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {t("publicContract.signContract")}
                  </Button>
                </div>
              </StepCard>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PublicHeader() {
  const { t } = useTranslation();
  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <FileSignature className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          {t("common.brandPrefix")}{t("common.brandSuffix")}
        </span>
      </div>
    </header>
  );
}

function ProgressBar({ step, steps }: { step: number; steps: { id: number; label: string }[] }) {
  return (
    <div className="mb-6 rounded-2xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-center gap-3">
        {steps.map((s, i) => {
          const active = step === s.id;
          const done = step > s.id;
          return (
            <div key={s.id} className="flex flex-1 items-center gap-3">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                  done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : s.id}
              </div>
              <span
                className={`text-xs sm:text-sm ${
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && <div className="h-px flex-1 bg-border/60" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContractDocument({
  contract,
  paymentLabel,
}: {
  contract: PublicContract;
  paymentLabel: (m: string) => string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <article className="mb-6 rounded-2xl border border-border/70 bg-card p-6 sm:p-8">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {contract.contract_number}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{contract.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{contract.service_type}</p>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Field label={t("publicContract.client")} value={contract.clients?.full_name ?? "—"} />
        <Field label={t("publicContract.amount")} value={formatMoneyByLang(Number(contract.total_value), i18n.language)} />
        <Field label={t("publicContract.payment")} value={paymentLabel(contract.payment_method)} />
        <Field label={t("publicContract.start")} value={formatDateByLang(contract.start_date, i18n.language)} />
        {contract.end_date && (
          <Field label={t("publicContract.end")} value={formatDateByLang(contract.end_date, i18n.language)} />
        )}
      </dl>

      {contract.service_description && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("publicContract.serviceDescription")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {contract.service_description}
          </p>
        </section>
      )}

      {contract.clauses && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("publicContract.clauses")}
          </h2>
          <div className="prose-contract mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-background/40 p-4 font-sans text-sm leading-relaxed text-foreground/90">
            {contract.clauses}
          </div>
        </section>
      )}
    </article>
  );
}

function StepCard({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6">
      {title && <h3 className="mb-4 text-base font-semibold">{title}</h3>}
      {children}
    </div>
  );
}

function TypedPreview({ name }: { name: string }) {
  const { t } = useTranslation();
  const dataUrl = useMemo(() => renderTypedSignature(name || " "), [name]);
  return (
    <div className="rounded-xl border border-border/70 bg-white p-4">
      <img src={dataUrl} alt={t("publicContract.typedPreview")} className="mx-auto h-32 object-contain" />
      <p className="mt-2 text-center text-xs text-slate-500">
        {t("publicContract.typedPreviewCaption")}
      </p>
    </div>
  );
}

function SignedConfirmation({
  contract,
  providerName,
  onDownload,
  paymentLabel,
}: {
  contract: PublicContract;
  providerName: string;
  onDownload: () => void;
  paymentLabel: (m: string) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-emerald-100">
          {t("publicContract.signedHeader")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-200/80">
          {t("publicContract.signedDesc")}
        </p>
        <Button onClick={onDownload} className="mt-6 gap-2">
          <Download className="h-4 w-4" /> {t("publicContract.downloadPdf")}
        </Button>
      </div>

      <ContractDocument contract={contract} paymentLabel={paymentLabel} />

      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h3 className="mb-4 text-base font-semibold">{t("publicContract.signatureRecord")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {contract.signature_data && (
            <div className="sm:col-span-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("publicContract.signature")}
              </div>
              <div className="mt-2 rounded-xl border border-border/60 bg-white p-3">
                <img
                  src={contract.signature_data}
                  alt={t("publicContract.signature")}
                  className="mx-auto h-28 object-contain"
                />
              </div>
            </div>
          )}
          <Field label={t("publicContract.signedBy")} value={contract.signer_display_name ?? "—"} />
          <Field label={t("publicContract.signerName")} value={contract.signer_name ?? "—"} />
          <Field label={t("publicContract.signerCpf")} value={contract.signer_document ?? "—"} />
          <Field
            label={t("publicContract.dateTime")}
            value={contract.signed_at ? new Date(contract.signed_at).toLocaleString(i18n.language) : "—"}
          />
          <Field label={t("publicContract.originIp")} value={contract.signer_ip ?? "—"} />
          <Field label={t("publicContract.providerLabel")} value={providerName || "—"} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
