import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useSyncPlaidTransactions,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, RefreshCw, Trash2, Edit2, Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const syncPlaid = useSyncPlaidTransactions();

  const handleSync = async () => {
    try {
      await syncPlaid.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      toast({ title: "Accounts synced successfully" });
    } catch (error) {
      toast({ title: "Failed to sync accounts", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Accounts</h1>
          <p className="text-muted-foreground">Manage your cash and linked bank accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSync} disabled={syncPlaid.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncPlaid.isPending ? "animate-spin" : ""}`} />
            Sync Bank
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Account</TableHead>
              <TableHead>Balance (Native)</TableHead>
              <TableHead className="text-right">Balance (GBP)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts?.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Landmark className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{account.name}</p>
                      {account.isPlaidLinked && (
                        <p className="text-xs text-muted-foreground">
                          Synced: {formatDate(account.lastSyncedAt || "")}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{formatNative(account.balance, account.currency)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatGbp(account.gbpEquivalent)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {accounts?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No accounts found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
