import assert from "node:assert/strict";
import { automaticReadyDate } from "../lib/quote-ready-date.ts";

const now=new Date("2026-09-27T14:00:00.000Z");
assert.equal(automaticReadyDate(0,"",now),"2026-09-30");
assert.equal(automaticReadyDate(1,"",now),"2026-10-01");
assert.equal(automaticReadyDate(24,"",now),"2026-10-01");
assert.equal(automaticReadyDate(25,"",now),"2026-10-02");
assert.equal(automaticReadyDate(10,"2026-10-05",now),"2026-10-09");
console.log("Automatic ready date tests passed.");
