import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("landing page explains the product and links to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know exactly what to study today");
  await expect(page.getByText(/not affiliated with or endorsed by CFA Institute/)).toBeVisible();
});

test("wrong password shows an error and keeps the email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("dana@ascent.demo");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  await expect(page.getByLabel("Email")).toHaveValue("dana@ascent.demo");
});

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  for (const path of ["/student", "/teacher", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("each role lands in its own area and can't open the others", async ({ page }) => {
  await login(page, "dana@ascent.demo");
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/student$/);
  await logout(page);

  await login(page, "teacher@ascent.demo");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/teacher$/);
  await logout(page);

  await login(page, "admin@ascent.demo");
  await expect(page).toHaveURL(/\/admin$/);
});

test("a teacher can't open another class's student by id", async ({ page }) => {
  await login(page, "teacher@ascent.demo");
  // With streaming (loading.tsx) the status is sent before notFound() runs, so
  // assert on what renders: the not-found page and no student data.
  await page.goto("/teacher/students/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
  await expect(page.getByText("Readiness")).toHaveCount(0);
});

test("health check reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, db: "up" });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
