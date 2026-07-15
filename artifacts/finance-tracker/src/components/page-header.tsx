import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 34,
            height: 34,
            background: "rgba(31,111,235,0.12)",
            border: "1px solid rgba(31,111,235,0.25)",
            borderRadius: 4,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: "#58A6FF" }} />
        </div>
        <div>
          <h1
            className="text-base font-bold tracking-tight leading-tight"
            style={{ color: "#E6EDF3" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
