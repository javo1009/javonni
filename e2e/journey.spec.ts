import path from "node:path";
import { expect, test } from "@playwright/test";
import { futureDate, login, logout } from "./helpers";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test.describe.configure({ mode: "serial" });

test("a student tracks chapters, hours and mock exams", async ({ page }) => {
  await login(page, "sam@ascent.demo");
  await page.getByRole("link", { name: "All chapters" }).click();
  await expect(page).toHaveURL(/\/student\/chapters/);
  const firstRead = page.getByRole("checkbox", { name: /read/i }).first();
  await firstRead.check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /read/i }).first()).toBeChecked();

  await page.getByRole("link", { name: "Study hours" }).click();
  await page.getByLabel(/hours/i).first().fill("1");
  await page.getByLabel(/minutes/i).first().fill("30");
  await page.getByRole("button", { name: /log|add|save/i }).first().click();
  await expect(page.getByText(/1 h 30|1h 30|1\.5/).first()).toBeVisible();

  await page.getByRole("link", { name: "Mock exams" }).click();
  await page.getByRole("spinbutton", { name: /score/i }).fill("64");
  await page.getByRole("button", { name: /add|save|record/i }).first().click();
  await expect(page.getByText("64%").first()).toBeVisible();
});

test("file homework: teacher sends a worksheet, student hands in work, teacher marks it", async ({ browser }) => {
  const title = `Fixed income worksheet ${Date.now()}`;

  // --- teacher creates the homework with a handout and assigns it
  const teacher = await (await browser.newContext()).newPage();
  await login(teacher, "teacher@ascent.demo");
  await teacher.goto("/teacher/homework/new");
  await teacher.getByLabel("Title").fill(title);
  await teacher.getByLabel(/instructions/i).fill("Work through the questions and upload your answers.");
  await teacher.getByLabel("Due date", { exact: true }).fill(futureDate(3));
  await teacher.getByLabel("Due time", { exact: true }).fill("18:00");
  await teacher.locator('input[type="file"]').first().setInputFiles(fixture("worksheet.pdf"));
  await expect(teacher.getByText("worksheet.pdf")).toBeVisible();
  await teacher.getByRole("button", { name: /assign now/i }).click();
  await expect(teacher.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(teacher.getByText("worksheet.pdf")).toBeVisible();

  // --- student downloads the handout, uploads their work and hands in
  const student = await (await browser.newContext()).newPage();
  await login(student, "dana@ascent.demo");
  await student.goto("/student/homework");
  await student.getByRole("link", { name: new RegExp(title) }).click();
  const [download] = await Promise.all([
    student.waitForEvent("download"),
    student.getByRole("link", { name: /worksheet\.pdf/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("worksheet.pdf");

  await student.locator('input[type="file"]').first().setInputFiles(fixture("answers.docx"));
  await expect(student.getByText("answers.docx")).toBeVisible();
  await student.getByRole("button", { name: /hand in/i }).click();
  await student.getByRole("dialog").getByRole("button", { name: /hand in/i }).click();
  await expect(student.getByText(/waiting for marking|handed in/i).first()).toBeVisible();

  // --- another student can't open Dana's file
  const other = await (await browser.newContext()).newPage();
  await login(other, "omar@ascent.demo");
  await other.goto("/student/homework");
  await expect(other.getByText("answers.docx")).toHaveCount(0);

  // --- teacher marks it and returns it
  await teacher.reload();
  await teacher.getByRole("link", { name: /mark/i }).first().click();
  await expect(teacher.getByRole("link", { name: /answers\.docx/ })).toBeVisible();
  await teacher.getByLabel(/points/i).first().fill("1");
  await teacher.getByLabel(/overall feedback|feedback for/i).first().fill("Good work, check question 3.");
  await teacher.getByRole("button", { name: /return graded work|update and return/i }).click();
  await expect(teacher.getByText(/returned/i).first()).toBeVisible();

  // --- the student sees the result
  await student.reload();
  await expect(student.getByText("Good work, check question 3.")).toBeVisible();
  await student.close();
  await other.close();
  await teacher.close();
});

test("the teacher sees how each student is pacing", async ({ page }) => {
  await login(page, "teacher@ascent.demo");
  await expect(page.getByRole("heading", { name: /needs attention/i })).toBeVisible();
  await page.getByRole("link", { name: "Marco Rossi" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Marco Rossi" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /chapters/i })).toBeVisible();
  await logout(page);
});

test("the admin sees platform health", async ({ page }) => {
  await login(page, "admin@ascent.demo");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Question coverage", exact: true }).click();
  await expect(page.getByText(/quantitative methods/i).first()).toBeVisible();
});
