import { useState } from "react";
import {
  useGetSettingsCurrency,
  useUpdateSettingsCurrency,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, DollarSign, LogOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";

const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR", "MYR", "CNY", "JPY", "AUD", "CAD", "SGD", "HKD", "THB", "INR"] as const;

const sectionHeaderClass =
  "px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center gap-2";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  // ── Base currency ──
  const { data: currencySettings } = useGetSettingsCurrency();
  const updateCurrency = useUpdateSettingsCurrency();

  const handleCurrencyChange = async (value: string) => {
    try {
      await updateCurrency.mutateAsync({ data: { baseCurrency: value as (typeof SUPPORTED_CURRENCIES)[number] } });
      toast({ title: `Base currency updated to ${value}` });
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Could not update currency", description: message, variant: "destructive" });
    }
  };

  // ── Password change ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords don't match", variant: "destructive" });
      return;
    }
    setPwdSubmitting(true);
    try {
      const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      if (res?.error) {
        toast({ title: "Could not change password", description: (res.error as any)?.message ?? String(res.error), variant: "destructive" });
      } else {
        toast({ title: "Password changed" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      toast({ title: "Could not change password", description: err?.message, variant: "destructive" });
    } finally {
      setPwdSubmitting(false);
    }
  };

  // ── Sign out ──
  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient.clear();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-bold" style={{ color: "#E6EDF3" }}>Settings</h1>
        <p className="text-xs" style={{ color: "#6E7681" }}>
          {session?.user?.email ? `Signed in as ${session.user.email}` : "Currency and security settings"}
        </p>
      </div>

      {/* ── Base Currency ── */}
      <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
        <div className={sectionHeaderClass} style={{ background: "#161B22", borderColor: "#21262D", color: "#58A6FF" }}>
          <DollarSign className="w-3.5 h-3.5" />
          Base Currency
        </div>
        <div className="p-4 space-y-3" style={{ background: "#0D1117" }}>
          <p className="text-xs" style={{ color: "#6E7681" }}>
            All amounts across the app will be converted to this currency for display.
          </p>
          <div className="space-y-1.5 max-w-[180px]">
            <Label className="text-xs">Currency</Label>
            <Select
              value={currencySettings?.baseCurrency ?? "GBP"}
              onValueChange={handleCurrencyChange}
              disabled={updateCurrency.isPending}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Change password ── */}
      <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
        <div className={sectionHeaderClass} style={{ background: "#161B22", borderColor: "#21262D", color: "#58A6FF" }}>
          <KeyRound className="w-3.5 h-3.5" />
          Change Password
        </div>
        <form onSubmit={handleChangePassword} className="p-4 space-y-3" style={{ background: "#0D1117" }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Current password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">New password (min 8 characters)</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm new password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
          </div>
          <Button type="submit" disabled={pwdSubmitting} size="sm">
            {pwdSubmitting ? "Changing…" : "Change Password"}
          </Button>
        </form>
      </div>

      {/* ── Sign out ── */}
      <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
        <div className={sectionHeaderClass} style={{ background: "#161B22", borderColor: "#21262D", color: "#58A6FF" }}>
          <LogOut className="w-3.5 h-3.5" />
          Account
        </div>
        <div className="p-4" style={{ background: "#0D1117" }}>
          <p className="text-xs mb-3" style={{ color: "#6E7681" }}>
            Sign out of your account on this device.
          </p>
          <Button size="sm" variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
