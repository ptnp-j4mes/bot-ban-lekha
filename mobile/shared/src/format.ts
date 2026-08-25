export const formatBaht = (value: unknown) =>
  `${Number(value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`;

export const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const todayIso = () => {
  const now = new Date();
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

export const statusLabel = (status: string) => ({
  active: 'ใช้งาน',
  completed: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
  pending: 'รอชำระ',
  partial_paid: 'ชำระบางส่วน',
  overdue: 'เกินกำหนด',
  paid: 'ชำระแล้ว',
  pending_review: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
}[status] ?? status);
