// The add-position form, on the phone.
//
// The market persona's primary action is "add a holding": pressing N or
// the FAB calls addInvestmentHref() and navigates to /investments?add=1
// (components/quick-add-transaction.tsx · openQuickAdd). On desktop
// pages/investments.tsx reads that parameter and opens its dialog. On
// the phone /investments is absorbed by WorthScreen, which had no
// handler for `add` at all — so the FAB navigated, the tab rendered,
// and the persona's main action did nothing. Zero dialogs, zero
// drawers, no error.
//
// The form itself is components/investments/investment-form-fields.tsx,
// the same component the desktop dialogs render. Building a second
// phone-shaped rendering of it was the other option and it is the one
// the recent refactor commits exist to undo: one form, two surfaces.
//
// The open state is the URL, not a useState, for the same reason
// WorthScreen's detail surfaces are: arriving from the FAB and arriving
// from a pasted link are the same event, and the hardware back gesture
// closes the sheet.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateInvestment,
  getListInvestmentsQueryKey,
  getGetInvestmentSummaryQueryKey,
} from "@workspace/api-client-react";
import { MobileSheet } from "@/components/mobile-sheet";
import { Button } from "@/components/ui/button";
import { InvestmentFormFields } from "@/components/investments/investment-form-fields";
import { useQueryParam } from "@/hooks/use-query-param";
import { useToast } from "@/hooks/use-toast";
import type { InvForm } from "@/pages/investments/types";
import { makeEmptyInvForm } from "@/pages/investments/types";

// Same shape the desktop page submits. Kept beside the form rather than
// imported from the page so this does not pull a 2,700-line module into
// the phone bundle.
function getSubmitData(form: InvForm) {
  const ticker = form.ticker.toUpperCase();
  const fees = parseFloat(form.fees || "0") || 0;
  if (form.inputMode === "totalCost") {
    const totalShares = parseFloat(form.totalShares) || 0;
    const totalCost = parseFloat(form.totalCost) || 0;
    return {
      ticker, name: form.name, buyDate: form.buyDate,
      shares: totalShares,
      costPricePerShare: totalShares > 0 ? (totalCost + fees) / totalShares : 0,
    };
  }
  const shares = parseFloat(form.shares) || 0;
  const costPricePerShare = parseFloat(form.costPricePerShare) || 0;
  return {
    ticker, name: form.name, buyDate: form.buyDate, shares,
    costPricePerShare: costPricePerShare + (shares > 0 ? fees / shares : 0),
  };
}

export function AddPositionSheet() {
  const addParam = useQueryParam("add");
  const [location, navigate] = useLocation();
  const [form, setForm] = useState<InvForm>(makeEmptyInvForm);
  const [submitting, setSubmitting] = useState(false);
  const createInv = useCreateInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const open = addParam === "1";

  // Fresh form each time the sheet is asked for, so a dismissed
  // half-filled position does not reappear on the next press.
  useEffect(() => {
    if (open) setForm(makeEmptyInvForm());
  }, [open]);

  const close = () => {
    const next = new URLSearchParams(window.location.search);
    next.delete("add");
    const qs = next.toString();
    navigate(qs ? `${location}?${qs}` : location);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createInv.mutateAsync({ data: getSubmitData(form) });
      queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInvestmentSummaryQueryKey() });
      toast({ title: "Position added" });
      close();
    } catch {
      toast({ title: "Failed to add position", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileSheet open={open} onOpenChange={(o) => { if (!o) close(); }} title="Add Position">
      <form onSubmit={handleSubmit} id="add-position-form">
        <InvestmentFormFields form={form} setForm={setForm} idPrefix="inv-phone" />
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <Button type="button" variant="outline" onClick={close} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} style={{ flex: 1 }}>
            {submitting ? "Adding…" : "Add Position"}
          </Button>
        </div>
      </form>
    </MobileSheet>
  );
}
