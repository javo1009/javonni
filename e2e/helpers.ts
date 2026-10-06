import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "ascent-demo-2027";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.locator('button:has-text("Sign out"):visible').first().click();
  await expect(page).toHaveURL(/\/login/);
}

export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
