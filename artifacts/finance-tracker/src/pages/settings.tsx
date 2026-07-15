import { useState } from "react";
import {
  useChangePassword,
  useGet2faStatus,
  useSetup2fa,
  useConfirm2fa,
  useDisable2fa,
  getGet2faStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldOff, KeyRound, Copy } from "lucide-react";

const sectionHeaderClass =
  "px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center gap-2";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: twoFaStatus } = useGet2faStatus();

  // ── Password change ──
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords don't match", variant: "destructive" });
      return;
    }
    try {
      await changePassword.mutateAsync({ data: { currentPassword, newPassword } });
      toast({ title: "Password changed" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Could not change password", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    }
  };

  // ── 2FA setup flow ──
  const setup2fa = useSetup2fa();
  const confirm2fa = useConfirm2fa();
  const disable2fa = useDisable2fa();

  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);

  const startSetup = async () => {
    try {
      const result = await setup2fa.mutateAsync();
      setSetupData(result);
    } catch (err: any) {
      toast({ title: "Could not start 2FA setup", description: err?.message, variant: "destructive" });
    }
  };

  const handleConfirm2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await confirm2fa.mutateAsync({ data: { code: confirmCode } });
      setBackupCodes(result.backupCodes);
      setSetupData(null);
      setConfirmCode("");
      queryClient.invalidateQueries({ queryKey: getGet2faStatusQueryKey() });
    } catch (err: any) {
      toast({ title: "Incorrect code", description: err?.response?.data?.error, variant: "destructive" });
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disable2fa.mutateAsync({ data: { password: disablePassword } });
      toast({ title: "2FA disabled" });
      setDisablePassword("");
      setShowDisableForm(false);
      queryClient.invalidateQueries({ queryKey: getGet2faStatusQueryKey() });
    } catch (err: any) {
      toast({ title: "Could not disable 2FA", description: err?.response?.data?.error, variant: "destructive" });
    }
  };

  const copyBackupCodes = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast({ title: "Backup codes copied" });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-bold" style={{ color: "#E6EDF3" }}>Settings</h1>
        <p className="text-xs" style={{ color: "#6E7681" }}>Password and two-factor authentication</p>
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
          <Button type="submit" disabled={changePassword.isPending} size="sm">
            {changePassword.isPending ? "Changing…" : "Change Password"}
          </Button>
        </form>
      </div>

      {/* ── 2FA ── */}
      <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
        <div className={sectionHeaderClass} style={{ background: "#161B22", borderColor: "#21262D", color: "#58A6FF" }}>
          {twoFaStatus?.enabled ? <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#3FB950" }} /> : <ShieldOff className="w-3.5 h-3.5" />}
          Two-Factor Authentication
        </div>
        <div className="p-4" style={{ background: "#0D1117" }}>
          {/* Enabled state */}
          {twoFaStatus?.enabled && !showDisableForm && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#3FB950" }}>
                2FA is enabled — you'll need an authenticator code at login.
              </p>
              <Button size="sm" variant="outline" onClick={() => setShowDisableForm(true)}>
                Disable 2FA
              </Button>
            </div>
          )}

          {twoFaStatus?.enabled && showDisableForm && (
            <form onSubmit={handleDisable2fa} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Confirm your password to disable 2FA</Label>
                <Input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="destructive" disabled={disable2fa.isPending}>
                  {disable2fa.isPending ? "Disabling…" : "Confirm Disable"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowDisableForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Disabled state, no setup in progress, no backup codes to show */}
          {!twoFaStatus?.enabled && !setupData && !backupCodes && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "#6E7681" }}>
                Add an extra step at login using any authenticator app (Google Authenticator, Authy, etc.).
              </p>
              <Button size="sm" onClick={startSetup} disabled={setup2fa.isPending}>
                {setup2fa.isPending ? "Starting…" : "Enable 2FA"}
              </Button>
            </div>
          )}

          {/* Setup in progress: show QR + code confirmation */}
          {setupData && (
            <form onSubmit={handleConfirm2fa} className="space-y-3">
              <p className="text-xs" style={{ color: "#6E7681" }}>
                Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
              </p>
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA QR code"
                style={{ width: 180, height: 180, background: "white", padding: 8, borderRadius: 2 }}
              />
              <div className="text-xs font-mono" style={{ color: "#484F58" }}>
                Manual entry key: <span style={{ color: "#6E7681" }}>{setupData.secret}</span>
              </div>
              <div className="space-y-1.5 max-w-[180px]">
                <Label className="text-xs">6-digit code</Label>
                <Input
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  maxLength={6}
                  className="font-mono"
                  placeholder="000000"
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={confirm2fa.isPending}>
                  {confirm2fa.isPending ? "Verifying…" : "Confirm & Enable"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSetupData(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Backup codes reveal (once) */}
          {backupCodes && (
            <div className="space-y-3">
              <p className="text-xs font-semibold" style={{ color: "#3FB950" }}>
                2FA enabled. Save these one-time backup codes somewhere safe — each works once if you lose access to your authenticator app.
              </p>
              <div
                className="font-mono text-xs p-3 rounded-sm border grid grid-cols-2 gap-2"
                style={{ background: "#161B22", borderColor: "#30363D", color: "#E6EDF3" }}
              >
                {backupCodes.map((code) => (
                  <div key={code}>{code}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyBackupCodes}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy codes
                </Button>
                <Button size="sm" onClick={() => setBackupCodes(null)}>
                  Done, I've saved them
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
