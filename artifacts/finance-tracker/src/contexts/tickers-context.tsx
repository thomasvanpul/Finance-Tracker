import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface TickerSlot {
  ticker: string;
  label: string;
}

const DEFAULTS: TickerSlot[] = [
  { ticker: "^FTSE",   label: "FTSE" },
  { ticker: "^GSPC",   label: "SPX" },
  { ticker: "BTC-USD", label: "BTC" },
  { ticker: "GBPUSD=X", label: "GBP" },
];

function load(): TickerSlot[] {
  try {
    const raw = localStorage.getItem("ft-tickers");
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULTS;
}

function persist(tickers: TickerSlot[]) {
  try { localStorage.setItem("ft-tickers", JSON.stringify(tickers)); } catch {}
}

interface TickersCtx {
  tickers: TickerSlot[];
  update: (index: number, slot: TickerSlot) => void;
  add: () => void;
  remove: (index: number) => void;
  reset: () => void;
}

const TickersContext = createContext<TickersCtx | null>(null);

export function TickersProvider({ children }: { children: ReactNode }) {
  const [tickers, setTickers] = useState<TickerSlot[]>(load);

  const update = useCallback((index: number, slot: TickerSlot) => {
    setTickers(prev => {
      const next = prev.map((t, i) => i === index ? slot : t);
      persist(next);
      return next;
    });
  }, []);

  const add = useCallback(() => {
    setTickers(prev => {
      if (prev.length >= 8) return prev;
      const next = [...prev, { ticker: "", label: "" }];
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((index: number) => {
    setTickers(prev => {
      const next = prev.filter((_, i) => i !== index);
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setTickers(DEFAULTS);
    persist(DEFAULTS);
  }, []);

  return (
    <TickersContext.Provider value={{ tickers, update, add, remove, reset }}>
      {children}
    </TickersContext.Provider>
  );
}

export function useTickers() {
  const ctx = useContext(TickersContext);
  if (!ctx) throw new Error("useTickers must be used within TickersProvider");
  return ctx;
}
