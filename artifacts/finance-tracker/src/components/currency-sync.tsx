import { useEffect } from "react";
import { useGetSettingsCurrency } from "@workspace/api-client-react";
import { setBaseCurrency } from "@/lib/currency-store";

// App-level currency sync. MUST mount above the isMobile branch in
// App.tsx so it fires on every mount path — phone (PhoneShell) AND
// desktop (Layout). Previously this effect lived inside Layout
// (layout.tsx:1245) and PhoneShell never mounted Layout, so
// getBaseCurrency() stayed null for the entire lifetime of every
// wrapped route on phone. Every base-currency figure dashed forever.
//
// Fix landed 30 Aug (see commit that adds this file). Placement is
// load-bearing: the same class of bug will recur the moment anything
// else moves out of Layout. See CLAUDE.md § Hard constraints on the
// "one setter, one shell" defect.
export function CurrencySync() {
  const { data: currencyData } = useGetSettingsCurrency();
  useEffect(() => {
    if (currencyData?.baseCurrency) setBaseCurrency(currencyData.baseCurrency);
  }, [currencyData?.baseCurrency]);
  return null;
}
