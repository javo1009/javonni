import { describe, expect, it } from "vitest";
import { BackupError, normalizeBackup, toBackupJson } from "../backup";

const known = new Set(["quantitative-methods-01", "quantitative-methods-02", "economics-01"]);

// Shaped exactly like the sample dashboard's export.
const sample = {
  version: 1,
  exportedAt: "2026-11-01T10:00:00.000Z",
  data: {
    settings: { examDate: "2027-02-18", weeklyTarget: 12 },
    modules: {
      "quantitative-methods-01": { read: true, practice: true, review: false, accuracy: 82 },
      "quantitative-methods-02": { read: true, practice: false, review: false, accuracy: "" },
      "not-a-real-module": { read: true },
    },
    sessions: [
      { id: "a", date: "2026-10-07", hours: 1.5, topic: "Quantitative Methods", note: "TVM" },
      { id: "b", date: "2026-10-08", hours: 0, topic: "x", note: "" },
      { id: "c", date: "2026-13-40", hours: 1, topic: "x", note: "" },
    ],
    mocks: [
      { id: "m", date: "2027-01-24", score: 64.5, note: "weak on FSA" },
      { id: "n", date: "2027-02-01", score: 140, note: "" },
    ],
  },
};

describe("normalizeBackup", () => {
  const n = normalizeBackup(sample, known);

  it("reads settings, chapters, sessions and mocks", () => {
    expect(n.settings).toEqual({ examDate: "2027-02-18", weeklyTargetHours: 12 });
    expect(n.modules.get("quantitative-methods-01")).toEqual({ read: true, practice: true, review: false, accuracy: 82 });
    expect(n.modules.get("quantitative-methods-02")?.accuracy).toBeNull(); // "" means no score
    expect(n.sessions).toEqual([{ date: "2026-10-07", hours: 1.5, topic: "Quantitative Methods", note: "TVM" }]);
    expect(n.mocks).toEqual([{ date: "2027-01-24", score: 64.5, note: "weak on FSA" }]);
  });

  it("skips and counts rows that don't validate", () => {
    expect(n.skipped).toEqual({ modules: 1, sessions: 2, mocks: 1 });
    expect(n.modules.has("not-a-real-module")).toBe(false);
  });

  it("rejects files that aren't backups", () => {
    for (const bad of [null, "x", [], {}, { data: {} }, { data: { modules: [], sessions: [] } }, { data: { modules: {}, sessions: "no" } }])
      expect(() => normalizeBackup(bad, known)).toThrow(BackupError);
  });

  it("ignores out-of-range settings and clamps scores", () => {
    const m = normalizeBackup({ data: { settings: { examDate: "nope", weeklyTarget: 500 }, modules: { "economics-01": { read: true, accuracy: 250 } }, sessions: [] } }, known);
    expect(m.settings).toEqual({ examDate: null, weeklyTargetHours: null });
    expect(m.modules.get("economics-01")?.accuracy).toBe(100);
  });

  it("round-trips through the export shape", () => {
    const out = toBackupJson({
      examDate: "2027-02-18",
      weeklyTargetHours: 12,
      modules: n.modules,
      sessions: n.sessions,
      mocks: n.mocks,
      exportedAt: "2026-11-02T00:00:00.000Z",
    });
    const again = normalizeBackup(JSON.parse(JSON.stringify(out)), known);
    expect(again.modules).toEqual(n.modules);
    expect(again.sessions).toEqual(n.sessions);
    expect(again.mocks).toEqual(n.mocks);
    expect(again.settings).toEqual(n.settings);
  });
});
