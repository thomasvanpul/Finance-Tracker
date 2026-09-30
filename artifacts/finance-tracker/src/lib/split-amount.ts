/**
 * The nativeAmount a split line is written with.
 *
 * Rows store a positive magnitude and let `type` carry the direction:
 * the add/edit form, `openEdit` and the CSV import all write
 * `Math.abs(...)`, and the api-server's `adjustAccountBalance` negates
 * for `expense` itself. The split flow used to send `-amount` for
 * expenses, so the server negated twice and each split expense line
 * raised the account balance instead of lowering it.
 */
export function splitLineAmount(amount: string): number {
  return Math.abs(parseFloat(amount));
}
