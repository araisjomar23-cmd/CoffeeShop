import assert from "node:assert/strict";
import test from "node:test";
import { readAllPages } from "../src/lib/read-all-pages.ts";

test("reports include more than the API's 1000 row limit", async () => {
  const records = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const result = await readAllPages(async (from, to) => ({ data: records.slice(from, to + 1), error: null }));
  assert.deepEqual(result, records);
});

test("a later page failure must not return a partial sales total", async () => {
  await assert.rejects(readAllPages(async (from) => from === 0
    ? { data: Array(500).fill(1) as number[], error: null }
    : { data: null, error: new Error("Connection lost") }), /Connection lost/);
});
