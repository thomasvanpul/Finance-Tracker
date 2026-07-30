import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";

type MobileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
};

export function MobileSheet({ open, onOpenChange, title, children, footer, maxWidth = 480 }: MobileSheetProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          style={{
            background: "var(--ft-surface)",
            borderColor: "var(--ft-border)",
            borderTop: "1px solid var(--ft-border2)",
            maxHeight: "92dvh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Pull handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4, flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--ft-border2)" }} />
          </div>
          <DrawerHeader style={{ padding: "8px 16px 0", flexShrink: 0 }}>
            <DrawerTitle
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ft-text)",
                textAlign: "left",
              }}
            >
              {title}
            </DrawerTitle>
          </DrawerHeader>
          <div
            style={{
              overflowY: "auto",
              flex: 1,
              padding: "12px 16px",
              WebkitOverflowScrolling: "touch" as const,
            }}
          >
            {children}
          </div>
          {footer && (
            <DrawerFooter
              style={{
                padding: "8px 16px",
                paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
                flexShrink: 0,
                borderTop: "1px solid var(--ft-border)",
                background: "var(--ft-surface)",
              }}
            >
              {footer}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {footer && <DialogFooter className="mt-6">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export { DialogClose, DrawerClose };
