// ── The admin hub ───────────────────────────────────────────────────────────
//
// Numeris runs on a dozen free tiers and, until this page, no surface in the
// product said anything about any of them. Yahoo was dark for days and the
// app rendered dashes. Thirteen Vercel builds failed and the site kept
// serving the previous bundle, so every change looked like it had not
// applied. Both were invisible from inside the product.
//
// The page is a READER. The endpoints already existed; the ceilings already
// existed in artifacts/api-server/src/lib/service-facts.ts. What did not
// exist was one place that reads them together and says whether anything is
// wrong. Nothing here restates a ceiling — every number comes down the wire
// from that typed source.
//
// ── Where this lives ────────────────────────────────────────────────────────
// Desktop sidebar, bottom group beside Settings. It is not one of the ~20
// things a user looks for by name — it is not for users at all. It sits with
// Settings because that is where the app's own configuration already lives,
// and it is desktop-only: the five phone tabs are HOME · WORTH · SPENDING ·
// UPCOMING · DIRECTORY and an ops console is none of them. The phone gets a
// DesktopOnlyScreen so a deep link explains itself rather than 404ing.
//
// ── Headroom, not usage ─────────────────────────────────────────────────────
// Every quota reads as distance to the ceiling. "11 credits used" is trivia.
// "749 left against ~640/day of spend" is a decision.

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import type { AdminOverview, AdminServiceFact, AdminCeiling } from "@workspace/api-client-react";
import { PageHeader } from "@/components/page-header";
import { PanelBox, PanelHeader, HStack, VStack, Text, MonoLabel } from "@/components/primitives";
import { BUILD_COMMIT } from "@/build-info";

// Live ops data. Deliberately short-lived and never persisted offline — a
// cached breaker state is a lie about the present. `/api/admin` is not on the
// offline-cache blacklist by prefix, so staleTime does the work here.
const REFRESH_MS = 30_000;

function useAdminOverview() {
  return useQuery({
    queryKey: ["admin", "overview", BUILD_COMMIT],
    queryFn: () =>
      customFetch<AdminOverview>(
        `/api/admin/overview${BUILD_COMMIT ? `?webCommit=${encodeURIComponent(BUILD_COMMIT)}` : ""}`,
      ),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    retry: false,
  });
}

// ── Small shared pieces ─────────────────────────────────────────────────────

/**
 * A figure and its label. Never renders a value the API did not send: an
 * absent number renders "—", never 0, and never a plausible-looking stand-in.
 */
function Stat({ label, value, tone }: { label: string; value: string | null; tone?: string }) {
  return (
    <VStack gap={2} minWidth0>
      <MonoLabel size={9}>{label}</MonoLabel>
      <Text numeric size={16} weight={600} color={tone ?? "var(--ft-text)"}>
        {value ?? "—"}
      </Text>
    </VStack>
  );
}

/** A dim key/value line inside a panel body. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <HStack gap={10} align="baseline" justify="between" wide minWidth0>
      <MonoLabel size={9}>{label}</MonoLabel>
      <div style={{ minWidth: 0, textAlign: "right" }}>{children}</div>
    </HStack>
  );
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "—";
}

// Breaker state carries meaning, so it gets colour. Nothing else on this page
// does — hierarchy comes from structure and scale, per DESIGN.md.
const BREAKER_TONE: Record<string, string> = {
  closed: "var(--ft-green)",
  half: "var(--ft-amber)",
  open: "var(--ft-red)",
};

const DEPLOY_TONE: Record<string, string> = {
  match: "var(--ft-green)",
  behind: "var(--ft-red)",
  unknown: "var(--ft-muted)",
};

// ── Panels ──────────────────────────────────────────────────────────────────

function DeployPanel({ deploy }: { deploy: AdminOverview["deploy"] }) {
  return (
    <PanelBox>
      <PanelHeader
        right={
          <Text mono size={9} color={DEPLOY_TONE[deploy.verdict] ?? "var(--ft-muted)"} upper>
            {deploy.verdict}
          </Text>
        }
      >
        Deploy
      </PanelHeader>
      <VStack gap={8} padding={12}>
        {/* The sentence first. The three shas below are the evidence for it,
            and are useless without it. */}
        <Text size={12} color="var(--ft-text)" lineHeight={1.5}>
          {deploy.detail}
        </Text>
        <Row label="origin/main">
          <Text numeric size={12}>{shortSha(deploy.originMainCommit)}</Text>
        </Row>
        <Row label="API">
          <Text numeric size={12}>{shortSha(deploy.apiCommit)}</Text>
        </Row>
        <Row label="Web bundle">
          <Text numeric size={12}>{shortSha(deploy.webCommit)}</Text>
        </Row>
        {deploy.originMainSource && (
          <Text size={10} color="var(--ft-dim)" lineHeight={1.5}>
            {deploy.originMainSource}
          </Text>
        )}
      </VStack>
    </PanelBox>
  );
}

