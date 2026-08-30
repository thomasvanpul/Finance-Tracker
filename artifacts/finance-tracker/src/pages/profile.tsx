import { useState, useEffect, useRef, useMemo } from "react";
import { Pencil, X, Copy, Check, User, Shield, Eye, Clock, Activity, Database } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useListTransactions,
  useListAccounts,
  useListDebts,
  useGetDashboard,
  useListGoals,
} from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { loadPersonaIds, PERSONAS, PERSONA_COLORS, PERSONA_GLYPHS } from "@/lib/persona";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";
import { SignInMethodsPanel } from "@/components/sign-in-methods-panel";

const PANEL: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  overflow: "hidden",
};

const HEADER: React.CSSProperties = {
  background: "var(--ft-raised)",
  borderBottom: "1px solid var(--ft-border)",
  padding: "0 12px",
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ft-muted)",
};

const MONO_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const MONO_VAL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--ft-text)",
  marginTop: 2,
};

// ── KPI Cell ──────────────────────────────────────────────────────────────────

// KPI grid cell with hover state
function KpiCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-surface)",
        padding: "8px 10px",
        transition: "background 0.12s",
      }}
    >
      <div style={MONO_LABEL}>{label}</div>
      <div
        className="pnum"
        style={{
          ...MONO_VAL,
          fontSize: 12,
          fontWeight: 700,
          color: accent ?? "var(--ft-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── KPI Strip ─────────────────────────────────────────────────────────────────

// KPI strip using border-as-gap pattern
function KpiStrip({ items }: { items: { label: string; value: string; accent?: string }[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 1,
        background: "var(--ft-border)",
        border: "1px solid var(--ft-border)",
      }}
    >
      {items.map(({ label, value, accent }) => (
        <KpiCell key={label} label={label} value={value} accent={accent} />
      ))}
    </div>
  );
}

// ── HoverRow ──────────────────────────────────────────────────────────────────

// Row component with hover state for interactive rows
function HoverRow({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        transition: "background 0.12s",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────

function TabButton({
  tab,
  isActive,
  onClick,
}: {
  tab: { id: string; label: string; icon: React.ReactNode };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        padding: "8px 16px",
        background: isActive ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        border: "none",
        borderBottom: isActive ? "2px solid var(--ft-accent)" : "2px solid transparent",
        color: isActive ? "var(--ft-accent)" : "var(--ft-muted)",
        cursor: "pointer",
        transition: "color 0.12s, border-color 0.12s, background 0.12s",
        marginBottom: -1,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {tab.icon}
      {tab.label}
    </button>
  );
}

// ── Usage Storage Row ─────────────────────────────────────────────────────────

function UsageStorageRow({
  label,
  value,
  note,
  isLast,
}: {
  label: string;
  value: string;
  note?: string;
  isLast: boolean;
}) {
  return (
    <HoverRow
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 14px",
        borderBottom: isLast ? undefined : "1px solid var(--ft-border)",
      }}
    >
      <Text as="span" mono size={10} color="var(--ft-muted)">{label}</Text>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: note ? "var(--ft-dim)" : "var(--ft-text)", fontWeight: 700 }}>
        {note ?? value}
      </span>
    </HoverRow>
  );
}

// ── Auth Provider Row ─────────────────────────────────────────────────────────

function AuthProviderRow({
  provider,
  isLast,
}: {
  provider: { id: string; label: string; active: boolean };
  isLast: boolean;
}) {
  return (
    <HoverRow
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 14px",
        borderBottom: isLast ? undefined : "1px solid var(--ft-border)",
      }}
    >
      <HStack gap={8} align="center">
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: provider.active ? "var(--ft-green)" : "var(--ft-dim)",
            flexShrink: 0,
            ...(provider.active ? { animation: "ft-pulse 2s ease-in-out infinite" } : {}),
          }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
          {provider.label}
        </span>
      </HStack>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.08em",
          color: provider.active ? "var(--ft-green)" : "var(--ft-dim)",
          textTransform: "uppercase",
          padding: "2px 6px",
          border: `1px solid ${provider.active ? "var(--ft-green)" : "var(--ft-border)"}`,
        }}
      >
        {provider.active ? "ACTIVE" : "NOT LINKED"}
      </span>
    </HoverRow>
  );
}

// ── Login History Row ─────────────────────────────────────────────────────────

function LoginHistoryRow({
  entry,
  index,
  isLast,
}: {
  entry: { ts: string; device: string };
  index: number;
  isLast: boolean;
}) {
  const isCurrent = index === 0;
  return (
    <HoverRow
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 14px",
        borderBottom: isLast ? undefined : "1px solid var(--ft-border)",
      }}
    >
      <HStack gap={8} align="center">
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: isCurrent ? "var(--ft-green)" : "var(--ft-border2)",
          flexShrink: 0,
          ...(isCurrent ? { animation: "ft-pulse 2s ease-in-out infinite" } : {}),
        }} />
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: isCurrent ? 600 : 400 }}>{entry.device}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>
            {new Date(entry.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </HStack>
      {isCurrent && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, padding: "1px 6px", background: "rgba(63,185,80,0.12)", color: "var(--ft-green)", border: "1px solid rgba(63,185,80,0.25)", letterSpacing: "0.08em" }}>
          CURRENT
        </span>
      )}
    </HoverRow>
  );
}

// ── Persona Row ───────────────────────────────────────────────────────────────

function PersonaRow({
  persona,
  isLast,
}: {
  persona: typeof PERSONAS[number];
  isLast: boolean;
}) {
  const color = PERSONA_COLORS[persona.id];
  return (
    <HoverRow
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderLeft: `3px solid ${color}`,
        borderBottom: isLast ? undefined : "1px solid var(--ft-border)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, flexShrink: 0 }}>
        {PERSONA_GLYPHS[persona.id]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <HStack gap={6} align="center" marginBottom={1}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color, letterSpacing: "0.1em", border: `1px solid ${color}55`, padding: "1px 4px" }}>{persona.code}</span>
          <Text as="span" mono size={10} weight={700} color="var(--ft-text)">{persona.label}</Text>
        </HStack>
        <Text as="div" mono size={9} color="var(--ft-dim)">{persona.tagline}</Text>
      </div>
    </HoverRow>
  );
}

