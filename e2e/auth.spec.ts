import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, login, logout } from "./helpers";

test.describe("access", () => {
  test("signed-out visitors are sent to sign in", async ({ page }) => {
    for (const path of ["/student", "/teacher", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("a wrong password is refused with a message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("dana@ascent.demo");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.locator("p[role=alert]")).toContainText(/incorrect/i);
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
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/teacher$/);
    await logout(page);

    await login(page, "admin@ascent.demo");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("a new student joins a class with its code", async ({ page }) => {
    const email = `new-${Date.now()}@example.test`;
    await page.goto("/register?code=DEMO27");
    await page.getByLabel("Name").fill("Nia Newcomer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`${DEMO_PASSWORD}-x`);
    await page.getByRole("button", { name: /create account|join/i }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("files are only downloadable by people who may open them", async ({ request }) => {
    const res = await request.get("/api/files/00000000-0000-4000-8000-000000000000");
    expect(res.status()).toBe(401);
  });
});