function CeilingRow({ ceiling }: { ceiling: AdminCeiling }) {
  const measurable = ceiling.source.kind === "measurable";
  return (
    <VStack gap={3} minWidth0>
      <HStack gap={8} justify="between" align="baseline" wide minWidth0>
        <Text size={11} color="var(--ft-text)">{ceiling.label}</Text>
        <Text numeric size={11} nowrap>
          {ceiling.limit === null ? "—" : `${ceiling.limit} ${ceiling.unit}`}
        </Text>
      </HStack>
      <Text size={10} color="var(--ft-dim)" lineHeight={1.45}>
        {ceiling.symptom}
      </Text>
      {/* Provenance. A stated fact shows the date a human checked it; a
          measured one says what measures it. Same argument as the `fx` mark
          in DESIGN.md — a figure should say where it came from. */}
      <Text size={9} color="var(--ft-dim)">
        {measurable
          ? `measured · ${"via" in ceiling.source ? ceiling.source.via : ""}`
          : `stated · checked ${"checkedOn" in ceiling.source ? ceiling.source.checkedOn : ""}`}
      </Text>
    </VStack>
  );
}

function ServicePanel({ service }: { service: AdminServiceFact }) {
  return (
    <PanelBox>
      <PanelHeader
        right={
          <Text numeric size={10} color={service.monthlyCostGbp > 0 ? "var(--ft-amber)" : "var(--ft-muted)"}>
            {service.monthlyCostGbp === 0 ? "£0" : `£${service.monthlyCostGbp}/mo`}
          </Text>
        }
      >
        {service.name}
      </PanelHeader>
      <VStack gap={10} padding={12}>
        <Text size={11} color="var(--ft-muted)" lineHeight={1.5}>
          {service.role}
        </Text>
        <Row label="Plan">
          <Text size={11}>{service.plan}</Text>
        </Row>
        {service.nextPlan && (
          <Row label="Next plan">
            <Text size={11}>
              {service.nextPlan.name} ≈ £{service.nextPlan.monthlyCostGbp}/mo
            </Text>
          </Row>
        )}
        {service.launchBlocker && (
          // A blocking fact is not a footnote. It sits in the body at reading
          // size with a tinted surface — a one-off treatment that stays inline
          // rather than being folded into PanelBox, per the primitives split.
          <div
            style={{
              background: "color-mix(in srgb, var(--ft-red) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ft-red) 25%, transparent)",
              padding: 10,
            }}
          >
            <VStack gap={4}>
              <Text mono size={9} upper color="var(--ft-red)" letterSpacing="0.1em">
                Not launch-safe
              </Text>
              <Text size={11} color="var(--ft-text)" lineHeight={1.5}>
                {service.launchBlocker}
              </Text>
            </VStack>
          </div>
        )}
        <VStack gap={10}>
          {service.ceilings.map((c) => (
            <CeilingRow key={c.label} ceiling={c} />
          ))}
        </VStack>
      </VStack>
    </PanelBox>
  );
}

