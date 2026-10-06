import { describe, expect, it } from "vitest";
import {
  csvCell,
  csvFileName,
  filterRows,
  relativeDay,
  rosterCsv,
  sortRows,
  studentStatus,
  type RosterRow,
} from "../class-roster";

const row = (o: Partial<RosterRow> & { name: string }): RosterRow => ({
  id: o.name,
  email: `${o.name.toLowerCase()}@x.test`,
  status: "on_track",
  attention: 0,
  alertCount: 0,
  alertKinds: [],
  chaptersRead: 0,
  chaptersTotal: 102,
  readPct: 0,
  weightedReadPct: 0,
  hoursThisWeek: 0,
  targetHours: 10,
  lastActive: null,
  lastActiveLabel: "Never",
  mockLatest: null,
  mockChange: null,
  missedHomework: 0,
  ...o,
});

describe("studentStatus", () => {
  it("prioritises inactive, then behind, then watch", () => {
    expect(studentStatus([])).toBe("on_track");
    expect(studentStatus([{ kind: "mock_drop" }])).toBe("watch");
    expect(
      studentStatus([{ kind: "mock_drop" }, { kind: "behind_hours" }]),
    ).toBe("behind");
    expect(
      studentStatus([{ kind: "behind_roadmap" }, { kind: "inactive" }]),
    ).toBe("inactive");
  });
});

describe("relativeDay", () => {
  it("words the gap", () => {
    expect(relativeDay(null, "2027-01-10")).toBe("Never");
    expect(relativeDay("2027-01-10", "2027-01-10")).toBe("Today");
    expect(relativeDay("2027-01-09", "2027-01-10")).toBe("Yesterday");
    expect(relativeDay("2027-01-05", "2027-01-10")).toBe("5 days ago");
    expect(relativeDay("2026-12-20", "2027-01-10")).toBe("3 weeks ago");
    expect(relativeDay("2026-09-10", "2027-01-10")).toBe("4 months ago");
  });
});

describe("sortRows", () => {
  const rows = [
    row({
      name: "Ben",
      lastActive: "2027-01-02",
      mockLatest: 70,
      attention: 1,
      alertCount: 1,
    }),
    row({
      name: "Ann",
      lastActive: null,
      mockLatest: null,
      attention: 4,
      alertCount: 2,
    }),
    row({ name: "Cy", lastActive: "2027-01-09", mockLatest: 55 }),
  ];
  it("sorts by attention descending", () => {
    expect(sortRows(rows, "attention", "desc").map((r) => r.name)).toEqual([
      "Ann",
      "Ben",
      "Cy",
    ]);
  });
  it("keeps empty values last in both directions", () => {
    expect(sortRows(rows, "active", "asc").map((r) => r.name)).toEqual([
      "Ben",
      "Cy",
      "Ann",
    ]);
    expect(sortRows(rows, "active", "desc").map((r) => r.name)).toEqual([
      "Cy",
      "Ben",
      "Ann",
    ]);
    expect(sortRows(rows, "mock", "desc").map((r) => r.name)).toEqual([
      "Ben",
      "Cy",
      "Ann",
    ]);
  });
  it("sorts names case-insensitively and does not mutate", () => {
    const before = rows.map((r) => r.name);
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual([
      "Ann",
      "Ben",
      "Cy",
    ]);
    expect(rows.map((r) => r.name)).toEqual(before);
  });
  it("breaks ties by name", () => {
    expect(sortRows(rows, "homework", "desc").map((r) => r.name)).toEqual([
      "Ann",
      "Ben",
      "Cy",
    ]);
  });
});

describe("filterRows", () => {
  const rows = [row({ name: "Dana Reyes" }), row({ name: "Omar Haddad" })];
  it("matches every term against name or email", () => {
    expect(filterRows(rows, "").length).toBe(2);
    expect(filterRows(rows, "dana").map((r) => r.name)).toEqual(["Dana Reyes"]);
    expect(filterRows(rows, "  HADDAD omar ").map((r) => r.name)).toEqual([
      "Omar Haddad",
    ]);
    expect(filterRows(rows, "haddad@x.test").length).toBe(1);
    expect(filterRows(rows, "zzz")).toEqual([]);
  });
});

describe("csv", () => {
  it("quotes and escapes", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });
  it("neutralises formula injection in text but not numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("\t=x")).toBe("'\t=x");
    expect(csvCell(-6)).toBe("-6");
  });
  it("builds a header plus one line per row", () => {
    const csv = rosterCsv([
      row({
        name: "=cmd|' /C calc'!A0",
        mockChange: -6,
        alertKinds: ["inactive", "mock_drop"],
      }),
    ]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith("'=cmd|' /C calc'!A0,")).toBe(true);
    expect(lines[1]).toContain(",-6,");
    expect(lines[1].endsWith("Inactive; Mock score dropped")).toBe(true);
  });
  it("makes a safe file name", () => {
    expect(csvFileName("CFA L1 — Spring '27!", "2027-01-10")).toBe(
      "cfa-l1-spring-27-students-2027-01-10.csv",
    );
    expect(csvFileName("***", "2027-01-10")).toBe(
      "class-students-2027-01-10.csv",
    );
  });
});

import { examCountdown } from "../class-roster";

describe("examCountdown", () => {
  it("words the countdown", () => {
    expect(examCountdown(null, "2027-01-10")).toEqual({
      date: null,
      text: "No exam date set",
    });
    expect(examCountdown("2027-02-18", "2027-01-10").text).toBe(
      "39 days to go",
    );
    expect(examCountdown("2027-01-11", "2027-01-10").text).toBe("1 day to go");
    expect(examCountdown("2027-01-10", "2027-01-10").text).toBe(
      "exam day is today",
    );
    expect(examCountdown("2027-01-09", "2027-01-10").text).toBe(
      "exam date has passed",
    );
  });
});
