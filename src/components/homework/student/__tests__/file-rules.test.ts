import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTR as SERVER_ACCEPT,
  ALLOWED_EXTENSIONS as SERVER_EXT,
  FILE_LIMITS,
  FILE_TYPES,
} from "@/services/files";
import {
  ACCEPT_ATTR,
  ALLOWED_EXTENSIONS,
  FILE_RULES,
  FILE_TYPE_LABELS,
  formatBytes,
  iconKindOf,
  validateClientFile,
} from "../file-rules";

describe("client file rules stay in sync with the server", () => {
  it("matches limits, extensions, labels and accept attribute", () => {
    expect(FILE_RULES.maxBytes).toBe(FILE_LIMITS.maxBytes);
    expect(FILE_RULES.perItem).toBe(FILE_LIMITS.perItem);
    expect([...ALLOWED_EXTENSIONS].sort()).toEqual([...SERVER_EXT].sort());
    expect(ACCEPT_ATTR).toBe(SERVER_ACCEPT);
    for (const [ext, t] of Object.entries(FILE_TYPES))
      expect(FILE_TYPE_LABELS[ext]).toBe(t.label);
  });
});

describe("validateClientFile", () => {
  it("accepts an allowed file within limits", () => {
    expect(
      validateClientFile({ name: "Worksheet.PDF", size: 1000 }),
    ).toBeNull();
  });
  it("rejects unknown types and extensionless names", () => {
    expect(validateClientFile({ name: "virus.exe", size: 10 })).toMatch(
      /isn't an allowed type/,
    );
    expect(validateClientFile({ name: "README", size: 10 })).toMatch(
      /isn't an allowed type/,
    );
    expect(validateClientFile({ name: ".pdf", size: 10 })).toMatch(
      /isn't an allowed type/,
    );
  });
  it("rejects empty and oversized files", () => {
    expect(validateClientFile({ name: "a.pdf", size: 0 })).toMatch(/empty/);
    expect(
      validateClientFile({ name: "a.pdf", size: FILE_RULES.maxBytes }),
    ).toBeNull();
    expect(
      validateClientFile({ name: "a.pdf", size: FILE_RULES.maxBytes + 1 }),
    ).toMatch(/4\.1 MB.*at most 4 MB/);
  });
  it("enforces the per-item count", () => {
    expect(
      validateClientFile({ name: "a.pdf", size: 5 }, FILE_RULES.perItem - 1),
    ).toBeNull();
    expect(
      validateClientFile({ name: "a.pdf", size: 5 }, FILE_RULES.perItem),
    ).toMatch(/at most 5 files/);
  });
});

describe("formatBytes / iconKindOf", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
    expect(formatBytes(4.25 * 1024 * 1024)).toBe("4.3 MB");
    expect(formatBytes(4 * 1024 * 1024 + 10)).toBe("4.1 MB");
  });
  it("maps extensions to icon kinds", () => {
    expect(iconKindOf("a.pdf")).toBe("pdf");
    expect(iconKindOf("a.DOCX")).toBe("doc");
    expect(iconKindOf("a.csv")).toBe("sheet");
    expect(iconKindOf("a.pptx")).toBe("slides");
    expect(iconKindOf("a.jpeg")).toBe("image");
    expect(iconKindOf("a.zip")).toBe("other");
  });
});