function ProvidersPanel({
  providers,
  yahooRichQuote,
}: {
  providers: AdminOverview["providers"];
  yahooRichQuote: AdminOverview["yahooRichQuote"];
}) {
  return (
    <PanelBox>
      <PanelHeader>Provider breakers</PanelHeader>
      <VStack gap={0}>
        {providers.map((p, i) => {
          const headroom =
            p.creditsBudget !== null && p.creditsBudget > 0
              ? p.creditsBudget - p.creditsUsedToday
              : null;
          return (
            <VStack
              key={p.name}
              gap={4}
              padding={12}
              // Rows are separated by the hairline, not by a card each.
              className={i > 0 ? "ft-admin-row" : undefined}
            >
              <HStack gap={8} justify="between" align="baseline" wide minWidth0>
                <Text size={12} color="var(--ft-text)">{p.name}</Text>
                <Text mono size={10} upper color={BREAKER_TONE[p.breaker] ?? "var(--ft-muted)"}>
                  {p.configured ? p.breaker : "no key"}
                </Text>
              </HStack>
              {headroom !== null && (
                <Row label="Credits left today">
                  <Text numeric size={11}>
                    {headroom} of {p.creditsBudget}
                  </Text>
                </Row>
              )}
              <Row label="Last OK">
                <Text numeric size={11} color={p.lastOk ? "var(--ft-muted)" : "var(--ft-red)"}>
                  {p.lastOk ? new Date(p.lastOk).toLocaleString() : "never"}
                </Text>
              </Row>
              {p.lastError && (
                <Text size={10} color="var(--ft-dim)" lineHeight={1.45}>
                  {p.lastError.message}
                </Text>
              )}
            </VStack>
          );
        })}
        {yahooRichQuote.degradedCount > 0 && (
          <VStack gap={4} padding={12} className="ft-admin-row">
            <MonoLabel size={9}>Yahoo rich quotes</MonoLabel>
            <Text size={11} color="var(--ft-amber)" lineHeight={1.5}>
              Degraded to chart prices {yahooRichQuote.degradedCount} times
              {yahooRichQuote.degradedSince
                ? ` since ${new Date(yahooRichQuote.degradedSince).toLocaleString()}`
                : ""}
              . Analyst targets, PE and 52-week range are unavailable; prices are live.
            </Text>
          </VStack>
        )}
      </VStack>
    </PanelBox>
  );
}

