export type TokenStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type MobileConfig = {
  apiBaseUrl: string;
  lineChannelId: string;
  customerDeepLinkScheme?: string;
  defaultOaId?: string;
};

export type AdminMe = {
  user_id: string;
  name?: string | null;
  is_platform_admin: boolean;
  org?: { id: string; name: string } | null;
  menu_prefs?: unknown;
};

export type CustomerBalance = {
  outstanding: number;
  count: number;
  next_due_date: string | null;
};

export type CustomerInstallment = {
  id: string;
  installment_no: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  bill_plan: { bill_no: number };
};

export type CustomerPayment = {
  id: string;
  amount: number;
  paid_at: string | null;
  payment_method: string;
  approved_at: string;
  bill_installment: { installment_no: number; bill_plan: { bill_no: number } };
};

export type CustomerSession = {
  token: string;
  customer: { customer_code: string; display_name: string | null };
};

export type Customer = {
  id: string;
  customer_code: string;
  display_name?: string | null;
  phone?: string | null;
  status: string;
  line_user_id?: string | null;
};

export type DashboardSummary = {
  collected: number;
  payment_count: number;
  pending_count: number;
  overdue_count: number;
  overdue_amount: number;
  customers: number;
  total_bill_amount: number;
};

export type DashboardChartPoint = {
  month: number;
  total: number;
  collected: number;
  uncollected: number;
};

export type DashboardChartData = {
  period: 'month' | 'year';
  year: number;
  month: number | null;
  pie: DashboardChartPoint;
  monthly: DashboardChartPoint[];
};

export type InstallmentRow = {
  id: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  bill_plan?: { bill_no: number; customer?: Customer };
};

export type BillPlan = {
  id: string;
  bill_no: number;
  principal_amount: number;
  installment_amount: number;
  total_installments: number;
  status: string;
  customer?: Customer;
  installments?: InstallmentRow[];
  bank_account?: { account_name: string; account_no: string; bank_name: string } | null;
};

export type BankAccount = {
  id: string;
  account_name: string;
  account_no: string;
  bank_name: string;
  is_default: boolean;
  is_active: boolean;
};

export type PaymentSubmission = {
  id: string;
  review_status: string;
  match_status: string;
  ocr_status: string;
  parsed_amount?: number | null;
  parsed_transfer_date?: string | null;
  customer?: Customer | null;
  matched_installment?: InstallmentRow | null;
};
