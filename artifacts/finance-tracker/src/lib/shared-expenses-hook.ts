// Hand-rolled hook for the F4 shared-expenses endpoints.
//
// The orval-generated client (@workspace/api-client-react) doesn't
// carry these routes yet — the openapi spec needs a follow-up pass
// once the UI stabilises. Rather than gate F4-4 (notification wiring)
// on that codegen churn, this file wraps the raw fetch + TanStack
// Query so the notification panel can consume the same
// data-loading shape as every other useList* hook.
//
// Types are hand-mirrored from the router's response shape; if the
// router changes, this hook does too. Compact enough that keeping
// the two in sync is cheaper than a codegen round-trip.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface SharedExpenseParticipant {
  id: number;
  name: string;
  linkedEmail: string | null;
  linkedUserId: string | null;
  shareInput: number | null;
  shareAmount: number;
  isPayer: boolean;
  // outstanding | requested | acknowledged | disputed | waived
  status: string;
}

export interface SharedExpense {
  id: number;
  userId: string;
  description: string;
  date: string;
  totalAmount: number;
  currency: string;
  splitRule: "equal" | "exact" | "shares";
  notes: string | null;
  accountId: number | null;
  createdAt: string;
  updatedAt: string;
  participants: SharedExpenseParticipant[];
}

const KEY = ["shared-expenses"] as const;

export function useListSharedExpenses() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => customFetch<SharedExpense[]>("/api/shared-expenses"),
  });
}

export interface CreateSharedExpenseInput {
  description: string;
  date: string;
  totalAmount: number;
  currency?: string;
  splitRule: "equal" | "exact" | "shares";
  notes?: string;
  accountId?: number;
  participants: Array<{
    name: string;
    linkedEmail?: string;
    shareInput?: number;
    isPayer?: boolean;
  }>;
}

export function useCreateSharedExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSharedExpenseInput) =>
      customFetch<SharedExpense>("/api/shared-expenses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

type PayerAction = "acknowledge" | "dispute" | "waive";

export function useParticipantSettlementAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expenseId: number;
      participantId: number;
      action: PayerAction | "request";
      note?: string;
    }) => {
      const url = `/api/shared-expenses/${input.expenseId}/participants/${input.participantId}/${input.action}`;
      await customFetch(url, {
        method: "POST",
        body: input.note != null ? JSON.stringify({ note: input.note }) : undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteSharedExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await customFetch(`/api/shared-expenses/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
