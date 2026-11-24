import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS, addDays, renewExpiry, resumeExpiry, shiftDate, todayLocal,
} from "../js/dates.js";

test("todayLocal memakai tanggal lokal, bukan UTC", () => {
  assert.equal(todayLocal(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.equal(todayLocal(new Date(2026, 0, 5, 0, 15)), "2026-01-05");
});

test("shiftDate melewati batas bulan, tahun, dan tahun kabisat", () => {
  assert.equal(shiftDate("2026-01-31", 1), "2026-02-01");
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
});

test("addDays menambah 24 jam per hari", () => {
  const result = addDays(new Date(2026, 0, 1, 12, 0), 31);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 1);
  assert.equal(result.getDate(), 1);
});

test("renewExpiry mulai dari sekarang bila langganan sudah habis", () => {
  assert.equal(renewExpiry(10_000, 1_000, 30), 10_000 + 30 * DAY_MS);
});

test("renewExpiry menumpuk dari expiry yang masih berjalan", () => {
  assert.equal(renewExpiry(10_000, 20_000, 7), 20_000 + 7 * DAY_MS);
});

test("resumeExpiry menambahkan waktu selama dihentikan", () => {
  assert.equal(resumeExpiry(100_000, 40_000, 100_000), 160_000);
});

test("resumeExpiry tanpa stoppedAt tidak menggeser expiry", () => {
  assert.equal(resumeExpiry(100_000, null, 500_000), 100_000);
});
