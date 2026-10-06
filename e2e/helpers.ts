import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "ascent-demo-2027";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login|\/$/);
}

/** A due date a few days ahead in the form's <input type=date> format. */
export function futureDate(days = 3) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
