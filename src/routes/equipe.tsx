import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Lock, Mail, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/hooks/use-plan";
import { supabase } from "@/integrations/supabase/client";
import { inviteTeamMember } from "@/lib/team.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [{ title: "Equipe — Aprova ai" }] }),
  component: TeamRoute,
});

function TeamRoute() {
  return (
    <AppLayout>
      <TeamPage />
    </AppLayout>
  );
}

interface TeamMemberRow {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  invite_token: string;
  invited_at: string;
  accepted_at: string | null;
}

function TeamPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { planInfo, loading: planLoading } = usePlan();
  const { isAdmin } = useIsAdmin();
  const inviteFn = useServerFn(inviteTeamMember);

  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isBusiness = planInfo.limits.multiUser || isAdmin;
  const limit = isAdmin ? 999 : planInfo.limits.maxTeamMembers;
  const activeCount = members.filter((m) => m.status !== "revoked").length;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("team_members")
      .select("id, email, status, invite_token, invited_at, accepted_at")
      .eq("owner_id", user.id)
      .order("invited_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembers((data ?? []) as TeamMemberRow[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!isBusiness) {
      toast.error(t("team.businessOnly"));
      return;
    }
    setSubmitting(true);
    try {
      await inviteFn({ data: { email } });
      toast.success(t("team.inviteSent"));
      setEmail("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("team.inviteError"));
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("team_members")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("team.accessRevoked"));
    void load();
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/aceitar-convite/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success(t("team.linkCopied"));
  };

  const limitDisplay = limit || 3;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("team.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("team.subtitle", { limit: limitDisplay })}
          </p>
        </div>
        <Badge variant={isBusiness ? "default" : "secondary"} className="gap-1">
          {isBusiness ? (
            <>
              <Users className="h-3 w-3" /> {t("team.businessPlan")}
            </>
          ) : (
            <>
              <Lock className="h-3 w-3" /> {t("team.businessPlan")}
            </>
          )}
        </Badge>
      </div>

      {!planLoading && !isBusiness && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h2 className="text-base font-semibold">{t("team.featureTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("team.featureDesc")}</p>
              <Button asChild className="mt-4 gap-2">
                <Link to="/planos">
                  <Sparkles className="h-4 w-4" /> {t("team.viewPlans")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleInvite}
        className="space-y-4 rounded-2xl border border-border/70 bg-card p-6"
      >
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("team.inviteCard")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("team.inviteUsage", { used: activeCount, limit: limitDisplay })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="email">{t("team.emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("team.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isBusiness || submitting}
              maxLength={254}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={!isBusiness || submitting || !email.trim()}
            className="gap-2 sm:w-auto"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {t("team.inviteButton")}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("team.members")}</h2>
            <p className="text-xs text-muted-foreground">{t("team.membersDesc")}</p>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            {t("team.loading")}
          </div>
        ) : members.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            {t("team.noMembers")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("team.emailHeader")}</TableHead>
                <TableHead>{t("team.statusHeader")}</TableHead>
                <TableHead>{t("team.invitedAtHeader")}</TableHead>
                <TableHead className="text-right">{t("team.actionsHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.email}</TableCell>
                  <TableCell>
                    {m.status === "accepted" ? (
                      <Badge>{t("team.statusActive")}</Badge>
                    ) : m.status === "pending" ? (
                      <Badge variant="secondary">{t("team.statusPending")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("team.statusRevoked")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(m.invited_at).toLocaleDateString(i18n.language)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {m.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyInviteLink(m.invite_token)}
                          className="gap-1"
                        >
                          <Copy className="h-3.5 w-3.5" /> Link
                        </Button>
                      )}
                      {m.status !== "revoked" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revoke(m.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
