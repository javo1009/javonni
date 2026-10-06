export const TEST_TEMPLATE_URL = process.env.DATABASE_URL_TEST ?? "postgres://ascent:ascent@127.0.0.1:5432/ascent_test";

export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export const templateName = () => new URL(TEST_TEMPLATE_URL).pathname.slice(1);
