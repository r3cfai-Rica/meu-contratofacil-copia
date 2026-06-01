import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset password — Aprova ai" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.passwordUpdated"));
    navigate({ to: "/dashboard" });
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
            <h1 className="text-2xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("auth.resetSubtitle")}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.newPassword")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("auth.passwordMin")}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}
                </>
              ) : (
                t("auth.saveNewPassword")
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
