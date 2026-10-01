// Writing a large JSON object without holding it in memory.
//
// The backup export (data-export.ts) used to build every section into one
// object and res.json() it. Each field here is either a single value,
// stringified whole, or an async sequence of row pages, written one page at
// a time — so peak memory is one page, not the file.

export type JsonField = { value: unknown } | { pages: AsyncIterable<readonly unknown[]> };

export type Write = (chunk: string) => Promise<void>;

// Keyset pagination: each call fetches the rows after the last key seen, so
// a page costs an index range scan however deep into the table it is.
export async function* pagedRows<T>(
  pageSize: number,
  fetchPage: (after: number | null, limit: number) => Promise<T[]>,
  keyOf: (row: T) => number,
): AsyncGenerator<T[]> {
  let after: number | null = null;
  for (;;) {
    const page = await fetchPage(after, pageSize);
    if (page.length > 0) yield page;
    if (page.length < pageSize) return;
    after = keyOf(page[page.length - 1]);
  }
}

// Byte-for-byte what JSON.stringify(Object.fromEntries(fields)) would give,
// written in pieces.
export async function writeJsonObject(fields: Iterable<[string, JsonField]>, write: Write): Promise<void> {
  await write("{");
  let firstField = true;
  for (const [key, field] of fields) {
    await write(`${firstField ? "" : ","}${JSON.stringify(key)}:`);
    firstField = false;
    if ("value" in field) {
      await write(JSON.stringify((await field.value) ?? null));
      continue;
    }
    await write("[");
    let firstRow = true;
    for await (const page of field.pages) {
      if (page.length === 0) continue;
      await write(`${firstRow ? "" : ","}${page.map((r) => JSON.stringify(r)).join(",")}`);
      firstRow = false;
    }
    await write("]");
  }
  await write("}");
}
