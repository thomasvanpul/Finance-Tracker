// Stubs for features not yet in the OpenAPI spec.
// Wire real API calls for history, detail, and options; keep others as no-ops.

import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { Debt } from "./generated/api.schemas";

export interface StockHistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EarningsEntry {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  surprise: number | null;
}

export interface RecTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface StockDetail {
  ticker: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  description: string | null;
  website: string | null;
  totalRevenue: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  netMargins: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  sharesOutstanding: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  enterpriseValue: number | null;
  pegRatio: number | null;
  forwardEps: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  institutionalOwnership: number | null;
  insiderOwnership: number | null;
  shortRatio: number | null;
  shortPercentFloat: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  targetMedian: number | null;
  fiftyTwoWeekChange: number | null;
  earningsHistory: EarningsEntry[];
  recommendationTrend: RecTrend[];
  nextEarningsDate: string | null;
  analystCount: number | null;
  recommendationKey: string | null;
}

export interface OptionsContract {
  strike: number;
  expiration: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

export interface OptionsChain {
  ticker: string;
  expiryDates: string[];
  selectedExpiry: string;
  underlyingPrice: number;
  calls: OptionsContract[];
  puts: OptionsContract[];
}

export interface UserLookupResult {
  userId: string;
  email: string;
  name?: string;
}

export const getGetMarketHistoryQueryKey = (params: { ticker: string; period?: string }) =>
  ["/api/market/history", params] as const;

export const getGetMarketDetailQueryKey = (params: { ticker: string }) =>
  ["/api/market/detail", params] as const;

export const getGetOptionsChainQueryKey = (params: { ticker: string; expiration?: string }) =>
  ["/api/market/options", params] as const;

export const getListReceivedDebtsQueryKey = () =>
  ["/api/debts/received"] as const;

export function useGetMarketHistory(
  params: { ticker: string; period?: string },
  options?: { query?: object },
) {
  return useQuery<StockHistoryPoint[]>({
    queryKey: getGetMarketHistoryQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams({ ticker: params.ticker, ...(params.period ? { period: params.period } : {}) });
      return customFetch<StockHistoryPoint[]>(`/api/market/history?${qs}`);
    },
    enabled: false,
    ...((options as any)?.query ?? {}),
  });
}

export function useGetMarketDetail(
  params: { ticker: string },
  options?: { query?: object },
) {
  return useQuery<StockDetail | null>({
    queryKey: getGetMarketDetailQueryKey(params),
    queryFn: () => customFetch<StockDetail>(`/api/market/detail?ticker=${encodeURIComponent(params.ticker)}`),
    enabled: false,
    ...((options as any)?.query ?? {}),
  });
}

export function useGetOptionsChain(
  params: { ticker: string; expiration?: string },
  options?: { query?: object },
) {
  return useQuery<OptionsChain | null>({
    queryKey: getGetOptionsChainQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams({ ticker: params.ticker, ...(params.expiration ? { expiry: params.expiration } : {}) });
      return customFetch<OptionsChain>(`/api/market/options?${qs}`);
    },
    enabled: false,
    ...((options as any)?.query ?? {}),
  });
}

export function useListReceivedDebts(options?: { query?: object }) {
  return useQuery<Debt[]>({
    queryKey: getListReceivedDebtsQueryKey(),
    queryFn: () => customFetch<Debt[]>("/api/debts/received"),
    enabled: true,
    ...((options as any)?.query ?? {}),
  });
}

export function useRejectDebt(options?: object) {
  return useMutation<void, unknown, number>({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/debts/${id}/reject`, { method: "POST" }),
    ...(options ?? {}),
  });
}

export const userLookup = async (email: string): Promise<UserLookupResult | null> => {
  try {
    return await customFetch<UserLookupResult>(`/api/users/lookup?email=${encodeURIComponent(email)}`);
  } catch {
    return null;
  }
};
