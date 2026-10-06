import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, toCsv } from "../csv";
import { markableOrder, sortStudents } from "../student-order";

describe("csvCell", () => {
  it("neutralises spreadsheet formulas in text", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("\tx")).toBe("'\tx");
  });
  it("keeps real numbers numeric, quotes commas, quotes and newlines", () => {
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("builds rows with CRLF and a BOM", () => {
    expect(
      toCsv([
        ["a", 1],
        ["b", null],
      ]),
    ).toBe("﻿a,1\r\nb,\r\n");
  });
  it("makes a safe file name", () => {
    expect(
      csvFileName("Ethics: case / write-up!", new Date("2026-11-12T21:00:00Z")),
    ).toBe("ethics-case-write-up-scores-2026-11-12.csv");
    expect(csvFileName("???", new Date("2026-11-12T21:00:00Z"))).toBe(
      "homework-scores-2026-11-12.csv",
    );
  });
});

describe("marking order", () => {
  const rows = [
    {
      name: "Zed",
      status: "graded" as const,
      submittedAt: "2026-11-01T10:00:00Z",
      submissionId: "g",
    },
    {
      name: "Bea",
      status: "submitted" as const,
      submittedAt: "2026-11-02T10:00:00Z",
      submissionId: "b",
    },
    {
      name: "Ann",
      status: "submitted" as const,
      submittedAt: "2026-11-03T10:00:00Z",
      submissionId: "a",
    },
    {
      name: "Cy",
      status: "in_progress" as const,
      submittedAt: null,
      submissionId: "c",
    },
    {
      name: "Dot",
      status: "not_started" as const,
      submittedAt: null,
      submissionId: null,
    },
  ];
  it("puts waiting work first, oldest hand-in first", () => {
    expect(sortStudents(rows).map((r) => r.name)).toEqual([
      "Bea",
      "Ann",
      "Cy",
      "Dot",
      "Zed",
    ]);
  });
  it("only includes handed-in work for marking navigation", () => {
    expect(markableOrder(rows).map((r) => r.name)).toEqual([
      "Bea",
      "Ann",
      "Zed",
    ]);
  });
});
