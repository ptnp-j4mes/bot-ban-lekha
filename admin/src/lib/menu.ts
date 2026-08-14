export const MENU = [
  { id: "dashboard", label: "Dashboard" },
  { id: "customers", label: "ลูกค้า" },
  { id: "banks", label: "บัญชีรับโอน" },
  { id: "plans", label: "สร้างบิล" },
  { id: "subs", label: "สลิป / อนุมัติ" },
  { id: "senders", label: "ผู้ส่งสลิป" },
  { id: "groups", label: "กลุ่ม LINE" },
  { id: "reports", label: "รายงาน" },
  { id: "oa", label: "LINE OA" },
  { id: "logs", label: "ประวัติ" },
  { id: "settings", label: "ตั้งค่า" },
  { id: "message-settings", label: "ข้อความตอบกลับ LINE" },
];

export const MENU_PATHS = {
  dashboard: "/dashboard",
  customers: "/customers",
  banks: "/banks",
  plans: "/plans",
  subs: "/submissions",
  senders: "/senders",
  groups: "/groups",
  reports: "/reports",
  oa: "/line-oa",
  logs: "/logs",
  settings: "/settings",
  "message-settings": "/message-settings",
} as const;

export const PLATFORM_MENU_PATHS = {
  users: "/platform/users",
  system: "/platform/settings",
  gdrive: "/platform/google-drive",
} as const;

export type MenuId = keyof typeof MENU_PATHS;
export type PlatformMenuId = keyof typeof PLATFORM_MENU_PATHS;

function normalizePath(pathname: string) {
  const path = pathname.replace(/\/+$/, "");
  return path || "/";
}

export function menuPath(id: string) {
  return MENU_PATHS[id as MenuId] ?? MENU_PATHS.dashboard;
}

export function platformMenuPath(id: string) {
  return PLATFORM_MENU_PATHS[id as PlatformMenuId] ?? PLATFORM_MENU_PATHS.users;
}

export function menuIdFromPath(pathname: string): MenuId | undefined {
  const path = normalizePath(pathname);
  if (path === "/") return "dashboard";
  return (Object.entries(MENU_PATHS).find(([, value]) => value === path)?.[0] as MenuId | undefined);
}

export function platformMenuIdFromPath(pathname: string): PlatformMenuId | undefined {
  const path = normalizePath(pathname);
  return (Object.entries(PLATFORM_MENU_PATHS).find(([, value]) => value === path)?.[0] as PlatformMenuId | undefined);
}

export const DEFAULT_GROUPS = [
  { label: "ภาพรวม", items: ["dashboard"] },
  { label: "จัดการ", items: ["customers", "banks", "plans", "subs", "senders", "groups"] },
  { label: "รายงาน & ระบบ", items: ["reports", "oa", "logs", "settings", "message-settings"] },
];
