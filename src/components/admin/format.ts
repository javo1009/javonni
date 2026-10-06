/** 3_400_000 -> "3.2 MB"; small sizes in KB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024 * 0.1) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export const ACTION_LABEL: Record<string, string> = {
  "user.create": "Created an account",
  "user.disable": "Disabled an account",
  "user.enable": "Enabled an account",
  "user.password_reset": "Reset a password",
  "questions.import": "Imported questions",
};
