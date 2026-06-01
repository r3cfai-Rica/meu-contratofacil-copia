import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type SignupSearch = { next?: string };

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Criar conta — Aprova ai" },
      { name: "description", content: "Crie sua conta grátis no ContratoFácil." },
    ],
  }),
  component: SignupPage,
});

const ACCOUNT_TYPES = [
  { value: "mei", labelKey: "auth.accountTypes.mei" },
  { value: "autonomo", labelKey: "auth.accountTypes.autonomo" },
  { value: "prestador", labelKey: "auth.accountTypes.prestador" },
  { value: "liberal", labelKey: "auth.accountTypes.liberal" },
] as const;

const COUNTRIES = [
  { value: "BR", labelKey: "auth.countries.br" },
  { value: "US", labelKey: "auth.countries.us" },
] as const;

function SignupPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { next } = Route.useSearch();
  const { t } = useTranslation();
  const redirectTo = next && next.startsWith("/") ? next : "/dashboard";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<string>("autonomo");
  const [country, setCountry] = useState<string>("BR");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: redirectTo });
  }, [session, navigate, redirectTo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (!fullName.trim()) {
      toast.error(t("auth.enterFullName"));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectTo}`,
        data: {
          full_name: fullName.trim(),
          account_type: accountType,
          country,
        },
      },
    });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        toast.error(t("auth.emailExists"));
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success(t("auth.accountCreated"));
    navigate({ to: redirectTo });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FileText className="h-4 w-4" />
          </span>
          <span>
            {t("common.brandPrefix")}<span className="text-primary">{t("common.brandSuffix")}</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-border/70 bg-card p-8 shadow-[var(--shadow-card)]">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signupTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("auth.signupSubtitle")}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.fullName")}</Label>
              <Input
                id="name"
                placeholder={t("auth.fullNamePlaceholder")}
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="voce@exemplo.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("auth.passwordMin")}
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-type">{t("auth.accountType")}</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger id="account-type">
                  <SelectValue placeholder={t("auth.select")} />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((typeOption) => (
                    <SelectItem key={typeOption.value} value={typeOption.value}>
                      {t(typeOption.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t("auth.country")}</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="country">
                  <SelectValue placeholder={t("auth.select")} />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("auth.countryHint")}</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("auth.creatingAccount")}
                </>
              ) : (
                t("auth.createAccountFree")
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t("auth.agreeTerms")}
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link
              to="/login"
              search={next ? { next } : {}}
              className="text-primary hover:underline"
            >
              {t("auth.loginButton")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
