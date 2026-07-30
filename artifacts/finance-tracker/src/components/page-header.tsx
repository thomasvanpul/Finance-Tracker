import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { useIsMobile } from "@/hooks/use-mobile";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  mobileActions?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, mobileActions }: PageHeaderProps) {
  const isMobile = useIsMobile();
  const accentColor = useMemo(() => {
    const ids = loadPersonaIds();
    if (ids.length === 0) return "var(--ft-blue)";
    return PERSONA_COLORS[ids[0]] ?? "var(--ft-blue)";
  }, []);

  const visibleActions = isMobile && mobileActions !== undefined ? mobileActions : actions;

  return (
    <div className="ft-page-header flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 34,
            height: 34,
            background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 25%, transparent)`,
            borderRadius: 4,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
        </div>
        <div>
          <h1
            className="text-base font-bold tracking-tight leading-tight"
            style={{ color: "var(--ft-text)" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: "var(--ft-dim)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {visibleActions && (
        <div className="flex items-center gap-2 flex-nowrap justify-end flex-shrink-0">{visibleActions}</div>
      )}
    </div>
  );
}
