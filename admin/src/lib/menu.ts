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

export const DEFAULT_GROUPS = [
  { label: "ภาพรวม", items: ["dashboard"] },
  { label: "จัดการ", items: ["customers", "banks", "plans", "subs", "senders", "groups"] },
  { label: "รายงาน & ระบบ", items: ["reports", "oa", "logs", "settings", "message-settings"] },
];
