import { useState, useEffect, useRef } from "react";
import { Pencil, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListTransactions,
  useListAccounts,
  useListDebts,
  useGetDashboard,
  useListGoals,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { getLevel, getLearnXP } from "@/components/investments/learn-tab";

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

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--ft-raised)", padding: "8px 10px", border: "1px solid var(--ft-border2)" }}>
      <div style={MONO_LABEL}>{label}</div>
      <div style={{ ...MONO_VAL, fontSize: 11 }}>{value}</div>
    </div>
  );
}

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

export default function Profile() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  // XP / level
  const [totalXP] = useState(() => getLearnXP());

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
      // Resize to max 256×256 via canvas to keep payload small
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
  const totalVolume = txList.reduce((sum, t) => sum + Math.abs(t.gbpValue), 0);
  const largestTx = txList.reduce<number>((max, t) => Math.max(max, Math.abs(t.gbpValue)), 0);

  const categoryMap: Record<string, number> = {};
  for (const t of txList) {
    if (t.type === "expense") {
      categoryMap[t.category] = (categoryMap[t.category] ?? 0) + 1;
    }
  }
  const topCategory = Object.entries(categoryMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const accountCount = accounts?.length ?? 0;
  const activeDebts = (debts ?? []).filter(d => d.status === "pending").length;
  const netWorth = dashboard?.netWorth ?? 0;

  const sortedByDate = [...txList].sort((a, b) => a.date.localeCompare(b.date));
  const firstTx = sortedByDate[0];

  const sortedAccounts = [...(accounts ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const firstAccount = sortedAccounts[0];

  const hundredthTx = txList.length >= 100 ? sortedByDate[99] : null;

  const largestTxEntry = txList.reduce<typeof txList[0] | null>((best, t) =>
    best === null || Math.abs(t.gbpValue) > Math.abs(best.gbpValue) ? t : best, null
  );

  function handleSignOut() {
    authClient.signOut().then(() => {
      queryClient.clear();
      navigate("/");
    });
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

  if (largestTxEntry) {
    timelineItems.push({
      date: new Date(largestTxEntry.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label: `Largest transaction — ${formatGbp(Math.abs(largestTxEntry.gbpValue))}`,
      sub: largestTxEntry.description,
    });
  }

  timelineItems.sort((a, b) => a.date.localeCompare(b.date));

  const lvl = getLevel(totalXP);

  const identityPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Identity
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {user?.image ? (
              <img
                src={user.image}
                alt="Profile"
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid var(--ft-border)",
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{
                  width: 60,
                  height: 60,
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 28,
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
                    fontSize: 24,
                    lineHeight: 1,
                  }}
                >
                  _
                </span>
              </div>
            )}
            {/* Edit photo button */}
            <button
              onClick={() => { setEditingImage(e => !e); setImageInput(user?.image ?? ""); }}
              title="Edit profile photo"
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border2)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "var(--ft-muted)",
                padding: 0,
                lineHeight: 1,
              }}
            >
              <Pencil size={10} />
            </button>
          </div>

          {/* Identity info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name row */}
            {editingName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
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
                    width: 150,
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
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
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
                    fontSize: 11,
                    padding: "0 2px",
                    lineHeight: 1,
                    transition: "color 0.1s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
                >
                  <Pencil size={10} />
                </button>
              </div>
            )}
            {nameError && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", marginBottom: 4 }}>{nameError}</div>
            )}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 3 }}>
              {user?.email ?? "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 6 }}>
              uid: {user?.id ? user.id.slice(0, 16) + "…" : "—"}
            </div>
            {/* XP / Level */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: lvl.color, background: `${lvl.color}18`, border: `1px solid ${lvl.color}40`, padding: "1px 7px", letterSpacing: "0.1em" }}>
                {lvl.name}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", fontWeight: 700 }}>{totalXP} XP</span>
              {lvl.next && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                  · {lvl.next.minXP - totalXP} to {lvl.next.name}
                </span>
              )}
            </div>
            {/* XP progress bar */}
            <div style={{ marginTop: 5, width: "100%", maxWidth: 180, height: 3, background: "var(--ft-border)" }}>
              <div style={{ height: "100%", width: `${lvl.progress}%`, background: lvl.color, transition: "width 400ms ease" }} />
            </div>
          </div>
        </div>

        {/* Photo editor */}
        {editingImage && (
          <div style={{ marginBottom: 14, padding: "12px 14px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ ...MONO_LABEL }}>Profile Photo</div>
              <button
                onClick={() => { setEditingImage(false); setImageUploadError(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-muted)", display: "flex", alignItems: "center" }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Drop zone / upload button */}
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
                <img src={imageInput} alt="preview" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 2 }} />
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

            {/* URL input fallback */}
            <div style={{ ...MONO_LABEL, marginBottom: 5 }}>Or paste a URL</div>
            <div style={{ display: "flex", gap: 6 }}>
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
            </div>
            <div style={{ ...MONO_LABEL, marginTop: 5 }}>Leave URL blank to remove photo</div>
          </div>
        )}


        <div className="ft-four-col" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          marginBottom: 14,
        }}>
          <StatCell label="Accounts" value={String(accountCount)} />
          <StatCell label="Transactions" value={String(txCount)} />
          <StatCell label="Net Worth" value={formatGbp(netWorth)} />
          <StatCell label="Active Debts" value={String(activeDebts)} />
          <StatCell label="Total Volume" value={formatGbp(totalVolume)} />
          <StatCell label="Largest TX" value={largestTx > 0 ? formatGbp(largestTx) : "—"} />
          <StatCell label="Top Category" value={topCategory} />
          <StatCell label="Member For" value={memberDays !== null ? `${memberDays}d` : "—"} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--ft-border2)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
            <span style={{ color: user?.emailVerified ? "var(--ft-green)" : "var(--ft-amber)" }}>■</span>{" "}
            email {user?.emailVerified ? "verified" : "unverified"} · joined {joinDate}
          </div>
          <button
            onClick={handleExport}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-cyan)",
              background: "transparent",
              border: "1px solid var(--ft-cyan)",
              padding: "4px 12px",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            &gt; export.json()
          </button>
        </div>
      </div>
    </div>
  );

  const activityPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Activity Timeline
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "16px" }}>
        {timelineItems.length === 0 ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
            No activity yet.
          </div>
        ) : (
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{
              position: "absolute",
              left: 6,
              top: 6,
              bottom: 6,
              width: 1,
              background: "var(--ft-border)",
            }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {timelineItems.map((item, i) => (
                <div key={i} style={{ position: "relative", paddingLeft: 14 }}>
                  <div style={{
                    position: "absolute",
                    left: -14,
                    top: 4,
                    width: 8,
                    height: 8,
                    background: "var(--ft-accent)",
                    border: "1px solid var(--ft-raised)",
                    borderRadius: "50%",
                  }} />
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 2 }}>
                    {item.date}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
                    {item.label}
                  </div>
                  {item.sub && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 1 }}>
                      {item.sub}
                    </div>
                  )}
                </div>
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
        <span style={{ color: "var(--ft-accent)" }}>·</span> Session
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "16px" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 12 }}>
          Sign out of your account on this device. Other sessions will remain active.
        </p>
        <button
          onClick={handleSignOut}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-accent)",
            background: "transparent",
            border: "1px solid var(--ft-accent)",
            padding: "6px 16px",
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          &gt; auth.logout()
        </button>
      </div>
    </div>
  );

  const prefsPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Preferences
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ ...MONO_LABEL, marginBottom: 6 }}>Default Currency</div>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "var(--ft-raised)",
              color: "var(--ft-text)",
              border: "1px solid var(--ft-border)",
              padding: "5px 8px",
              width: "100%",
              cursor: "pointer",
            }}
          >
            {["GBP", "USD", "EUR", "MYR", "SGD", "JPY", "AUD", "CAD"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ ...MONO_LABEL, marginBottom: 6 }}>Show Amounts As</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(["GBP", "Native", "Both"] as const).map(opt => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="amountDisplay"
                  value={opt}
                  checked={amountDisplay === opt}
                  onChange={() => setAmountDisplay(opt)}
                  style={{ accentColor: "var(--ft-accent)" }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div style={{ ...MONO_LABEL, marginBottom: 6 }}>Date Format</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(["DD/MM/YYYY", "MM/DD/YYYY"] as const).map(opt => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="dateFormat"
                  value={opt}
                  checked={dateFormat === opt}
                  onChange={() => setDateFormat(opt)}
                  style={{ accentColor: "var(--ft-accent)" }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const usagePanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Usage
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "16px" }}>
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "Settings Stored", value: `${ftKeyCount} keys` },
            { label: "Auto-Cat Rules", value: String(catRulesCount) },
            { label: "TX Templates", value: String(templatesCount) },
            { label: "NW History", value: `${nwHistoryCount} entries` },
            { label: "Savings Goals", value: String(goalsFromApi.length) },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--ft-raised)", padding: "7px 10px", border: "1px solid var(--ft-border2)" }}>
              <div style={MONO_LABEL}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const authPanel = (
    <div style={PANEL}>
      <div style={HEADER}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Auth Providers
      </div>
      <div style={{ background: "var(--ft-surface)", padding: "16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { id: "email", label: "Email / Password", active: true },
          { id: "google", label: "Google OAuth", active: false },
        ].map(provider => (
          <div
            key={provider.id}
            style={{
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: provider.active ? "var(--ft-green)" : "var(--ft-dim)",
                  flexShrink: 0,
                  ...(provider.active ? { animation: "ft-pulse 2s ease-in-out infinite" } : {}),
                }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
                {provider.label}
              </span>
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.08em",
                color: provider.active ? "var(--ft-green)" : "var(--ft-dim)",
                textTransform: "uppercase",
                background: "var(--ft-base)",
                padding: "2px 6px",
                border: `1px solid ${provider.active ? "var(--ft-green)" : "var(--ft-border)"}`,
              }}
            >
              {provider.active ? "Active" : "Not linked"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const dangerPanel = (
    <div style={{ ...PANEL, border: "1px solid var(--ft-red)" }}>
      <div style={{ ...HEADER, borderBottom: "1px solid var(--ft-red)", color: "var(--ft-red)" }}>
        <span>·</span> Danger Zone
      </div>
      <div style={{ background: "rgba(248,113,113,0.03)", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
          These actions are permanent and cannot be undone.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-red)",
              background: "transparent",
              border: "1px solid var(--ft-red)",
              padding: "6px 16px",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Delete Account
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-red)" }}>
              Are you sure? This will permanently delete all your data.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ft-muted)",
                  background: "transparent",
                  border: "1px solid var(--ft-border)",
                  padding: "6px 16px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ft-base)",
                  background: "var(--ft-red)",
                  border: "1px solid var(--ft-red)",
                  padding: "6px 16px",
                  cursor: "pointer",
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Profile &amp; Account
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {identityPanel}
          {activityPanel}
          {sessionPanel}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prefsPanel}
          {usagePanel}
          {authPanel}
          {dangerPanel}
        </div>
      </div>
    </div>
  );
}