// ── Data Export Cell ──────────────────────────────────────────────────────────

function DataExportCell({ label, value }: { label: string; value: string }) {
  const [hov, setHov] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        padding: "6px 10px",
        transition: "background 0.12s",
      }}
    >
      <div style={MONO_LABEL}>{label}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Preference helpers ────────────────────────────────────────────────────────

type PreferenceKey = "ft-default-currency" | "ft-amount-display" | "ft-date-format";

function readPref(key: PreferenceKey, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: PreferenceKey, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

function countFtKeys(): number {
  try {
    return Object.keys(localStorage).filter(k => k.startsWith("ft-")).length;
  } catch {
    return 0;
  }
}

function parseJsonLength(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (typeof parsed === "object" && parsed !== null) return Object.keys(parsed).length;
    return 0;
  } catch {
    return 0;
  }
}

// ── Profile Page ──────────────────────────────────────────────────────────────

export default function Profile() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "security" | "privacy">("account");

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "password" | "qr" | "verify-disable">("idle");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [twoFaUri, setTwoFaUri] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaCopied, setTwoFaCopied] = useState(false);
  const loginHistory = useMemo<{ ts: string; device: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("ft-login-history") ?? "[]"); } catch { return []; }
  }, []);

  // Privacy tab state
  const [blurAmounts, setBlurAmounts] = useState(() => {
    try { return localStorage.getItem("nr-blur-amounts") === "true"; } catch { return false; }
  });
  const [autoBlurDelay, setAutoBlurDelay] = useState(() => {
    try { return parseInt(localStorage.getItem("nr-auto-blur-delay") ?? "10", 10); } catch { return 10; }
  });
  const [maskMode, setMaskMode] = useState(() => {
    try { return localStorage.getItem("nr-mask-mode") ?? "none"; } catch { return "none"; }
  });
  const [hideFromPrint, setHideFromPrint] = useState(() => {
    try { return localStorage.getItem("nr-hide-from-print") === "true"; } catch { return false; }
  });

  const { data: transactions } = useListTransactions({});
  const { data: accounts } = useListAccounts();
  const { data: debts } = useListDebts();
  const { data: dashboard } = useGetDashboard();
  const { data: goalsFromApi = [] } = useListGoals();

  const [currency, setCurrency] = useState(() => readPref("ft-default-currency", "GBP"));
  const [amountDisplay, setAmountDisplay] = useState(() => readPref("ft-amount-display", "GBP"));
  const [dateFormat, setDateFormat] = useState(() => readPref("ft-date-format", "DD/MM/YYYY"));

  useEffect(() => { writePref("ft-default-currency", currency); }, [currency]);
  useEffect(() => { writePref("ft-amount-display", amountDisplay); }, [amountDisplay]);
  useEffect(() => { writePref("ft-date-format", dateFormat); }, [dateFormat]);

  useEffect(() => {
    if (!session?.user?.email) return;
    try {
      if (sessionStorage.getItem("ft-session-recorded")) return;
      sessionStorage.setItem("ft-session-recorded", "1");
      const ua = navigator.userAgent;
      const device = /Mobi|Android/i.test(ua) ? "Mobile" : /iPad|Tablet/i.test(ua) ? "Tablet" : "Desktop";
      const raw = localStorage.getItem("ft-login-history");
      const hist: { ts: string; device: string }[] = raw ? JSON.parse(raw) : [];
      hist.unshift({ ts: new Date().toISOString(), device });
      if (hist.length > 10) hist.pop();
      localStorage.setItem("ft-login-history", JSON.stringify(hist));
    } catch {}
  }, [session?.user?.email]);

  // Username editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Profile photo editing
  const [editingImage, setEditingImage] = useState(false);
  const [imageInput, setImageInput] = useState("");
  const [imageSaving, setImageSaving] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = session?.user;
  const userInitial = (user?.name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) { setNameError("Name cannot be empty"); return; }
    setNameSaving(true);
    setNameError("");
    try {
      await authClient.updateUser({ name: trimmed });
      setEditingName(false);
    } catch {
      setNameError("Failed to save name");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleSaveImage() {
    const trimmed = imageInput.trim();
    setImageSaving(true);
    setImageUploadError("");
    try {
      await authClient.updateUser({ image: trimmed || null });
      setEditingImage(false);
      setImageInput("");
    } finally {
      setImageSaving(false);
    }
  }

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      setImageUploadError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError("File must be under 5 MB.");
      return;
    }
    setImageUploadError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
        setImageInput(dataUrl);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
  const joinDate = createdAt
    ? createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  const memberDays = createdAt
    ? Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)
    : null;

  const txList = transactions ?? [];
  const txCount = txList.length;
  // Profile stats skip unconvertible transactions; "total volume"
  // and "largest" only sum figures the FX layer could actually
  // stand behind.
  const totalVolume = txList.reduce((sum, t) => sum + (t.baseEquivalent == null ? 0 : Math.abs(t.baseEquivalent)), 0);
  const largestTx = txList.reduce<number>((max, t) => t.baseEquivalent == null ? max : Math.max(max, Math.abs(t.baseEquivalent)), 0);

  const categoryMap: Record<string, number> = {};
  for (const t of txList) {
    if (t.type === "expense") {
      categoryMap[t.category] = (categoryMap[t.category] ?? 0) + 1;
    }
  }
  const topCategory = Object.entries(categoryMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const accountCount = accounts?.length ?? 0;
  const activeDebts = (debts ?? []).filter(d => d.status === "pending").length;
  // Nullable so the profile snapshot doesn't render a fabricated £0 net worth
  // for a user whose dashboard hasn't hydrated yet.
  const netWorth = dashboard?.netWorth ?? null;

  const sortedByDate = [...txList].sort((a, b) => a.date.localeCompare(b.date));
  const firstTx = sortedByDate[0];

  const sortedAccounts = [...(accounts ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const firstAccount = sortedAccounts[0];

  const hundredthTx = txList.length >= 100 ? sortedByDate[99] : null;

  const largestTxEntry = txList.reduce<typeof txList[0] | null>((best, t) => {
    // Only compare rows that have a GBP value to compare.
    if (t.baseEquivalent == null) return best;
    if (best === null || best.baseEquivalent == null) return t;
    return Math.abs(t.baseEquivalent) > Math.abs(best.baseEquivalent) ? t : best;
  }, null);

  function handleSignOut() {
    authClient.signOut().then(async () => {
      // Clear the native bearer token — no-op on web. See the same
      // pattern in components/layout.tsx.
      const { clearNativeAuthToken } = await import("@/lib/native-auth");
      await clearNativeAuthToken();
      queryClient.clear();
      navigate("/");
    });
  }

  const { toast } = useToast();

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast({ title: "New passwords don't match", variant: "destructive" }); return; }
    setPwdSubmitting(true);
    try {
      const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      if (res?.error) {
        toast({ title: "Could not change password", description: (res.error as { message?: string })?.message ?? String(res.error), variant: "destructive" });
      } else {
        toast({ title: "Password changed" });
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      }
    } catch (err: unknown) {
      toast({ title: "Could not change password", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setPwdSubmitting(false);
    }
  }

  async function handle2FaEnable() {
    setTwoFaLoading(true);
    try {
      const client = authClient as { twoFactor?: { enable?: (o: { password: string }) => Promise<{ error?: { message?: string }; data?: { totpURI?: string } }> } };
      const res = await client.twoFactor?.enable?.({ password: twoFaPassword });
      if (res?.error) { toast({ title: "Could not start 2FA setup", description: res.error.message, variant: "destructive" }); return; }
      setTwoFaUri(res?.data?.totpURI ?? "");
      setTwoFaStep("qr");
    } catch { toast({ title: "Could not start 2FA setup", variant: "destructive" }); }
    finally { setTwoFaLoading(false); }
  }

  async function handle2FaVerify() {
    setTwoFaLoading(true);
    try {
      const client = authClient as { twoFactor?: { verifyTotp?: (o: { code: string }) => Promise<{ error?: unknown }> } };
      const res = await client.twoFactor?.verifyTotp?.({ code: twoFaCode });
      if (res?.error) { toast({ title: "Invalid TOTP code", variant: "destructive" }); return; }
      setTwoFaEnabled(true);
      setTwoFaStep("idle");
      setTwoFaPassword(""); setTwoFaCode(""); setTwoFaUri("");
      toast({ title: "Two-factor authentication enabled" });
    } catch { toast({ title: "Error verifying code", variant: "destructive" }); }
    finally { setTwoFaLoading(false); }
  }

  async function handle2FaDisable() {
    setTwoFaLoading(true);
    try {
      const client = authClient as { twoFactor?: { disable?: (o: { password: string }) => Promise<{ error?: { message?: string } }> } };
      const res = await client.twoFactor?.disable?.({ password: twoFaPassword });
      if (res?.error) { toast({ title: "Could not disable 2FA", description: res.error.message, variant: "destructive" }); return; }
      setTwoFaEnabled(false);
      setTwoFaStep("idle");
      setTwoFaPassword("");
      toast({ title: "Two-factor authentication disabled" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setTwoFaLoading(false); }
  }

  async function handleRevokeOtherSessions() {
    try {
      const client = authClient as unknown as { revokeOtherSessions?: () => Promise<void> };
      await client.revokeOtherSessions?.();
      toast({ title: "Signed out of all other sessions" });
    } catch {
      toast({ title: "Could not revoke sessions", variant: "destructive" });
    }
  }

  function privacyNotify() { window.dispatchEvent(new CustomEvent("nr-privacy-update")); }

  function handleBlurAmounts(v: boolean) {
    setBlurAmounts(v);
    try { localStorage.setItem("nr-blur-amounts", String(v)); } catch {}
    privacyNotify();
  }

  function handleAutoBlurDelay(v: number) {
    setAutoBlurDelay(v);
    try { localStorage.setItem("nr-auto-blur-delay", String(v)); } catch {}
    privacyNotify();
  }

  function handleMaskMode(v: string) {
    setMaskMode(v);
    try { localStorage.setItem("nr-mask-mode", v); } catch {}
    privacyNotify();
  }

  function handleHideFromPrint(v: boolean) {
    setHideFromPrint(v);
    try { localStorage.setItem("nr-hide-from-print", String(v)); } catch {}
    if (v) {
      if (!document.getElementById("nr-print-style")) {
        const el = document.createElement("style");
        el.id = "nr-print-style";
        el.textContent = "@media print { .pnum, .pdesc { filter: blur(8px) !important; } }";
        document.head.appendChild(el);
      }
    } else {
      document.getElementById("nr-print-style")?.remove();
    }
    privacyNotify();
  }

  function handleExport() {
    const ftKeys: Record<string, string> = {};
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("ft-")) {
          ftKeys[key] = localStorage.getItem(key) ?? "";
        }
      }
    } catch {
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      user: {
        email: user?.email,
        name: user?.name,
        createdAt: user?.createdAt,
      },
      localStorage: ftKeys,
      stats: {
        txCount,
        accountCount,
        activeDebts,
        netWorth,
        totalVolume,
        largestTx,
        topCategory,
        memberDays,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "numeris-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const ftKeyCount = countFtKeys();
  const catRulesCount = parseJsonLength("ft-cat-rules");
  const templatesCount = parseJsonLength("ft-tx-templates");
  const nwHistoryCount = parseJsonLength("ft-nw-history");

  const timelineItems: { date: string; label: string; sub?: string }[] = [];

  if (createdAt) {
    timelineItems.push({
      date: createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label: "Account created",
    });
  }

  if (firstAccount) {
    timelineItems.push({
      date: new Date(firstAccount.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label: "First account added",
      sub: firstAccount.name,
    });
  }

  if (firstTx) {
    timelineItems.push({
      date: new Date(firstTx.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label: "First transaction",
      sub: firstTx.description,
    });
  }

  if (hundredthTx) {
    timelineItems.push({
      date: new Date(hundredthTx.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label: "100th transaction milestone",
    });
  }

  if (largestTxEntry && largestTxEntry.baseEquivalent != null) {
    timelineItems.push({
      date: new Date(largestTxEntry.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label: `Largest transaction — ${formatBaseMoney(Math.abs(largestTxEntry.baseEquivalent))}`,
      sub: largestTxEntry.description,
    });
  }

  timelineItems.sort((a, b) => a.date.localeCompare(b.date));

  const usageStorageRows = [
    { label: "Auto-Cat Rules", value: String(catRulesCount), note: catRulesCount === 0 ? "none" : undefined },
    { label: "TX Templates", value: String(templatesCount), note: templatesCount === 0 ? "none" : undefined },
    { label: "NW History", value: `${nwHistoryCount} entries` },
    { label: "Savings Goals", value: String(goalsFromApi.length) },
    { label: "Settings Keys", value: String(ftKeyCount) },
  ];

  // authProviders was a hardcoded placeholder — a display of two
  // fake rows that lied about what was actually linked. Replaced by
  // <SignInMethodsPanel>, which fetches authClient.listAccounts()
  // and passkey list at runtime and lets the user actually add or
  // remove methods (with the lockout guard).

  const exportCells = [
    { label: "Transactions", value: String(txCount) },
    { label: "Accounts", value: String(accountCount) },
    { label: "Settings", value: `${ftKeyCount} keys` },
  ];

  const identityPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <User size={10} style={{ color: "var(--ft-accent)" }} />
        <span>Identity</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: user?.emailVerified ? "var(--ft-green)" : "var(--ft-amber)" }}>
          {user?.emailVerified ? "● VERIFIED" : "○ UNVERIFIED"}
        </span>
      </div>

      {/* Avatar + name row */}
      <HStack gap={14} align="start" padding="14px 14px 0">
        {/* Avatar */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          {user?.image ? (
            <img
              src={user.image}
              alt="Profile"
              style={{
                width: 56,
                height: 56,
                objectFit: "cover",
                border: "1px solid var(--ft-border)",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 26,
                color: "var(--ft-accent)",
                userSelect: "none",
              }}
            >
              {userInitial}
              <span
                style={{
                  display: "inline-block",
                  color: "var(--ft-accent)",
                  animation: "ft-blink 1s step-start infinite",
                  marginLeft: 1,
                  fontSize: 22,
                  lineHeight: 1,
                }}
              >
                _
              </span>
            </div>
          )}
          <button
            onClick={() => { setEditingImage(e => !e); setImageInput(user?.image ?? ""); }}
            title="Edit profile photo"
            style={{
              position: "absolute",
              bottom: -3,
              right: -3,
              width: 18,
              height: 18,
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ft-muted)",
              padding: 0,
            }}
          >
            <Pencil size={9} />
          </button>
        </div>

        {/* Name + email */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <HStack gap={6} align="center" marginBottom={4}>
              <input
                autoFocus
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setNameError(""); }}
                onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  background: "var(--ft-raised)",
                  border: `1px solid ${nameError ? "var(--ft-red)" : "var(--ft-accent)"}`,
                  color: "var(--ft-text)",
                  padding: "3px 7px",
                  outline: "none",
                  width: "100%",
                  maxWidth: 200,
                  letterSpacing: "0.02em",
                }}
              />
              <button
                onClick={handleSaveName}
                disabled={nameSaving}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  background: "var(--ft-accent)",
                  color: "var(--ft-base)",
                  border: "none",
                  padding: "3px 8px",
                  cursor: nameSaving ? "wait" : "pointer",
                  fontWeight: 700,
                }}
              >
                {nameSaving ? "…" : "SAVE"}
              </button>
              <button
                onClick={() => setEditingName(false)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  background: "transparent",
                  color: "var(--ft-muted)",
                  border: "1px solid var(--ft-border)",
                  padding: "3px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={10} />
              </button>
            </HStack>
          ) : (
            <HStack gap={7} align="center" marginBottom={2}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.02em" }}>
                {user?.name ?? "—"}
              </div>
              <button
                onClick={() => { setNameInput(user?.name ?? ""); setEditingName(true); setNameError(""); }}
                title="Edit display name"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ft-dim)",
                  padding: "0 2px",
                  lineHeight: 1,
                  transition: "color 0.1s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
              >
                <Pencil size={10} />
              </button>
            </HStack>
          )}
          {nameError && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", marginBottom: 4 }}>{nameError}</div>
          )}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 2 }}>
            {user?.email ?? "—"}
          </div>
          <Text as="div" mono size={9} color="var(--ft-dim)">
            uid:{user?.id ? user.id.slice(0, 12) + "…" : "—"} · joined {joinDate}
          </Text>
        </div>
      </HStack>

      {/* Photo editor */}
      {editingImage && (
        <div style={{ margin: "0 14px 14px", padding: "12px 14px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)" }}>
          <HStack align="center" justify="between" marginBottom={10}>
            <div style={MONO_LABEL}>Profile Photo</div>
            <button
              onClick={() => { setEditingImage(false); setImageUploadError(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-muted)", display: "flex", alignItems: "center" }}
            >
              <X size={12} />
            </button>
          </HStack>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
            style={{
              border: "2px dashed var(--ft-border2)",
              padding: "16px 12px",
              marginBottom: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--ft-border2)"; }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
            />
            {imageInput.startsWith("data:") ? (
              <img src={imageInput} alt="preview" style={{ width: 64, height: 64, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 40, height: 40, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={14} color="var(--ft-dim)" />
              </div>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Click or drag &amp; drop · max 5 MB
            </span>
          </div>

          {imageUploadError && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", marginBottom: 8 }}>{imageUploadError}</div>
          )}

          <div style={{ ...MONO_LABEL, marginBottom: 5 }}>Or paste a URL</div>
          <HStack gap={6}>
            <input
              value={imageInput.startsWith("data:") ? "" : imageInput}
              onChange={e => { setImageInput(e.target.value); setImageUploadError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleSaveImage(); if (e.key === "Escape") setEditingImage(false); }}
              placeholder="https://..."
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "var(--ft-base)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-text)",
                padding: "5px 8px",
                outline: "none",
              }}
            />
            <button
              onClick={handleSaveImage}
              disabled={imageSaving}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                background: "var(--ft-accent)",
                color: "var(--ft-base)",
                border: "none",
                padding: "5px 12px",
                cursor: imageSaving ? "wait" : "pointer",
                fontWeight: 700,
              }}
            >
              {imageSaving ? "…" : "SAVE"}
            </button>
          </HStack>
          <div style={{ ...MONO_LABEL, marginTop: 5 }}>Leave URL blank to remove photo</div>
        </div>
      )}

      {/* KPI grid — border-as-gap pattern */}
      <div style={{ borderTop: "1px solid var(--ft-border)" }}>
        <div style={{ padding: "8px 14px 4px", ...MONO_LABEL }}>Portfolio Snapshot</div>
        <KpiStrip items={[
          { label: "Net Worth", value: netWorth == null ? "—" : formatBaseMoney(netWorth), accent: netWorth == null ? "var(--ft-border2)" : netWorth >= 0 ? "var(--ft-blue)" : "var(--ft-red)" },
          { label: "Accounts", value: String(accountCount) },
          { label: "Transactions", value: String(txCount) },
          { label: "Active Debts", value: String(activeDebts), accent: activeDebts > 0 ? "var(--ft-amber)" : "var(--ft-dim)" },
        ]} />
        <div style={{ height: 1, background: "var(--ft-border)", margin: "1px 0" }} />
        <KpiStrip items={[
          { label: "Total Volume", value: totalVolume > 0 ? formatBaseMoney(totalVolume) : "—" },
          { label: "Largest TX", value: largestTx > 0 ? formatBaseMoney(largestTx) : "—" },
          { label: "Top Category", value: topCategory },
          { label: "Member", value: memberDays !== null ? `${memberDays}d` : "—" },
        ]} />
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          {goalsFromApi.length > 0 && <span style={{ color: "var(--ft-green)", marginRight: 6 }}>◆ {goalsFromApi.length} goal{goalsFromApi.length !== 1 ? "s" : ""}</span>}
          {currency} · {dateFormat}
        </div>
        <button
          onClick={handleExport}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-cyan)",
            background: "transparent",
            border: "1px solid var(--ft-cyan)",
            padding: "3px 10px",
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--ft-cyan) 10%, transparent)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          &gt; export.json()
        </button>
      </div>
    </div>
  );

  const activityPanel = (
    <div style={PANEL}>
      <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-accent)", paddingLeft: 10 }}>
        <Activity size={10} style={{ color: "var(--ft-accent)" }} />
        <span>Activity Timeline</span>
        {timelineItems.length > 0 && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            {timelineItems.length} event{timelineItems.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={{ background: "var(--ft-surface)" }}>
        {timelineItems.length === 0 ? (
          <VStack gap={8} align="center" padding="24px 16px">
            <Clock size={20} color="var(--ft-border2)" />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center" }}>
              No activity recorded yet
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", opacity: 0.6, textAlign: "center" }}>
              Events appear as you use the app
            </div>
          </VStack>
        ) : (
          <div style={{ position: "relative", paddingLeft: 20, padding: "12px 12px 12px 28px" }}>
            <div style={{
              position: "absolute",
              left: 18,
              top: 18,
              bottom: 18,
              width: 1,
              background: "var(--ft-border)",
            }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {timelineItems.map((item, i) => (
                <HoverRow
                  key={i}
                  style={{
                    position: "relative",
                    paddingLeft: 14,
                    paddingRight: 8,
                    paddingTop: 8,
                    paddingBottom: 8,
                    borderBottom: i < timelineItems.length - 1 ? "1px solid var(--ft-border)" : undefined,
                  }}
                >
                  <div style={{
                    position: "absolute",
                    left: -10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 6,
                    height: 6,
                    background: "var(--ft-accent)",
                    border: "1px solid var(--ft-raised)",
                    borderRadius: "50%",
                    zIndex: 1,
                  }} />
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", flex: 1, minWidth: 0 }}>
                      {item.label}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", flexShrink: 0 }}>
                      {item.date}
                    </div>
                  </div>
                  {item.sub && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.sub}
                    </div>
                  )}
                </HoverRow>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const sessionPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <Text as="span" color="var(--ft-accent)">·</Text> Session
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
            Signed in as <Text as="span" color="var(--ft-text)">{user?.email ?? "—"}</Text>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
            Sign out on this device only. Other sessions remain active.
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-accent)",
            background: "transparent",
            border: "1px solid var(--ft-accent)",
            padding: "5px 14px",
            cursor: "pointer",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--ft-accent) 10%, transparent)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          &gt; auth.logout()
        </button>
      </div>
    </div>
  );

  const prefsPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <Text as="span" color="var(--ft-accent)">·</Text> Preferences
      </div>
      <div style={{ background: "var(--ft-surface)" }}>
        {/* Currency row */}
        <HoverRow style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)" }}>
          <HStack gap={8} align="center" justify="between">
            <div>
              <div style={MONO_LABEL}>Base Currency</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>Managed in Settings → Currency</div>
            </div>
            <a
              href="/settings"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", textDecoration: "none", border: "1px solid var(--ft-accent)", padding: "2px 8px", opacity: 0.8, flexShrink: 0, letterSpacing: "0.06em" }}
            >
              → Settings
            </a>
          </HStack>
        </HoverRow>

        {/* Amount display */}
        <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)" }}>
          <div style={{ ...MONO_LABEL, marginBottom: 6 }}>Show Amounts As</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)" }}>
            {(["GBP", "Native", "Both"] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setAmountDisplay(opt)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: amountDisplay === opt ? "var(--ft-accent)" : "var(--ft-muted)",
                  background: amountDisplay === opt ? "color-mix(in srgb, var(--ft-accent) 10%, var(--ft-surface))" : "var(--ft-surface)",
                  border: "none",
                  padding: "5px 4px",
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Date format */}
        <div style={{ padding: "9px 14px" }}>
          <div style={{ ...MONO_LABEL, marginBottom: 6 }}>Date Format</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--ft-border)" }}>
            {(["DD/MM/YYYY", "MM/DD/YYYY"] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setDateFormat(opt)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: dateFormat === opt ? "var(--ft-accent)" : "var(--ft-muted)",
                  background: dateFormat === opt ? "color-mix(in srgb, var(--ft-accent) 10%, var(--ft-surface))" : "var(--ft-surface)",
                  border: "none",
                  padding: "5px 4px",
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const usagePanel = (
    <div style={PANEL}>
      <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-blue)", paddingLeft: 10 }}>
        <Database size={10} style={{ color: "var(--ft-blue)" }} />
        <span>Local Storage</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          {ftKeyCount} keys
        </span>
      </div>
      <div style={{ background: "var(--ft-surface)" }}>
        {usageStorageRows.map(({ label, value, note }, i) => (
          <UsageStorageRow
            key={label}
            label={label}
            value={value}
            note={note}
            isLast={i === usageStorageRows.length - 1}
          />
        ))}
      </div>
    </div>
  );

  const personaPanel = (() => {
    const ids = loadPersonaIds();
    const activePersonas = PERSONAS.filter(p => ids.includes(p.id));
    if (activePersonas.length === 0) return null;
    const primary = activePersonas[0];
    const primaryColor = PERSONA_COLORS[primary.id];
    return (
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: `3px solid ${primaryColor}`, paddingLeft: 10 }}>
          <span style={{ color: primaryColor }}>{PERSONA_GLYPHS[primary.id]}</span> Terminal Profile
        </div>
        <VStack gap={0}>
          {activePersonas.map((p, i) => (
            <PersonaRow
              key={p.id}
              persona={p}
              isLast={i === activePersonas.length - 1}
            />
          ))}
          <a
            href="/settings?panel=terminal-profile"
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: primaryColor, letterSpacing: "0.06em", textDecoration: "none", padding: "6px 12px", display: "block", borderTop: "1px solid var(--ft-border)", opacity: 0.8 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "0.8"; }}
          >
            Manage Terminal Profile in Settings →
          </a>
        </VStack>
      </div>
    );
  })();

  const authPanel = <SignInMethodsPanel panelStyle={PANEL} headerStyle={HEADER} />;

  const dangerPanel = (
    <div style={{ ...PANEL, border: "1px solid color-mix(in srgb, var(--ft-red) 40%, var(--ft-border))" }}>
      <div style={{ ...HEADER, borderBottom: "1px solid color-mix(in srgb, var(--ft-red) 40%, var(--ft-border))", borderLeft: "3px solid var(--ft-red)", paddingLeft: 10, color: "var(--ft-red)" }}>
        <span>·</span> Danger Zone
      </div>
      <div style={{ background: "color-mix(in srgb, var(--ft-red) 3%, var(--ft-surface))", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
          Permanent and irreversible. Proceed with care.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-red)",
              background: "transparent",
              border: "1px solid color-mix(in srgb, var(--ft-red) 50%, var(--ft-border))",
              padding: "5px 14px",
              cursor: "pointer",
              letterSpacing: "0.04em",
              alignSelf: "flex-start",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--ft-red) 8%, transparent)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            Delete Account
          </button>
        ) : (
          <VStack gap={8}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-red)" }}>
              This will permanently delete all your data. Are you sure?
            </p>
            <HStack gap={8} wrap>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ft-muted)",
                  background: "transparent",
                  border: "1px solid var(--ft-border)",
                  padding: "5px 14px",
                  cursor: "pointer",
                  flex: "1 1 auto",
                }}
              >
                Cancel
              </button>
              <button
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ft-base)",
                  background: "var(--ft-red)",
                  border: "1px solid var(--ft-red)",
                  padding: "5px 14px",
                  cursor: "pointer",
                  flex: "1 1 auto",
                }}
              >
                Confirm Delete
              </button>
            </HStack>
          </VStack>
        )}
      </div>
    </div>
  );

  const TABS: { id: "account" | "security" | "privacy"; label: string; icon: React.ReactNode }[] = [
    { id: "account", label: "ACCOUNT", icon: <User size={10} /> },
    { id: "security", label: "SECURITY", icon: <Shield size={10} /> },
    { id: "privacy", label: "PRIVACY", icon: <Eye size={10} /> },
  ];

  const twoFaKey = twoFaUri.replace(/^.*secret=([^&]+).*$/, "$1");

  const securityPanel = (
    <div style={{ maxWidth: 520, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Change Password */}
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-amber)", paddingLeft: 10 }}>
          <Text as="span" color="var(--ft-amber)">·</Text> Change Password
        </div>
        <form onSubmit={handleChangePassword} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, background: "var(--ft-surface)" }}>
          <VStack gap={4}>
            <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>Current password</Label>
            <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
          </VStack>
          <VStack gap={4}>
            <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>New password (min 8 characters)</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required />
          </VStack>
          <VStack gap={4}>
            <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>Confirm new password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required />
          </VStack>
          <button
            type="submit"
            disabled={pwdSubmitting}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", background: "transparent", border: "1px solid var(--ft-accent)", padding: "7px 18px", cursor: pwdSubmitting ? "not-allowed" : "pointer", opacity: pwdSubmitting ? 0.5 : 1, alignSelf: "flex-start" }}
          >
            {pwdSubmitting ? "Changing…" : "> Change Password"}
          </button>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-cyan)", paddingLeft: 10 }}>
          <Text as="span" color="var(--ft-cyan)">·</Text> Two-Factor Authentication
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, padding: "1px 6px", background: twoFaEnabled ? "rgba(63,185,80,0.15)" : "rgba(255,255,255,0.05)", color: twoFaEnabled ? "var(--ft-green)" : "var(--ft-dim)", border: `1px solid ${twoFaEnabled ? "rgba(63,185,80,0.3)" : "var(--ft-border)"}` }}>
            {twoFaEnabled ? "● ON" : "○ OFF"}
          </span>
        </div>
        <div style={{ padding: "14px 16px", background: "var(--ft-surface)" }}>
          {!twoFaEnabled && twoFaStep === "idle" && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 12 }}>
                Adds a second layer of security. You'll need an authenticator app (Google Authenticator, Authy, etc.) after enabling.
              </div>
              <button onClick={() => setTwoFaStep("password")} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)", background: "transparent", border: "1px solid var(--ft-green)", padding: "6px 16px", cursor: "pointer" }}>
                &gt; Enable 2FA
              </button>
            </div>
          )}
          {!twoFaEnabled && twoFaStep === "password" && (
            <VStack gap={10}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>Confirm your password to begin setup:</div>
              <Input type="password" placeholder="Current password" value={twoFaPassword} onChange={e => setTwoFaPassword(e.target.value)} />
              <HStack gap={8}>
                <button onClick={() => { setTwoFaStep("idle"); setTwoFaPassword(""); }} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", background: "transparent", border: "1px solid var(--ft-border)", padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
                <button onClick={handle2FaEnable} disabled={twoFaLoading || !twoFaPassword} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", background: "transparent", border: "1px solid var(--ft-accent)", padding: "6px 14px", cursor: twoFaLoading || !twoFaPassword ? "not-allowed" : "pointer", opacity: twoFaLoading || !twoFaPassword ? 0.5 : 1 }}>
                  {twoFaLoading ? "…" : "&gt; Continue"}
                </button>
              </HStack>
            </VStack>
          )}
          {!twoFaEnabled && twoFaStep === "qr" && (
            <VStack gap={12}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
                Open your authenticator app and add a new account manually using the key below, or paste the full URI:
              </div>
              {twoFaKey && (
                <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-accent)", letterSpacing: "0.1em", wordBreak: "break-all" }}>{twoFaKey}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(twoFaKey).then(() => { setTwoFaCopied(true); setTimeout(() => setTwoFaCopied(false), 2000); }); }}
                    style={{ flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", color: twoFaCopied ? "var(--ft-green)" : "var(--ft-dim)", padding: 4 }}
                    title="Copy key"
                  >
                    {twoFaCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )}
              <Text as="div" mono size={10} color="var(--ft-dim)">Then enter the 6-digit code from your app to verify:</Text>
              <Input
                placeholder="000000"
                maxLength={6}
                value={twoFaCode}
                onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                style={{ fontFamily: "var(--font-mono)", fontSize: 16, letterSpacing: "0.3em", textAlign: "center", maxWidth: 160 }}
              />
              <HStack gap={8}>
                <button onClick={() => { setTwoFaStep("idle"); setTwoFaPassword(""); setTwoFaUri(""); setTwoFaCode(""); }} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", background: "transparent", border: "1px solid var(--ft-border)", padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
                <button onClick={handle2FaVerify} disabled={twoFaLoading || twoFaCode.length < 6} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)", background: "transparent", border: "1px solid var(--ft-green)", padding: "6px 14px", cursor: twoFaLoading || twoFaCode.length < 6 ? "not-allowed" : "pointer", opacity: twoFaLoading || twoFaCode.length < 6 ? 0.5 : 1 }}>
                  {twoFaLoading ? "Verifying…" : "&gt; Verify &amp; Activate"}
                </button>
              </HStack>
            </VStack>
          )}
          {twoFaEnabled && twoFaStep === "idle" && (
            <HStack gap={10} align="center" justify="between" wrap>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>Your account is protected with TOTP two-factor authentication.</div>
              <button onClick={() => setTwoFaStep("verify-disable")} style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-red)", background: "transparent", border: "1px solid var(--ft-red)", padding: "6px 14px", cursor: "pointer" }}>
                Disable
              </button>
            </HStack>
          )}
          {twoFaEnabled && twoFaStep === "verify-disable" && (
            <VStack gap={10}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>Confirm your password to disable 2FA:</div>
              <Input type="password" placeholder="Current password" value={twoFaPassword} onChange={e => setTwoFaPassword(e.target.value)} />
              <HStack gap={8}>
                <button onClick={() => { setTwoFaStep("idle"); setTwoFaPassword(""); }} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", background: "transparent", border: "1px solid var(--ft-border)", padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
                <button onClick={handle2FaDisable} disabled={twoFaLoading || !twoFaPassword} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-red)", background: "transparent", border: "1px solid var(--ft-red)", padding: "6px 14px", cursor: twoFaLoading || !twoFaPassword ? "not-allowed" : "pointer", opacity: twoFaLoading || !twoFaPassword ? 0.5 : 1 }}>
                  {twoFaLoading ? "Disabling…" : "&gt; Disable 2FA"}
                </button>
              </HStack>
            </VStack>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div style={PANEL}>
        <div style={HEADER}><Text as="span" color="var(--ft-accent)">·</Text> Sessions</div>
        <div style={{ padding: "12px 14px", background: "var(--ft-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600 }}>Current device</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>
              <Text as="span" color="var(--ft-green)">●</Text> Active now · {/Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop"}
            </div>
          </div>
          <button
            onClick={handleRevokeOtherSessions}
            style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", background: "transparent", border: "1px solid var(--ft-amber)", padding: "5px 12px", cursor: "pointer", opacity: 0.85 }}
          >
            Sign out other devices
          </button>
        </div>
      </div>

      {/* Login Activity */}
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-muted)", paddingLeft: 10 }}>
          <Clock size={10} style={{ color: "var(--ft-accent)" }} />
          <span>Login Activity</span>
          {loginHistory.length > 0 && (
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
              {loginHistory.length} event{loginHistory.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ background: "var(--ft-surface)" }}>
          {loginHistory.length === 0 ? (
            <VStack gap={6} align="center" padding="20px 16px">
              <Clock size={18} color="var(--ft-border2)" />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center" }}>
                No activity recorded yet
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", opacity: 0.6, textAlign: "center" }}>
                Activity is logged when you visit this page
              </div>
            </VStack>
          ) : loginHistory.map((entry, i) => (
            <LoginHistoryRow
              key={i}
              entry={entry}
              index={i}
              isLast={i === loginHistory.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const privacyPanel = (
    <VStack gap={10} wide maxWidth={560}>
      {/* Amount Privacy */}
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-accent)", paddingLeft: 10 }}>
          <Eye size={10} style={{ color: "var(--ft-accent)" }} />
          <span>Amount Privacy</span>
        </div>
        <HoverRow style={{ padding: "10px 14px", borderBottom: blurAmounts ? "1px solid var(--ft-border)" : undefined }}>
          <HStack gap={12} align="center" justify="between">
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600, marginBottom: 2 }}>Blur sensitive amounts</div>
              <Text as="div" mono size={9} color="var(--ft-muted)">Amounts show as "£ ••••" until hovered. Useful in public places.</Text>
            </div>
            <button
              onClick={() => handleBlurAmounts(!blurAmounts)}
              aria-pressed={blurAmounts}
              style={{ flexShrink: 0, width: 38, height: 20, borderRadius: 10, border: `1px solid ${blurAmounts ? "var(--ft-accent)" : "var(--ft-border2)"}`, background: blurAmounts ? "var(--ft-accent)" : "var(--ft-raised)", cursor: "pointer", position: "relative", transition: "background 0.15s, border-color 0.15s" }}
            >
              <span style={{ position: "absolute", top: 2, left: blurAmounts ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: blurAmounts ? "var(--ft-base)" : "var(--ft-dim)", transition: "left 0.15s" }} />
            </button>
          </HStack>
        </HoverRow>
        {blurAmounts && (
          <div style={{ padding: "10px 14px", background: "var(--ft-raised)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", marginBottom: 8 }}>
              Auto-blur delay after hover: <span style={{ color: "var(--ft-accent)" }}>{autoBlurDelay === 0 ? "Immediate" : `${autoBlurDelay}s`}</span>
            </div>
            <HStack gap={10} align="center">
              <Text as="span" mono size={9} color="var(--ft-dim)">0s</Text>
              <input type="range" min={0} max={30} value={autoBlurDelay} onChange={e => handleAutoBlurDelay(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
              <Text as="span" mono size={9} color="var(--ft-dim)">30s</Text>
            </HStack>
          </div>
        )}
      </div>

      {/* Data Masking */}
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-muted)", paddingLeft: 10 }}>
          <Text as="span" color="var(--ft-accent)">·</Text> Data Masking
        </div>
        <HoverRow style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)" }}>
          <HStack gap={12} align="center" justify="between">
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600, marginBottom: 2 }}>Transaction descriptions</div>
              <Text as="div" mono size={9} color="var(--ft-muted)">Controls how merchant names and descriptions appear</Text>
            </div>
            <select
              value={maskMode}
              onChange={e => handleMaskMode(e.target.value)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", flexShrink: 0, cursor: "pointer" }}
            >
              <option value="none">None — full text</option>
              <option value="partial">Partial — last 4</option>
              <option value="full">Full — hover to reveal</option>
            </select>
          </HStack>
        </HoverRow>
        <HoverRow style={{ padding: "10px 14px" }}>
          <HStack gap={12} align="center" justify="between">
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600, marginBottom: 2 }}>Hide amounts when printing</div>
              <Text as="div" mono size={9} color="var(--ft-muted)">Blurs all financial figures in print / PDF export</Text>
            </div>
            <button
              onClick={() => handleHideFromPrint(!hideFromPrint)}
              aria-pressed={hideFromPrint}
              style={{ flexShrink: 0, width: 38, height: 20, borderRadius: 10, border: `1px solid ${hideFromPrint ? "var(--ft-accent)" : "var(--ft-border2)"}`, background: hideFromPrint ? "var(--ft-accent)" : "var(--ft-raised)", cursor: "pointer", position: "relative", transition: "background 0.15s, border-color 0.15s" }}
            >
              <span style={{ position: "absolute", top: 2, left: hideFromPrint ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: hideFromPrint ? "var(--ft-base)" : "var(--ft-dim)", transition: "left 0.15s" }} />
            </button>
          </HStack>
        </HoverRow>
        <div style={{ padding: "6px 14px", background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          All privacy settings apply instantly across the app.
        </div>
      </div>

      {/* Data Export */}
      <div style={PANEL}>
        <div style={{ ...HEADER, borderLeft: "3px solid var(--ft-cyan)", paddingLeft: 10 }}>
          <span style={{ color: "var(--ft-cyan)" }}>·</span> Data Export
        </div>
        <div style={{ padding: "12px 14px", background: "var(--ft-surface)", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Export KPI strip — border-as-gap pattern */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)", marginBottom: 2 }}>
            {exportCells.map(({ label, value }) => (
              <DataExportCell key={label} label={label} value={value} />
            ))}
          </div>
          <Text as="div" mono size={10} color="var(--ft-muted)">
            Downloads profile, account stats, and locally stored preferences as JSON.
          </Text>
          <HStack gap={10}>
            <button
              onClick={handleExport}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", background: "transparent", border: "1px solid var(--ft-cyan)", padding: "5px 14px", cursor: "pointer", opacity: 0.9 }}
              onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--ft-cyan) 10%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              ↓ Export as JSON
            </button>
          </HStack>
          <Text as="div" mono size={9} color="var(--ft-dim)">
            Server-side data (transactions, investments) requires a separate server export and is not included.
          </Text>
        </div>
      </div>
    </VStack>
  );

  return (
    <VStack gap={8}>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--ft-border)", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {TABS.map(tab => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {activeTab === "account" && (
        <div className="ft-profile-account-grid" style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12, alignItems: "start" }}>
          <VStack gap={10}>
            {identityPanel}
            {activityPanel}
            {sessionPanel}
          </VStack>
          <VStack gap={10}>
            {prefsPanel}
            {personaPanel}
            {usagePanel}
            {authPanel}
            {dangerPanel}
          </VStack>
        </div>
      )}

      {activeTab === "security" && securityPanel}

      {activeTab === "privacy" && privacyPanel}
    </VStack>
  );
}
