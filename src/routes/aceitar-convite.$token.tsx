import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileSignature, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite } from "@/lib/team.functions";

export const Route = createFileRoute("/aceitar-convite/$token")({
  head: () => ({
    meta: [
      { title: "Accept invite — Aprova ai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptInvitePage,
});

interface InviteRow {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  owner_id: string;
}

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptInvite);
  const { t } = useTranslation();

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [ownerName, setOwnerName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_team_invite_by_token", { p_token: token });
      const row = data as (InviteRow & { owner_name?: string | null }) | null;
      setInvite(row ?? null);
      if (row?.owner_name) setOwnerName(row.owner_name);
      setLoading(false);
    })();
  }, [token]);


  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptFn({ data: { token } });
      toast.success(t("invite.accepted"));
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("invite.errorAccept"));
    } finally {
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!invite) {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold">{t("invite.invalid")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invite.invalidDesc")}</p>
      </CenteredCard>
    );
  }

  if (invite.status === "revoked") {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold">{t("invite.revoked")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invite.revokedDesc")}</p>
      </CenteredCard>
    );
  }

  if (invite.status === "accepted") {
    return (
      <CenteredCard>
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
        <h1 className="text-lg font-semibold">{t("invite.alreadyAccepted")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("invite.alreadyAcceptedDesc", { owner: ownerName || t("invite.thisProvider") })}
        </p>
        <Button asChild className="mt-5">
          <Link to="/dashboard">{t("invite.goToDashboard")}</Link>
        </Button>
      </CenteredCard>
    );
  }

  if (!user) {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold">{t("invite.youWereInvited")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("invite.invitedBy", {
            owner: ownerName || t("invite.anyProvider"),
            email: invite.email,
          })}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("invite.loginOrCreate")}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/login" search={{ next: `/aceitar-convite/${token}` }}>
              {t("invite.login")}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/signup" search={{ next: `/aceitar-convite/${token}` }}>
              {t("invite.createAccount")}
            </Link>
          </Button>
        </div>
      </CenteredCard>
    );
  }

  const emailMismatch =
    user.email && invite.email.toLowerCase() !== user.email.toLowerCase();

  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold">{t("invite.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("invite.invitedYou", { owner: ownerName || t("invite.anyProvider") })}
      </p>
      <div className="mt-4 rounded-lg border border-border/70 bg-muted/30 p-3 text-left text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("invite.inviteFor")}
        </div>
        <div className="mt-1 font-medium">{invite.email}</div>
      </div>
      {emailMismatch && (
        <p className="mt-3 text-xs text-destructive">
          {t("invite.loggedAsMismatch", { current: user.email, required: invite.email })}
        </p>
      )}
      <Button
        onClick={handleAccept}
        disabled={accepting || !!emailMismatch}
        className="mt-5 w-full"
      >
        {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("invite.accept")}
      </Button>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-8 text-center">
        <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <FileSignature className="h-5 w-5" />
        </span>
        {children}
      </div>
    </div>
  );
}
