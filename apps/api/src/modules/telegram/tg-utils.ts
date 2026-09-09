// Escape HTML special chars so they don't break Telegram HTML parse mode
export function esc(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert role enum to readable label
export function humanRole(role: string): string {
  const map: Record<string, string> = {
    GOD:                  "Platform Owner",
    DEVELOPER:            "Developer",
    RESELLER_SUPER_ADMIN: "Reseller Admin",
    ADMIN:                "Admin",
    ELITE:                "Elite",
    USER:                 "User",
    INTERN:               "Intern",
  };
  return map[role] ?? role.replace(/_/g, " ");
}
