import { expect, test } from "@playwright/test";
import { login, logout, unique } from "./helpers";

// One end-to-end story across roles. Runs serially; later steps depend on earlier ones.
test.describe.configure({ mode: "serial" });

const studentEmail = `${unique("e2e")}@example.test`;
const password = "e2e-password-123";
const hwTitle = unique("E2E homework");
const studentName = unique("E2E Student");

test("a new student joins with the class code and builds a plan", async ({ page }) => {
  await page.goto("/register?code=DEMO27");
  await expect(page.getByLabel("Class code")).toHaveValue("DEMO27");
  await page.getByLabel("Your name").fill(studentName);
  await page.getByLabel("Email").fill(studentEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // No plan yet -> onboarding.
  await expect(page).toHaveURL(/\/student\/onboarding/);
  await page.getByRole("button", { name: /build my plan|create my plan|build plan/i }).click();
  await expect(page.getByRole("link", { name: "Go to today" })).toBeVisible();
  await page.getByRole("link", { name: "Go to today" }).click();
  await expect(page).toHaveURL(/\/student$/);
});

test("the student completes a task and answers a practice question", async ({ page }) => {
  await login(page, studentEmail, password);
  const markDone = page.getByRole("button", { name: /mark .* done|^done$|mark done/i }).first();
  await markDone.click();
  await expect(page.getByRole("button", { name: /undo/i }).first()).toBeVisible();

  await page.goto("/student/practice/session?scope=mixed");
  // Options are styled labels wrapping visually-hidden radios: click what users see.
  await page.locator("label:has(input[type=radio])").first().click();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page.getByRole("button", { name: /^check/i }).click();
  await expect(page.getByText(/correct|not quite/i).first()).toBeVisible();
});

test("the teacher builds and assigns homework with the builder", async ({ page }) => {
  await login(page, "teacher@ascent.demo");
  await page.goto("/teacher/homework/new");
  await page.getByLabel("Title").fill(hwTitle);
  await page.getByRole("button", { name: /^next/i }).click();
  // Content: pick the first objective group and assemble questions.
  await page.getByText("Quantitative Methods", { exact: false }).first().click(); // open the topic
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /assemble/i }).click();
  await expect(page.getByText(/coverage/i).first()).toBeVisible();
  await page.getByRole("button", { name: /^next/i }).click();
  await page.getByRole("button", { name: /^next/i }).click();
  await page.getByRole("button", { name: /^assign/i }).click();
  await expect(page).toHaveURL(/\/teacher\/homework\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: hwTitle })).toBeVisible();
});

test("the student sees the new homework, answers and submits it", async ({ page }) => {
  await login(page, studentEmail, password);
  await page.goto("/student/homework");
  await page.getByRole("link", { name: new RegExp(hwTitle) }).click();
  const groups = page.locator("fieldset:has(input[type=radio])");
  await expect(groups.first()).toBeVisible();
  const n = await groups.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await groups.nth(i).locator("label:has(input[type=radio])").first().click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: /submit/i }).last().click();
  await expect(page.getByText(/score/i).first()).toBeVisible();
});

test("the teacher sees the submission in the funnel", async ({ page }) => {
  await login(page, "teacher@ascent.demo");
  await page.goto("/teacher/homework");
  await page.getByRole("link", { name: new RegExp(hwTitle) }).first().click();
  await expect(page.getByRole("row", { name: new RegExp(studentName) })).toContainText(/graded|submitted/i);
  await logout(page);
});