function TrafficPanel({ traffic }: { traffic: AdminOverview["traffic"] }) {
  const classified = traffic.byClient.phone + traffic.byClient.desktop;
  return (
    <PanelBox>
      <PanelHeader
        right={<Text mono size={9} color="var(--ft-dim)">{traffic.windowDays}D</Text>}
      >
        Traffic
      </PanelHeader>
      <VStack gap={12} padding={12}>
        <HStack gap={20} wrap>
          <Stat label="Requests" value={traffic.requests.toLocaleString()} />
          <Stat
            label="Error rate"
            value={traffic.errorRatePct === null ? null : `${traffic.errorRatePct}%`}
            tone={
              traffic.errorRatePct !== null && traffic.errorRatePct > 1
                ? "var(--ft-red)"
                : undefined
            }
          />
          <Stat label="5xx" value={String(traffic.serverErrors)} />
          <Stat label="4xx" value={String(traffic.clientErrors)} />
        </HStack>

        <VStack gap={6}>
          <MonoLabel size={9}>Phone vs desktop</MonoLabel>
          {classified === 0 ? (
            <Text size={11} color="var(--ft-dim)" lineHeight={1.5}>
              No classified requests yet. The client column was added on
              2026-09-06 and only fills going forward.
            </Text>
          ) : (
            <>
              <Row label="Phone">
                <Text numeric size={11}>{traffic.byClient.phone.toLocaleString()}</Text>
              </Row>
              <Row label="Desktop">
                <Text numeric size={11}>{traffic.byClient.desktop.toLocaleString()}</Text>
              </Row>
            </>
          )}
          {/* The unclassified share is shown, never dropped. Dividing over the
              classified rows alone would describe the last few days as though
              it described the whole window. */}
          <Row label="Unclassified">
            <Text numeric size={11} color="var(--ft-dim)">
              {traffic.byClient.unclassified.toLocaleString()}
            </Text>
          </Row>
          {traffic.clientSplitNote && (
            <Text size={10} color="var(--ft-dim)" lineHeight={1.45}>
              {traffic.clientSplitNote}
            </Text>
          )}
        </VStack>

        {traffic.slowestRoutes.length > 0 && (
          <VStack gap={6}>
            <MonoLabel size={9}>Slowest routes by p95</MonoLabel>
            {traffic.slowestRoutes.map((r) => (
              <HStack key={r.route} gap={10} justify="between" align="baseline" wide minWidth0>
                <Text size={11} truncate color="var(--ft-muted)">{r.route}</Text>
                <Text numeric size={11} nowrap>
                  {r.p95Ms}ms · p50 {r.p50Ms}ms · n={r.samples}
                </Text>
              </HStack>
            ))}
          </VStack>
        )}

        {traffic.failingRoutes.length > 0 && (
          <VStack gap={6}>
            <MonoLabel size={9}>Routes returning 5xx</MonoLabel>
            {traffic.failingRoutes.map((r) => (
              <HStack key={r.route} gap={10} justify="between" align="baseline" wide minWidth0>
                <Text size={11} truncate color="var(--ft-muted)">{r.route}</Text>
                <Text numeric size={11} nowrap color="var(--ft-red)">
                  {r.errors} of {r.samples}
                </Text>
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    </PanelBox>
  );
}

function UsersPanel({ users }: { users: AdminOverview["users"] }) {
  return (
    <PanelBox>
      <PanelHeader right={<Text numeric size={10} color="var(--ft-muted)">{users.total}</Text>}>
        Users
      </PanelHeader>
      <VStack gap={0}>
        {users.accounts.map((u, i) => {
          const held = Object.entries(u.holdings).filter(([, n]) => n > 0);
          return (
            <VStack key={u.id} gap={4} padding={12} className={i > 0 ? "ft-admin-row" : undefined}>
              <HStack gap={10} justify="between" align="baseline" wide minWidth0>
                <Text size={12} truncate color="var(--ft-text)">{u.email}</Text>
                <Text numeric size={10} nowrap color="var(--ft-dim)">
                  {u.createdAt.slice(0, 10)}
                </Text>
              </HStack>
              <Text size={10} color="var(--ft-muted)" lineHeight={1.5}>
                {held.length === 0
                  ? "no data"
                  : held.map(([k, n]) => `${n} ${k}`).join(" · ")}
              </Text>
            </VStack>
          );
        })}
      </VStack>
    </PanelBox>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Admin() {
  const { data, isPending, error } = useAdminOverview();

  if (isPending) {
    return (
      <div className="p-4">
        <PageHeader icon={ShieldAlert} title="Admin" subtitle="Loading service state…" />
      </div>
    );
  }

  if (error || !data) {
    // A 403 here is the expected state for a non-admin and for a deployment
    // with no allowlist configured. Both are stated plainly rather than
    // rendered as a generic failure.
    return (
      <div className="p-4">
        <PageHeader icon={ShieldAlert} title="Admin" />
        <PanelBox padding={16}>
          <VStack gap={8}>
            <Text size={13} color="var(--ft-text)">
              This page is not available for your account.
            </Text>
            <Text size={11} color="var(--ft-dim)" lineHeight={1.5}>
              {error instanceof Error ? error.message : "Could not load the admin overview."}
            </Text>
            <Link href="/">
              <Text size={11} color="var(--ft-accent)">Back to dashboard</Text>
            </Link>
          </VStack>
        </PanelBox>
      </div>
    );
  }

  const { services, deploy, providers, traffic, users, yahooRichQuote } = data;
  const blockers = services.facts.filter((s) => s.launchBlocker !== null);

  return (
    <div className="p-4">
      <PageHeader
        icon={ShieldAlert}
        title="Admin"
        subtitle={`${services.facts.length} services · facts last checked ${services.oldestCheckDate}`}
      />

      <VStack gap={16}>
        {/* The three things that would change a decision today, before any
            detail: what it costs, what cannot ship, and whether what is
            deployed is what was written. */}
        <PanelBox>
          <PanelHeader>Now</PanelHeader>
          <HStack gap={24} padding={12} wrap>
            <Stat
              label="Monthly spend"
              value={`£${services.totalMonthlyCostGbp}`}
              tone={services.totalMonthlyCostGbp > 0 ? "var(--ft-amber)" : undefined}
            />
            <Stat
              label="Launch blockers"
              value={String(blockers.length)}
              tone={blockers.length > 0 ? "var(--ft-red)" : undefined}
            />
            <Stat label="Users" value={String(users.total)} />
            <Stat
              label="Deploy"
              value={deploy.verdict}
              tone={DEPLOY_TONE[deploy.verdict]}
            />
          </HStack>
        </PanelBox>

        <DeployPanel deploy={deploy} />
        <ProvidersPanel providers={providers} yahooRichQuote={yahooRichQuote} />
        <TrafficPanel traffic={traffic} />
        <UsersPanel users={users} />

        <VStack gap={12}>
          <MonoLabel size={9}>Services and ceilings</MonoLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {services.facts.map((s) => (
              <ServicePanel key={s.id} service={s} />
            ))}
          </div>
        </VStack>
      </VStack>
    </div>
  );
}
