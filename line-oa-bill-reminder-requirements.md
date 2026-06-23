# Requirement Prompt: LINE OA Bill Reminder & Payment Matching System

## 0. Implementation Target

ต้องการพัฒนา Web Application และ Backend API สำหรับระบบ LINE OA ที่ใช้แจ้งเตือนลูกค้าเรื่องยอดชำระรายงวด, สร้างบิลตามรอบที่กำหนด, รับสลิปโอนเงินจากลูกค้า, OCR สลิป, ตรวจสอบยอดกับงวดในบิล และส่งข้อความสถานะกลับไปยังลูกค้าผ่าน LINE OA

Phase แรกให้โฟกัสที่:

- Backend API
- Database Schema
- Business Logic
- LINE Webhook
- Scheduler Jobs
- OCR Integration Abstraction
- Payment Matching Logic
- Admin API สำหรับจัดการลูกค้า, บิล, บัญชีรับโอน, การผูกสลิป และอนุมัติยอด

Frontend ใช้สำหรับหน้าจัดการ Admin โดยวางโครงให้พร้อม แต่ยังไม่จำเป็นต้อง implement ทุกหน้าครบใน Phase แรก

---

## 1. Project Overview

ระบบนี้เป็น LINE OA Bot สำหรับจัดการบิลรายงวด โดยมีความสามารถหลักดังนี้:

1. เพิ่มข้อมูลลูกค้า
2. ผูกลูกค้ากับ LINE OA ผ่าน `line_user_id`
3. สร้างบิลแบบกำหนดรอบเรียกเก็บได้ เช่น ทุก 3 วัน, 5 วัน, 7 วัน หรือ custom dates
4. Config ช่องทางการโอนเงินได้ ไม่ hardcode เลขบัญชีใน code
5. Generate ตารางงวดอัตโนมัติจากวันที่เริ่มต้น
6. ส่งข้อความแจ้งเตือนยอดชำระให้ลูกค้าทุกเช้า
7. ลูกค้าส่งสลิปกลับมาใน LINE OA
8. ระบบ OCR อ่านข้อมูลจากสลิป เช่น ยอดเงิน วันที่ เวลา ธนาคาร เลขอ้างอิง
9. ระบบพยายามจับคู่สลิปกับงวดในบิลอัตโนมัติ
10. หากยอด/วัน/ข้อมูลไม่ตรงหรือไม่มั่นใจ ให้ส่งเข้า queue ให้ admin ผูกกับงวดในบิลเอง
11. เมื่อชำระสำเร็จ ให้ update สถานะงวดเป็น paid และส่งข้อความกลับลูกค้าพร้อมเครื่องหมาย ✅ ในบิล
12. เก็บ log การส่งข้อความ, การรับสลิป, การ match, การ approve และ audit log ทุกครั้ง

---

## 2. Core Concepts

โครงสร้างหลักของระบบ:

```text
Customer
  -> Bill Plan
      -> Bill Installments
          -> Payment Submission
              -> Payment
  -> LINE Message Logs
  -> Audit Logs

Bank Account
  -> Bill Plan
```

ตัวอย่าง:

```text
ลูกค้า A มีบิล 1

ต้น 1000 ส่ง 490 ทุก 7 วัน 3 งวดจบ

ระบบต้อง generate งวดเป็น:

16 มิ.ย. 490
23 มิ.ย. 490
30 มิ.ย. 490
```

เมื่อถึงวันที่ 16 ระบบส่ง LINE แจ้งเตือนลูกค้าในตอนเช้า

เมื่อลูกค้าส่งสลิป 490 บาท วันที่ 16 ระบบ OCR แล้ว match กับงวดวันที่ 16

Phase แรกตั้งค่า default เป็น:

```text
OCR match ได้ -> auto_matched + pending_review
Admin approve -> paid
```

หลัง approve แล้ว บิลต้องแสดงเป็น:

```text
16✅ 490
23💸 490
30💸 490
```

---

## 3. Required Database Tables

ต้องออกแบบ Database รองรับ PostgreSQL และจัดการ schema ผ่าน Prisma

---

### 3.1 customers

ใช้เก็บข้อมูลลูกค้าและ LINE user id

Fields:

- id UUID primary key
- customer_code unique
- line_user_id unique nullable
- display_name
- phone
- status: active, blocked, closed
- consent_at
- created_at
- updated_at

Rules:

1. `customer_code` ต้อง unique
2. `line_user_id` ต้อง unique ถ้ามีค่า
3. ห้ามส่งข้อความหา customer ที่ยังไม่มี `line_user_id`
4. ลูกค้าที่ status ไม่ใช่ active ห้ามส่งแจ้งเตือนอัตโนมัติ

---

### 3.2 billing_cycle_presets

ใช้เก็บ preset รอบเรียกเก็บ เช่น ทุก 3 วัน, ทุก 5 วัน, ทุก 7 วัน

Fields:

- id UUID primary key
- name เช่น “ทุก 3 วัน”
- cycle_days integer
- is_active boolean
- created_at
- updated_at

Seed ค่าเริ่มต้น:

- ทุก 3 วัน = 3
- ทุก 5 วัน = 5
- ทุก 7 วัน = 7

Rules:

1. `cycle_days` ต้องมากกว่า 0
2. preset ที่ `is_active = false` ห้ามใช้สร้างบิลใหม่
3. ใช้ preset เพื่อช่วย frontend/admin เลือกง่าย แต่ bill_plan ต้องเก็บ `cycle_days` จริงไว้ด้วย

---

### 3.3 bank_accounts

ใช้เก็บบัญชีธนาคารสำหรับรับชำระเงิน

Fields:

- id UUID primary key
- account_name varchar
- account_no varchar
- bank_name varchar
- bank_code nullable
- branch_name nullable
- is_default boolean default false
- is_active boolean default true
- note text nullable
- created_at timestamp
- updated_at timestamp

Rules:

1. ต้องมีบัญชี default ได้เพียง 1 บัญชีต่อระบบใน Phase แรก
2. ถ้า `is_active = false` ห้ามนำบัญชีนี้ไปใช้กับบิลใหม่
3. หากไม่มีการเลือกบัญชีตอนสร้างบิล ให้ใช้บัญชีที่เป็น default
4. ต้องไม่ hardcode เลขบัญชีใน code หรือ message template
5. หากบัญชีถูก deactivate บิลเก่าที่ยังอ้างอิงบัญชีนี้ต้องยัง render ข้อมูลย้อนหลังได้
6. ห้าม deactivate บัญชี default จนกว่าจะมี default account อื่น

---

### 3.4 bill_plans

ใช้เก็บหัวบิล เช่น บิล 1, ต้น 1000, ส่ง 490, ทุก 7 วัน, 3 งวดจบ

Fields:

- id UUID primary key
- customer_id FK customers.id
- bank_account_id FK bank_accounts.id nullable
- bill_no integer
- principal_amount numeric
- installment_amount numeric
- cycle_type: interval_days, custom_dates
- cycle_days nullable
- total_installments integer
- start_date date
- status: active, completed, cancelled
- note text
- created_by nullable
- created_at
- updated_at

Rules:

1. ถ้า `cycle_type = interval_days` ต้องมี `cycle_days` และ `cycle_days > 0`
2. ถ้า `cycle_type = custom_dates` จะใช้วันที่จาก installment ที่ส่งมาเอง
3. `bill_plan` หนึ่งรายการมีหลาย `bill_installments`
4. ตอนสร้าง bill_plan ถ้า request ส่ง `bank_account_id` มา ให้ใช้บัญชีนั้น
5. ถ้าไม่ส่ง `bank_account_id` มา ให้ใช้บัญชี default
6. ถ้าบัญชีที่เลือกไม่ active ให้ reject request
7. เมื่อ render บิล ให้ดึงข้อมูลบัญชีจาก `bank_account_id` ของ bill_plan
8. บิลเดิมต้องเก็บ `bank_account_id` เดิมไว้ เพื่อให้ประวัติข้อความและช่องทางโอนย้อนหลังถูกต้อง
9. `bill_no` ไม่ควรซ้ำใน customer เดียวกัน ยกเว้น business config อนุญาต

---

### 3.5 bill_installments

ใช้เก็บงวดที่ต้องชำระจริง

Fields:

- id UUID primary key
- bill_plan_id FK bill_plans.id
- installment_no integer
- due_date date
- amount_due numeric
- amount_paid numeric default 0
- status: pending, partial_paid, paid, overdue, cancelled
- paid_at timestamp nullable
- paid_by_payment_id nullable
- morning_sent_at nullable
- before_deadline_sent_at nullable
- overdue_sent_at nullable
- created_at
- updated_at

Constraints:

- unique bill_plan_id + installment_no
- unique bill_plan_id + due_date

Rules:

1. `amount_due` ต้องมากกว่า 0
2. `amount_paid` ห้ามติดลบ
3. ถ้าชำระเต็ม amount_due ให้ status = paid
4. ถ้าชำระบางส่วน ให้ status = partial_paid
5. ถ้าเลย due_date แล้วยังไม่ paid ให้ job เปลี่ยนเป็น overdue
6. ใช้ `morning_sent_at`, `before_deadline_sent_at`, `overdue_sent_at` เพื่อกันส่งข้อความซ้ำ

---

### 3.6 payment_submissions

ใช้เก็บสลิปที่ลูกค้าส่งเข้ามาก่อนตรวจสอบ

Fields:

- id UUID primary key
- customer_id nullable FK customers.id
- line_user_id
- line_message_id
- image_url
- original_file_name
- image_hash nullable
- ocr_status: pending, processing, success, failed
- ocr_raw_text text
- parsed_amount numeric nullable
- parsed_transfer_date date nullable
- parsed_transfer_time time nullable
- parsed_bank_name nullable
- parsed_account_no nullable
- parsed_reference_no nullable
- match_status: unmatched, auto_matched, needs_admin_match, admin_matched, rejected
- matched_installment_id nullable FK bill_installments.id
- match_confidence numeric
- match_reason text
- review_status: pending_review, approved, rejected
- reviewed_by nullable
- reviewed_at nullable
- created_at
- updated_at

Important:

1. ห้ามนับ payment_submissions เป็นยอดจ่ายจริงจนกว่าจะ approve
2. ต้องกันสลิปซ้ำด้วย parsed_reference_no หรือ image_hash
3. ถ้า OCR อ่านไม่ได้ ให้ `ocr_status = failed` และ `match_status = needs_admin_match`
4. ถ้าไม่พบ customer จาก line_user_id ให้สร้าง submission ได้ แต่ต้องเป็น `needs_admin_match`
5. เก็บ raw OCR text ไว้ตรวจสอบย้อนหลัง

---

### 3.7 payments

ใช้เก็บยอดชำระจริงหลัง approve แล้ว

Fields:

- id UUID primary key
- customer_id FK customers.id
- payment_submission_id nullable FK payment_submissions.id
- bill_installment_id FK bill_installments.id
- amount numeric
- paid_at timestamp nullable
- payment_method default bank_transfer
- status: approved, cancelled
- approved_by nullable
- approved_at
- created_at

Rules:

1. เมื่อสร้าง payment ต้อง update bill_installments ใน transaction เดียวกัน
2. ถ้าชำระเต็ม amount_due ให้ installment.status = paid
3. ถ้าชำระไม่เต็ม ให้ installment.status = partial_paid
4. ถ้าจ่ายเกินหรือยอดไม่ตรง ให้ admin review ก่อน
5. ห้าม approve payment ถ้า installment ถูก paid ไปแล้ว
6. payment ที่ cancelled ต้องมี audit log

---

### 3.8 message_logs

ใช้เก็บ log ข้อความ LINE ที่ส่งออก

Fields:

- id UUID primary key
- customer_id nullable
- bill_plan_id nullable
- bill_installment_id nullable
- payment_submission_id nullable
- line_user_id
- message_type เช่น daily_reminder, before_deadline_reminder, payment_received, payment_need_admin, payment_approved, payment_rejected, overdue_reminder
- message_text
- line_response jsonb nullable
- status: sent, failed
- error_message nullable
- sent_at

Rules:

1. ทุก LINE push/reply ต้องบันทึก message_logs
2. ถ้าส่ง LINE failed ต้องบันทึก error_message
3. message_logs ใช้สำหรับตรวจสอบย้อนหลังและ retry failed messages

---

### 3.9 audit_logs

ใช้เก็บประวัติการกระทำที่สำคัญของระบบและ admin

Fields:

- id UUID primary key
- actor_id nullable
- actor_type: admin, system, line_user
- action เช่น create_customer, create_bill_plan, match_payment_submission, approve_payment, reject_payment, set_default_bank_account, deactivate_bank_account
- entity_type เช่น customer, bill_plan, payment_submission, payment, bank_account
- entity_id
- old_value jsonb nullable
- new_value jsonb nullable
- ip_address nullable
- user_agent nullable
- created_at timestamp

Rules:

1. ต้องเก็บ audit log ทุกครั้งที่ admin match, approve, reject payment
2. ต้องเก็บ audit log เมื่อแก้ bank account หรือเปลี่ยน default bank account
3. ต้องเก็บ audit log เมื่อแก้ไข bill_plan หรือ installment สำคัญ
4. ห้ามเก็บข้อมูลลับที่ไม่จำเป็นใน audit log

---

## 4. Required API Endpoints

---

### 4.1 Customer APIs

#### POST /api/customers

สร้างลูกค้า

Request:

```json
{
  "customer_code": "CUS0001",
  "display_name": "คุณเอ",
  "phone": "0800000000"
}
```

#### GET /api/customers

ดูลูกค้าทั้งหมด

Query params:

- search
- status
- page
- limit

#### GET /api/customers/{id}

ดูรายละเอียดลูกค้า

#### PATCH /api/customers/{id}

แก้ไขข้อมูลลูกค้า

#### POST /api/customers/link-line

ผูก customer กับ line_user_id

Request:

```json
{
  "customer_code": "CUS0001",
  "line_user_id": "Uxxxxxxxx"
}
```

Rules:

1. ถ้า line_user_id ถูกผูกกับ customer อื่นแล้ว ให้ reject
2. ถ้า customer_code ไม่พบ ให้ return NOT_FOUND
3. ต้องบันทึก audit log

---

### 4.2 Billing Cycle APIs

#### GET /api/billing-cycle-presets

ดึงรอบเรียกเก็บทั้งหมด เช่น 3 วัน, 5 วัน, 7 วัน

#### POST /api/billing-cycle-presets

เพิ่ม preset ใหม่

Request:

```json
{
  "name": "ทุก 10 วัน",
  "cycle_days": 10
}
```

#### PATCH /api/billing-cycle-presets/{id}

แก้ไข preset

---

### 4.3 Bank Account APIs

#### GET /api/bank-accounts

ดึงรายการบัญชีธนาคารทั้งหมด

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "bank-account-uuid",
      "account_name": "ชลดา พรมเมศ",
      "account_no": "2509480357",
      "bank_name": "ธนาคารกรุงศรีอยุธยา",
      "bank_code": "BAY",
      "is_default": true,
      "is_active": true
    }
  ],
  "message": "success"
}
```

#### POST /api/bank-accounts

สร้างบัญชีรับโอนใหม่

Request:

```json
{
  "account_name": "ชลดา พรมเมศ",
  "account_no": "2509480357",
  "bank_name": "ธนาคารกรุงศรีอยุธยา",
  "bank_code": "BAY",
  "is_default": true,
  "is_active": true
}
```

Rules:

1. ถ้า `is_default = true` ให้ระบบ unset default ของบัญชีอื่นอัตโนมัติ
2. ต้อง validate ว่า account_no ไม่ว่าง
3. ต้อง validate ว่า account_name ไม่ว่าง
4. ต้อง validate ว่า bank_name ไม่ว่าง
5. ต้องบันทึก audit log

#### PATCH /api/bank-accounts/{id}

แก้ไขข้อมูลบัญชีรับโอน

Request example:

```json
{
  "account_name": "ชลดา พรมเมศ",
  "account_no": "2509480357",
  "bank_name": "ธนาคารกรุงศรีอยุธยา",
  "is_default": true,
  "is_active": true
}
```

#### PATCH /api/bank-accounts/{id}/set-default

ตั้งบัญชีนี้เป็นบัญชี default

Logic:

1. Set `is_default = false` ให้ทุกบัญชีอื่น
2. Set `is_default = true` ให้บัญชีนี้
3. บัญชีที่จะตั้ง default ต้อง `is_active = true`
4. ต้องทำใน transaction
5. ต้องบันทึก audit log

#### PATCH /api/bank-accounts/{id}/deactivate

ปิดใช้งานบัญชี

Rules:

1. ถ้าบัญชีนี้เป็น default ห้าม deactivate จนกว่าจะมี default account อื่น
2. บิลเก่าที่ยังอ้างอิงบัญชีนี้ยังต้องแสดงข้อมูลย้อนหลังได้
3. บิลใหม่ห้ามเลือกบัญชีที่ inactive
4. ต้องบันทึก audit log

---

### 4.4 Bill Plan APIs

#### POST /api/bill-plans

สร้างบิลแบบรอบทุก X วัน และ generate installments อัตโนมัติ

Request:

```json
{
  "customer_id": "customer-uuid",
  "bill_no": 1,
  "principal_amount": 1000,
  "installment_amount": 490,
  "cycle_type": "interval_days",
  "cycle_days": 7,
  "total_installments": 3,
  "start_date": "2026-06-16",
  "bank_account_id": "bank-account-uuid",
  "note": "ต้น 1000 ส่ง 490 ทุก 7 วัน 3 งวดจบ"
}
```

ถ้าไม่ส่ง `bank_account_id`:

```text
ใช้ bank_accounts ที่ is_default = true และ is_active = true
```

Response ต้องมี installments ที่ generate แล้ว:

```json
{
  "success": true,
  "data": {
    "id": "bill-plan-uuid",
    "status": "active",
    "installments": [
      {
        "installment_no": 1,
        "due_date": "2026-06-16",
        "amount_due": 490
      },
      {
        "installment_no": 2,
        "due_date": "2026-06-23",
        "amount_due": 490
      },
      {
        "installment_no": 3,
        "due_date": "2026-06-30",
        "amount_due": 490
      }
    ]
  },
  "message": "success"
}
```

#### POST /api/bill-plans/custom-dates

สร้างบิลแบบกำหนดวันเอง

Request:

```json
{
  "customer_id": "customer-uuid",
  "bill_no": 2,
  "principal_amount": 2000,
  "cycle_type": "custom_dates",
  "bank_account_id": "bank-account-uuid",
  "installments": [
    {
      "installment_no": 1,
      "due_date": "2026-06-16",
      "amount_due": 700
    },
    {
      "installment_no": 2,
      "due_date": "2026-06-21",
      "amount_due": 700
    },
    {
      "installment_no": 3,
      "due_date": "2026-06-30",
      "amount_due": 700
    }
  ]
}
```

#### GET /api/customers/{customer_id}/bill-plans

ดูบิลทั้งหมดของลูกค้า

#### GET /api/bill-plans/{id}

ดูรายละเอียดบิลพร้อม installments และ bank account

#### PATCH /api/bill-plans/{id}/cancel

ยกเลิกบิล

Rules:

1. ต้อง update status ของ bill_plan เป็น cancelled
2. ต้องยกเลิก installments ที่ยังไม่ paid
3. ต้องบันทึก audit log

---

### 4.5 Installment APIs

#### GET /api/installments/due-today

ดูงวดที่ครบกำหนดวันนี้

#### GET /api/installments/overdue

ดูงวดที่ค้างชำระ

#### PATCH /api/installments/{id}

แก้ไขงวด เช่น amount, due_date, status

Rules:

1. ถ้างวด paid แล้ว ห้ามแก้ amount_due หรือ due_date ยกเว้นมี permission พิเศษในอนาคต
2. ต้องบันทึก audit log เมื่อแก้ไข

---

### 4.6 LINE Webhook API

#### POST /api/line/webhook

ใช้รับ event จาก LINE OA

ต้องรองรับ event อย่างน้อย:

1. ลูกค้า add friend
2. ลูกค้าส่งข้อความ
3. ลูกค้าส่งรูปภาพสลิป
4. ลูกค้ากด rich menu หรือ postback ในอนาคต

Logic เมื่อลูกค้าส่งรูป:

1. รับ webhook event จาก LINE
2. ตรวจสอบ signature
3. ดึง line_user_id จาก event.source.userId
4. หา customer จาก line_user_id
5. ดาวน์โหลด image content จาก LINE message id
6. อัปโหลดรูปไป storage
7. สร้าง payment_submissions
8. เรียก OCR service
9. Parse amount, transfer_date, transfer_time, bank_name, reference_no
10. Run payment matching logic
11. ถ้า match ชัดเจน ให้ `auto_matched + pending_review` ตาม default policy
12. ถ้าไม่ชัดเจน ให้ `needs_admin_match`
13. ส่งข้อความตอบกลับลูกค้า
14. บันทึก message_logs

---

### 4.7 Job APIs

#### POST /api/jobs/send-daily-bill-reminders

ส่งแจ้งเตือนบิลทุกเช้า

Logic:

- หา bill_installments ที่ due_date = today
- status in pending, partial_paid
- customer.status = active
- customer.line_user_id is not null
- morning_sent_at is null
- ส่ง LINE push message
- update morning_sent_at
- insert message_logs

#### POST /api/jobs/send-before-deadline-reminders

ส่งเตือนก่อนครบเวลา เช่น 16:00 หรือก่อน 17:00

#### POST /api/jobs/mark-overdue

เปลี่ยนสถานะงวดที่เลย due date แล้วยังไม่ paid เป็น overdue

#### POST /api/jobs/retry-failed-line-messages

Retry ข้อความ LINE ที่ส่ง failed

Rules:

1. ทุก job ต้อง idempotent
2. ถ้าเคยส่งแล้ว ห้ามส่งซ้ำ
3. ถ้า LINE ส่ง failed ให้เก็บ log แต่ไม่ทำให้ทั้ง job ล้ม
4. Job endpoint ต้องมี authentication เช่น internal API key

---

### 4.8 Payment Submission Admin APIs

#### GET /api/admin/payment-submissions

ดูสลิปทั้งหมด พร้อม filter ได้

Query params:

- match_status
- review_status
- customer_id
- date_from
- date_to
- page
- limit

#### GET /api/admin/payment-submissions/{id}

ดูรายละเอียดสลิป, OCR result, candidate installments

Response ควรมี:

- payment_submission
- customer
- OCR parsed data
- slip image_url
- matched_installment
- candidate_installments
- audit_logs ที่เกี่ยวข้อง

#### PATCH /api/admin/payment-submissions/{id}/match-installment

ให้ admin ผูกสลิปกับงวดเอง

Request:

```json
{
  "bill_installment_id": "installment-uuid",
  "note": "ผูกกับงวดวันที่ 23 ตามที่ลูกค้าแจ้ง"
}
```

Logic:

1. update matched_installment_id
2. match_status = admin_matched
3. match_reason = admin note
4. review_status ยังเป็น pending_review จนกว่า admin approve
5. บันทึก audit log

#### POST /api/admin/payment-submissions/{id}/approve

อนุมัติสลิปและสร้าง payment จริง

Logic ต้องใช้ database transaction:

1. ตรวจว่า payment_submission มี matched_installment_id
2. ตรวจว่างวดยังไม่ paid
3. ตรวจว่า reference_no หรือ image_hash ไม่ซ้ำ
4. insert payments
5. update bill_installments amount_paid, status, paid_at, paid_by_payment_id
6. update payment_submissions review_status = approved
7. ถ้าทุกงวดใน bill_plan paid แล้ว ให้ update bill_plan.status = completed
8. ส่ง LINE message ให้ลูกค้าพร้อมบิลล่าสุดที่มี ✅
9. insert message_logs
10. insert audit_logs

#### POST /api/admin/payment-submissions/{id}/reject

ปฏิเสธสลิป

Request:

```json
{
  "reason": "ยอดเงินไม่ตรงกับบิล"
}
```

Logic:

1. payment_submissions.review_status = rejected
2. match_status = rejected
3. ส่งข้อความแจ้งลูกค้า
4. insert message_logs
5. insert audit_logs

---

## 5. Bill Generation Logic

สำหรับ cycle_type = interval_days:

Input:

- start_date
- cycle_days
- total_installments
- installment_amount

Generate:

```text
due_date ของงวดที่ n = start_date + cycle_days * (n - 1)
```

Example:

```text
start_date = 2026-06-16
cycle_days = 7
total_installments = 3
installment_amount = 490
```

Output:

```text
1. 2026-06-16 = 490
2. 2026-06-23 = 490
3. 2026-06-30 = 490
```

ต้อง validate:

- cycle_days > 0
- total_installments > 0
- installment_amount > 0
- start_date required
- customer must exist
- bank account must exist and active
- bill_no should not duplicate for same customer unless allowed by business config

---

## 6. OCR & Payment Matching Logic

เมื่อ OCR อ่านสลิปแล้ว ต้อง parse ข้อมูล:

- amount
- transfer_date
- transfer_time
- bank_name
- account_no
- reference_no
- raw_text

### 6.1 OCR Service Abstraction

ต้องออกแบบ `OcrService` เป็น abstraction เพื่อให้เปลี่ยน provider ได้ง่าย

ตัวอย่าง provider ที่อาจใช้ในอนาคต:

- Google Vision
- AWS Textract
- Azure Document Intelligence
- Slip verification API
- Manual OCR fallback

Interface ที่ควรมี:

```ts
type OcrResult = {
  rawText: string
  amount?: number
  transferDate?: string
  transferTime?: string
  bankName?: string
  accountNo?: string
  referenceNo?: string
  confidence?: number
}

interface OcrService {
  parseSlip(imageUrl: string): Promise<OcrResult>
}
```

Phase แรกสามารถทำ mock OCR provider สำหรับ dev/test ได้ก่อน แต่ service layer ต้องเปลี่ยน provider ได้โดยไม่กระทบ business logic

---

### 6.2 Auto Match Rule

Auto match ได้เมื่อ:

1. customer เจอจาก line_user_id
2. parsed_amount ตรงกับ amount_due
3. parsed_transfer_date ตรงกับ due_date
4. งวดนั้นยังไม่ paid
5. reference_no หรือ image_hash ยังไม่เคยใช้
6. confidence สูงพอ

Scoring example:

- amount_match = +50
- date_match = +40
- due_today = +10
- reference_unique = +10
- same_customer = required

Suggested thresholds:

- score >= 90 = auto_matched
- score 70-89 = needs_admin_match หรือ admin confirm
- score < 70 = unmatched / needs_admin_match

### 6.3 Auto Approve Policy

Phase แรกให้ตั้งค่า default:

```env
PAYMENT_AUTO_APPROVE_ENABLED=false
```

Default behavior:

```text
OCR match ได้ -> auto_matched + pending_review
Admin approve -> paid
```

ถ้าอนาคตเปิด auto approve:

```env
PAYMENT_AUTO_APPROVE_ENABLED=true
```

ให้ approve อัตโนมัติได้เฉพาะเมื่อ:

1. match score >= 90
2. parsed_amount = amount_due
3. parsed_transfer_date = due_date
4. reference_no ไม่ซ้ำ
5. image_hash ไม่ซ้ำ
6. matched installment ยังไม่ paid
7. customer status = active

แต่ Phase แรกไม่ควรเปิด auto approve เป็น default

### 6.4 Cases That Need Admin Match

กรณีที่ต้องให้ admin ผูกเอง:

1. OCR อ่านวันที่ไม่ได้
2. OCR อ่านยอดไม่ได้
3. ยอดไม่ตรงกับ amount_due
4. วันที่โอนไม่ตรงกับ due_date
5. ลูกค้าส่งยอดไม่ตรงกับวันที่ปัจจุบัน
6. มีหลายงวดที่ยอดเท่ากันและระบบไม่มั่นใจ
7. reference_no ซ้ำ
8. ลูกค้าไม่มี line_user_id ที่ผูกกับ customer
9. งวดที่ match ได้ถูกจ่ายแล้ว
10. สลิปเป็นรูปไม่ชัดหรือ OCR confidence ต่ำ

เมื่อ needs_admin_match:

- เก็บ submission ไว้
- ส่งข้อความกลับลูกค้าว่าได้รับสลิปแล้ว กำลังตรวจสอบ
- admin จะเลือก bill_installment_id เอง
- หลัง admin approve จึงสร้าง payment และ update installment

---

## 7. Storage Requirement

ระบบต้องเก็บรูปสลิปที่ลูกค้าส่งเข้ามา

### 7.1 Development Storage

สำหรับ development สามารถใช้ local storage ได้ เช่น:

```text
storage/slips/{yyyy}/{mm}/{submission_id}.jpg
```

### 7.2 Production Storage

สำหรับ production ต้องรองรับ S3-compatible storage เช่น:

- AWS S3
- Cloudflare R2
- MinIO
- DigitalOcean Spaces

### 7.3 Required Fields

ใน `payment_submissions` ต้องเก็บ:

- image_url
- original_file_name
- image_hash

### 7.4 Storage Rules

1. ต้องสร้าง image_hash เพื่อกันการส่งสลิปซ้ำ
2. ต้องจำกัด file type เฉพาะ image ที่รองรับ เช่น jpg, jpeg, png, webp
3. ต้องจำกัด file size ตาม config
4. ห้าม expose private storage URL โดยตรงถ้า production ต้องใช้ signed URL หรือ proxy endpoint
5. ต้องเก็บรูปสลิปให้ปลอดภัย เพราะเป็นข้อมูลส่วนบุคคล/ข้อมูลทางการเงิน

---

## 8. LINE Message Templates

ต้องมี message renderer สำหรับสร้างข้อความ LINE

### 8.1 Daily Reminder Message

Format:

```text
💸💸 วันนี้มีชำระยอดประจำงวดวันที่ 1️⃣6️⃣ มิถุนายน 6️⃣9️⃣ นะคะ 💸💸

กรุณาชำระภายในเวลา 17.00 น.

หากชำระแล้ว สามารถส่งสลิปกลับมาในแชทนี้ได้เลยค่ะ 🙏
```

### 8.2 Bill Text Message

ข้อความบิลต้องดึงข้อมูลบัญชีจาก database ห้าม hardcode เลขบัญชี

Format:

```text
บิล 1️⃣

ต้น 1,000 ส่ง 490 ทุก 7 วัน 3 งวดจบ

16💸 490
23💸 490
30💸 490

จบ 🙏

💸 ช่องทางการโอนเงิน 💸

เลขที่บัญชี {account_no}
{bank_name}
ชื่อบัญชี {account_name}

‼️ กรุณาชำระภายในเวลา 17.00 น. หากเกินกำหนด อาจมีค่าปรับ/เงื่อนไขเพิ่มเติมตามข้อตกลงค่ะ 📌
```

ตัวอย่างผลลัพธ์:

```text
บิล 1️⃣

ต้น 1,000 ส่ง 490 ทุก 7 วัน 3 งวดจบ

16💸 490
23💸 490
30💸 490

จบ 🙏

💸 ช่องทางการโอนเงิน 💸

เลขที่บัญชี 2509480357
ธนาคารกรุงศรีอยุธยา
ชื่อบัญชี ชลดา พรมเมศ

‼️ กรุณาชำระภายในเวลา 17.00 น. หากเกินกำหนด อาจมีค่าปรับ/เงื่อนไขเพิ่มเติมตามข้อตกลงค่ะ 📌
```

### 8.3 Payment Received Message

กรณีได้รับสลิปแล้วแต่ยังรอตรวจ:

```text
📌 ได้รับสลิปแล้วค่ะ

ระบบกำลังตรวจสอบยอดชำระ
หากตรวจสอบเรียบร้อยแล้ว จะแจ้งสถานะกลับทางแชทนี้ค่ะ 🙏
```

### 8.4 Payment Needs Admin Match Message

กรณี OCR หรือ match ไม่มั่นใจ:

```text
📌 ได้รับสลิปแล้วค่ะ

ระบบยังไม่สามารถจับคู่ยอดกับงวดในบิลได้อัตโนมัติ
แอดมินจะตรวจสอบและอัปเดตสถานะให้ค่ะ 🙏
```

### 8.5 Payment Approved Message

กรณี approve แล้ว:

```text
✅ รับยอดชำระเรียบร้อยค่ะ

บิล 1️⃣
งวดวันที่ 1️⃣6️⃣ มิถุนายน 6️⃣9️⃣
ยอดชำระ 490 บาท

สถานะบิลล่าสุด

16✅ 490
23💸 490
30💸 490

ขอบคุณค่ะ 🙏
```

### 8.6 Payment Rejected Message

กรณีสลิปถูกปฏิเสธ:

```text
ขออภัยค่ะ สลิปที่ส่งมายังไม่สามารถยืนยันยอดได้

เหตุผล: {reason}

กรุณาตรวจสอบและส่งสลิปใหม่อีกครั้งค่ะ 🙏
```

---

## 9. Emoji Number Formatter

ต้องมี utility แปลงเลขเป็น emoji number

Mapping:

```text
0 -> 0️⃣
1 -> 1️⃣
2 -> 2️⃣
3 -> 3️⃣
4 -> 4️⃣
5 -> 5️⃣
6 -> 6️⃣
7 -> 7️⃣
8 -> 8️⃣
9 -> 9️⃣
```

ใช้กับ:

- เลขวันที่
- เลขปี พ.ศ. แบบ 2 หลัก
- เลขบิล

ตัวอย่าง:

```text
16 มิถุนายน 69
```

ต้อง render เป็น:

```text
1️⃣6️⃣ มิถุนายน 6️⃣9️⃣
```

---

## 10. Status Flow

### 10.1 Bill Installment Status

```text
pending
  -> partial_paid
  -> paid

pending
  -> overdue
  -> paid

pending
  -> cancelled
```

### 10.2 Payment Submission Status

```text
created
  -> ocr_processing
  -> ocr_success
  -> auto_matched
  -> pending_review
  -> approved
```

```text
created
  -> ocr_success
  -> needs_admin_match
  -> admin_matched
  -> pending_review
  -> approved
```

```text
created
  -> ocr_failed
  -> needs_admin_match
  -> admin_matched
  -> pending_review
  -> approved
```

```text
created
  -> rejected
```

---

## 11. Security, Compliance & Safety Requirements

1. ต้อง verify LINE webhook signature ทุกครั้ง
2. ห้าม trust ข้อมูลจาก OCR 100%
3. ต้องมี admin review ในกรณี match ไม่มั่นใจ
4. Phase แรก default เป็น `PAYMENT_AUTO_APPROVE_ENABLED=false`
5. ต้องกันสลิปซ้ำด้วย reference_no หรือ image_hash
6. ต้องใช้ transaction ตอน approve payment
7. ต้องเก็บ audit log ทุกครั้งที่ admin match, approve, reject
8. ต้องเก็บ message_logs ทุกครั้งที่ส่ง LINE
9. ต้องเก็บข้อมูลส่วนบุคคลอย่างระมัดระวัง เช่น line_user_id, เบอร์โทร, สลิป, ยอดชำระ
10. ข้อความทวงถามต้องใช้ถ้อยคำสุภาพ ไม่ข่มขู่ ไม่เปิดเผยข้อมูลให้บุคคลอื่น
11. ห้ามส่งข้อความหาลูกค้าหากไม่มี line_user_id หรือยังไม่ได้ผูกบัญชี
12. ต้องรองรับ timezone Asia/Bangkok
13. วันที่ในระบบต้องแยกชัดเจนระหว่าง due_date, transfer_date, paid_at และ created_at
14. Admin API ต้องมี authentication
15. Internal job endpoint ต้องมี authentication เช่น internal API key
16. ห้าม log secret เช่น LINE channel access token, database password, OCR API key

---

## 12. Authentication Requirement

แม้ Phase แรกยังไม่ทำระบบ login admin เต็มรูปแบบ แต่ Admin API และ Job API ต้องมี authentication ตั้งแต่แรก

### 12.1 Admin API

Endpoints ที่ขึ้นต้นด้วย `/api/admin/*` ต้องมี auth middleware

Phase แรกใช้ได้อย่างใดอย่างหนึ่ง:

- JWT mock
- Admin API key
- Basic internal admin token

Environment variable:

```env
ADMIN_API_KEY=change-me
```

### 12.2 Job API

Endpoints ที่ขึ้นต้นด้วย `/api/jobs/*` ต้องมี internal auth middleware

Environment variable:

```env
INTERNAL_JOB_API_KEY=change-me
```

### 12.3 Public Webhook

`POST /api/line/webhook` ไม่ใช้ ADMIN_API_KEY แต่ต้อง verify LINE signature ทุก request

---

## 13. Scheduler Requirements

ต้องมี scheduler หรือ job endpoint สำหรับเรียกจาก cron

Recommended jobs:

1. Daily reminder job  
   เวลา 08:00 Asia/Bangkok

2. Before deadline reminder job  
   เวลา 16:00 Asia/Bangkok

3. Mark overdue job  
   เวลา 17:05 หรือหลังเวลาปิดรับชำระ

4. Retry failed LINE messages  
   ใช้สำหรับข้อความที่ส่งไม่สำเร็จ

ทุก job ต้อง idempotent:

- ถ้าเคยส่งแล้ว ไม่ส่งซ้ำ
- ใช้ morning_sent_at, before_deadline_sent_at, overdue_sent_at เป็นตัวกันซ้ำ
- ถ้า LINE ส่ง failed ให้เก็บ log แต่ไม่ทำให้ทั้ง job ล้ม
- job endpoint ต้องมี internal auth

---

## 14. Required Business Rules

1. ลูกค้าหนึ่งคนมีได้หลาย bill_plans
2. bill_plan หนึ่งรายการมีหลาย installments
3. bill_plan ต้องผูก bank_account_id หรือใช้ default bank account
4. installment หนึ่งงวดควรมี payment approved ได้หลัก ๆ หนึ่งรายการ เว้นแต่รองรับ partial payment
5. สลิปหนึ่งใบต้องไม่ถูกใช้ซ้ำกับหลายงวด
6. ถ้าลูกค้าส่งยอดตรงกับวันปัจจุบันและยอดตรงกับงวด ให้ auto match ได้
7. Phase แรก auto match แล้วต้องรอ admin approve
8. ถ้าลูกค้าส่งยอดแต่วันที่ในสลิปไม่ตรงกับ due_date ให้ส่งเข้า admin match
9. ถ้า OCR อ่านไม่ได้ ให้ส่งเข้า admin match
10. ถ้าสลิปถูก approve แล้ว ต้อง render บิลล่าสุดกลับไปให้ลูกค้าพร้อม ✅
11. ถ้างวดทุกงวดใน bill_plan เป็น paid แล้ว ให้ bill_plan.status = completed
12. ถ้าบิล completed แล้ว ข้อความท้ายบิลควรแสดง “จบแล้ว ✅”
13. ถ้ายังไม่ครบทุกงวด ให้แสดง “ยังไม่จบค่ะ 🙏”
14. บัญชี inactive ห้ามใช้กับบิลใหม่
15. บิลเก่าที่ผูกกับบัญชีเดิมยังต้อง render ข้อมูลบัญชีเดิมได้

---

## 15. API Response Style

ทุก API ควร response เป็น JSON format เดียวกัน

Success:

```json
{
  "success": true,
  "data": {},
  "message": "success"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "cycle_days is required"
  }
}
```

Common error codes:

- VALIDATION_ERROR
- NOT_FOUND
- DUPLICATE_SLIP
- INSTALLMENT_ALREADY_PAID
- BANK_ACCOUNT_NOT_FOUND
- BANK_ACCOUNT_INACTIVE
- DEFAULT_BANK_ACCOUNT_REQUIRED
- LINE_PUSH_FAILED
- OCR_FAILED
- UNAUTHORIZED
- FORBIDDEN
- INTERNAL_ERROR

---

## 16. Suggested Implementation Stack & Structure

ระบบนี้ให้พัฒนาโดยใช้ Stack ดังนี้:

### 16.1 Frontend

ใช้สำหรับหน้าจัดการของ Admin

- React
- Vite
- TypeScript
- shadcn/ui
- Tailwind CSS
- React Hook Form
- Zod สำหรับ validation
- TanStack Query สำหรับเรียก API และจัดการ server state

Frontend ต้องรองรับหน้าจัดการหลักในอนาคต เช่น:

1. หน้าจัดการลูกค้า
2. หน้าผูกลูกค้ากับ LINE user id
3. หน้าจัดการบัญชีรับโอน
4. หน้าสร้างบิล
5. หน้าดูตารางงวด
6. หน้ารายการสลิปที่รอตรวจสอบ
7. หน้า admin manual match สลิปกับงวด
8. หน้า approve/reject payment
9. หน้า dashboard ยอดที่ครบกำหนดวันนี้
10. หน้า overdue list
11. หน้า message/payment/audit logs

Phase ปัจจุบันยังไม่ต้อง implement frontend ให้ครบ แต่ Backend API ต้องออกแบบให้ frontend ชุดนี้เรียกใช้งานได้ง่าย

---

### 16.2 Backend

ใช้สำหรับ API, LINE webhook, scheduler job, OCR integration, payment matching และ payment approval logic

Backend stack:

- Bun runtime
- Elysia framework
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod หรือ Elysia schema validation
- LINE Messaging API integration
- OCR service integration
- Cron/job runner สำหรับ daily reminder และ overdue jobs

Backend ควรแยก service layer ชัดเจน เช่น:

1. CustomerService
2. BillingCyclePresetService
3. BankAccountService
4. BillPlanService
5. InstallmentService
6. LineWebhookService
7. LineMessagingService
8. OcrService
9. SlipParserService
10. PaymentSubmissionService
11. PaymentMatchingService
12. PaymentApprovalService
13. MessageRendererService
14. SchedulerJobService
15. MessageLogService
16. AuditLogService
17. StorageService
18. AuthService

---

### 16.3 Database

ใช้ PostgreSQL และจัดการ schema ผ่าน Prisma

ต้องมี Prisma models อย่างน้อย:

1. Customer
2. BillingCyclePreset
3. BankAccount
4. BillPlan
5. BillInstallment
6. PaymentSubmission
7. Payment
8. MessageLog
9. AuditLog

ควรใช้ Prisma migration สำหรับ version control ของ database schema

---

### 16.4 Project Structure Suggestion

โครงสร้าง Backend แนะนำ:

```text
backend/
  prisma/
    schema.prisma
    migrations/
    seed.ts

  src/
    app.ts
    env.ts

    modules/
      customers/
        customer.routes.ts
        customer.service.ts
        customer.schema.ts

      billing-cycle-presets/
        billing-cycle-preset.routes.ts
        billing-cycle-preset.service.ts
        billing-cycle-preset.schema.ts

      bank-accounts/
        bank-account.routes.ts
        bank-account.service.ts
        bank-account.schema.ts

      bill-plans/
        bill-plan.routes.ts
        bill-plan.service.ts
        bill-plan.schema.ts

      installments/
        installment.routes.ts
        installment.service.ts
        installment.schema.ts

      line/
        line.routes.ts
        line-webhook.service.ts
        line-messaging.service.ts
        line-signature.service.ts

      ocr/
        ocr.service.ts
        slip-parser.service.ts
        mock-ocr.provider.ts

      payments/
        payment-submission.routes.ts
        payment-submission.service.ts
        payment-matching.service.ts
        payment-approval.service.ts

      jobs/
        scheduler.routes.ts
        daily-reminder.job.ts
        before-deadline-reminder.job.ts
        mark-overdue.job.ts
        retry-failed-line-messages.job.ts

      messages/
        message-renderer.service.ts
        message-log.service.ts

      audit-logs/
        audit-log.service.ts

      storage/
        storage.service.ts
        local-storage.provider.ts
        s3-storage.provider.ts

      auth/
        admin-auth.middleware.ts
        internal-job-auth.middleware.ts

    lib/
      prisma.ts
      line.ts
      date.ts
      emoji-number.ts
      errors.ts
      response.ts
      hash.ts
```

โครงสร้าง Frontend แนะนำ:

```text
frontend/
  src/
    main.tsx
    App.tsx

    app/
      routes/

    components/
      ui/
      layout/
      forms/

    features/
      customers/
      bank-accounts/
      bill-plans/
      installments/
      payment-submissions/
      dashboard/
      logs/

    lib/
      api.ts
      query-client.ts
      utils.ts

    schemas/
      customer.schema.ts
      bank-account.schema.ts
      bill-plan.schema.ts
      payment-submission.schema.ts
```

---

### 16.5 Required Tests

ควรเขียน unit test และ integration test สำหรับ logic สำคัญ:

1. generateInstallments
2. toEmojiNumber
3. renderBillStatus
4. renderBill with bank account from database
5. payment matching score
6. approve payment transaction
7. duplicate slip detection
8. due today query
9. LINE webhook signature validation
10. OCR failed fallback to needs_admin_match
11. bill_plan completed เมื่อทุกงวด paid แล้ว
12. default bank account selection
13. inactive bank account cannot be used in new bill
14. admin auth middleware
15. internal job auth middleware

---

## 17. Prisma Model Draft

> หมายเหตุ: Model นี้เป็น draft สำหรับเริ่มต้น อาจปรับ enum/type/relations เพิ่มตาม implementation จริง

```prisma
model Customer {
  id           String    @id @default(uuid())
  customerCode String   @unique @map("customer_code")
  lineUserId   String?  @unique @map("line_user_id")
  displayName  String?  @map("display_name")
  phone        String?
  status       String   @default("active")
  consentAt    DateTime? @map("consent_at")

  billPlans    BillPlan[]
  payments     Payment[]
  submissions  PaymentSubmission[]
  messageLogs  MessageLog[]

  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("customers")
}

model BillingCyclePreset {
  id        String   @id @default(uuid())
  name      String
  cycleDays Int      @map("cycle_days")
  isActive  Boolean  @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("billing_cycle_presets")
}

model BankAccount {
  id          String   @id @default(uuid())
  accountName String  @map("account_name")
  accountNo   String  @map("account_no")
  bankName    String  @map("bank_name")
  bankCode    String? @map("bank_code")
  branchName  String? @map("branch_name")
  isDefault   Boolean @default(false) @map("is_default")
  isActive    Boolean @default(true) @map("is_active")
  note        String?

  billPlans   BillPlan[]

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("bank_accounts")
}

model BillPlan {
  id                String @id @default(uuid())
  customerId        String @map("customer_id")
  bankAccountId     String? @map("bank_account_id")

  billNo            Int @map("bill_no")
  principalAmount   Decimal @map("principal_amount")
  installmentAmount Decimal @map("installment_amount")
  cycleType         String @default("interval_days") @map("cycle_type")
  cycleDays         Int? @map("cycle_days")
  totalInstallments Int @map("total_installments")
  startDate         DateTime @map("start_date")
  status            String @default("active")
  note              String?
  createdBy         String? @map("created_by")

  customer          Customer @relation(fields: [customerId], references: [id])
  bankAccount       BankAccount? @relation(fields: [bankAccountId], references: [id])
  installments      BillInstallment[]
  messageLogs       MessageLog[]

  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@unique([customerId, billNo])
  @@map("bill_plans")
}

model BillInstallment {
  id                 String @id @default(uuid())
  billPlanId         String @map("bill_plan_id")
  installmentNo      Int @map("installment_no")
  dueDate            DateTime @map("due_date")
  amountDue          Decimal @map("amount_due")
  amountPaid         Decimal @default(0) @map("amount_paid")
  status             String @default("pending")

  paidAt             DateTime? @map("paid_at")
  paidByPaymentId    String? @map("paid_by_payment_id")

  morningSentAt      DateTime? @map("morning_sent_at")
  beforeDeadlineSentAt DateTime? @map("before_deadline_sent_at")
  overdueSentAt      DateTime? @map("overdue_sent_at")

  billPlan           BillPlan @relation(fields: [billPlanId], references: [id], onDelete: Cascade)
  payments           Payment[]
  submissions        PaymentSubmission[]
  messageLogs        MessageLog[]

  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@unique([billPlanId, installmentNo])
  @@unique([billPlanId, dueDate])
  @@map("bill_installments")
}

model PaymentSubmission {
  id                 String @id @default(uuid())

  customerId          String? @map("customer_id")
  lineUserId          String? @map("line_user_id")
  lineMessageId       String? @map("line_message_id")

  imageUrl            String? @map("image_url")
  originalFileName    String? @map("original_file_name")
  imageHash           String? @map("image_hash")

  ocrStatus           String @default("pending") @map("ocr_status")
  ocrRawText          String? @map("ocr_raw_text")

  parsedAmount        Decimal? @map("parsed_amount")
  parsedTransferDate  DateTime? @map("parsed_transfer_date")
  parsedTransferTime  String? @map("parsed_transfer_time")
  parsedBankName      String? @map("parsed_bank_name")
  parsedAccountNo     String? @map("parsed_account_no")
  parsedReferenceNo   String? @map("parsed_reference_no")

  matchStatus         String @default("unmatched") @map("match_status")
  matchedInstallmentId String? @map("matched_installment_id")
  matchConfidence     Decimal? @map("match_confidence")
  matchReason         String? @map("match_reason")

  reviewStatus        String @default("pending_review") @map("review_status")
  reviewedBy          String? @map("reviewed_by")
  reviewedAt          DateTime? @map("reviewed_at")

  customer            Customer? @relation(fields: [customerId], references: [id])
  matchedInstallment  BillInstallment? @relation(fields: [matchedInstallmentId], references: [id])
  payment             Payment?
  messageLogs         MessageLog[]

  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@index([lineUserId])
  @@index([parsedReferenceNo])
  @@index([imageHash])
  @@map("payment_submissions")
}

model Payment {
  id                  String @id @default(uuid())

  customerId           String @map("customer_id")
  paymentSubmissionId  String? @unique @map("payment_submission_id")
  billInstallmentId    String @map("bill_installment_id")

  amount               Decimal
  paidAt               DateTime? @map("paid_at")
  paymentMethod        String @default("bank_transfer") @map("payment_method")
  status               String @default("approved")

  approvedBy           String? @map("approved_by")
  approvedAt           DateTime @default(now()) @map("approved_at")

  customer             Customer @relation(fields: [customerId], references: [id])
  paymentSubmission    PaymentSubmission? @relation(fields: [paymentSubmissionId], references: [id])
  billInstallment      BillInstallment @relation(fields: [billInstallmentId], references: [id])

  createdAt            DateTime @default(now()) @map("created_at")

  @@map("payments")
}

model MessageLog {
  id                  String @id @default(uuid())

  customerId           String? @map("customer_id")
  billPlanId           String? @map("bill_plan_id")
  billInstallmentId    String? @map("bill_installment_id")
  paymentSubmissionId  String? @map("payment_submission_id")

  lineUserId           String? @map("line_user_id")
  messageType          String @map("message_type")
  messageText          String? @map("message_text")
  lineResponse         Json? @map("line_response")
  status               String @default("sent")
  errorMessage         String? @map("error_message")
  sentAt               DateTime @default(now()) @map("sent_at")

  customer             Customer? @relation(fields: [customerId], references: [id])
  billPlan             BillPlan? @relation(fields: [billPlanId], references: [id])
  billInstallment      BillInstallment? @relation(fields: [billInstallmentId], references: [id])
  paymentSubmission    PaymentSubmission? @relation(fields: [paymentSubmissionId], references: [id])

  @@map("message_logs")
}

model AuditLog {
  id          String @id @default(uuid())
  actorId     String? @map("actor_id")
  actorType   String? @map("actor_type")
  action      String
  entityType  String @map("entity_type")
  entityId    String? @map("entity_id")
  oldValue    Json? @map("old_value")
  newValue    Json? @map("new_value")
  ipAddress   String? @map("ip_address")
  userAgent   String? @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([entityType, entityId])
  @@index([action])
  @@map("audit_logs")
}
```

---

## 18. MVP Scope

Phase แรกให้ทำเฉพาะ:

### Database

1. customers
2. billing_cycle_presets
3. bank_accounts
4. bill_plans
5. bill_installments
6. payment_submissions
7. payments
8. message_logs
9. audit_logs

### API

1. POST /api/customers
2. POST /api/customers/link-line
3. GET /api/billing-cycle-presets
4. GET /api/bank-accounts
5. POST /api/bank-accounts
6. PATCH /api/bank-accounts/{id}
7. PATCH /api/bank-accounts/{id}/set-default
8. PATCH /api/bank-accounts/{id}/deactivate
9. POST /api/bill-plans
10. POST /api/bill-plans/custom-dates
11. GET /api/customers/{customer_id}/bill-plans
12. POST /api/line/webhook
13. POST /api/jobs/send-daily-bill-reminders
14. GET /api/admin/payment-submissions
15. PATCH /api/admin/payment-submissions/{id}/match-installment
16. POST /api/admin/payment-submissions/{id}/approve
17. POST /api/admin/payment-submissions/{id}/reject

### Logic

1. Generate installments
2. Render LINE reminder message
3. Render bill text with 💸 and ✅
4. Render bank account from database
5. Get default bank account ตอนสร้างบิล
6. Validate bank account active ก่อนใช้ใน bill_plan
7. Receive LINE image
8. Store slip image
9. OCR slip via OcrService abstraction
10. Parse slip data
11. Auto match payment
12. Admin manual match
13. Approve payment
14. Send payment approved message
15. Audit logs
16. Message logs
17. Duplicate slip protection

---

## 19. Acceptance Criteria

ระบบถือว่าผ่าน MVP เมื่อทำได้ครบ:

1. Admin สร้างลูกค้าได้
2. ผูกลูกค้ากับ LINE user id ได้
3. Admin สร้างบัญชีรับโอนได้
4. Admin ตั้ง default bank account ได้
5. ตอนสร้างบิลสามารถเลือก bank_account_id ได้
6. ถ้าไม่เลือก bank_account_id ระบบต้องใช้ default bank account
7. ข้อความบิลต้องแสดงเลขบัญชี ธนาคาร และชื่อบัญชีจาก database
8. ห้าม hardcode เลขบัญชีใน message renderer
9. บัญชี inactive ห้ามใช้กับบิลใหม่
10. บิลเก่าที่ผูกกับบัญชีเดิมยังต้อง render ข้อมูลบัญชีเดิมได้
11. Admin สร้างบิลแบบทุก 3/5/7/custom วันได้
12. ระบบ generate installments ได้ถูกต้อง
13. ระบบส่งแจ้งเตือน LINE ตอนเช้าตาม due_date ได้
14. ลูกค้าส่งรูปสลิปเข้า LINE OA ได้
15. ระบบสร้าง payment_submission ได้
16. ระบบเก็บรูปสลิปและ image_hash ได้
17. ระบบ OCR และ parse ยอด/วันที่ได้
18. ระบบ auto match ได้เมื่อยอดและวันที่ตรงกับงวด
19. Phase แรก auto_matched แล้วยังต้องเป็น pending_review
20. ระบบส่งเข้า admin match ได้เมื่อยอดหรือวันที่ไม่ตรง
21. Admin ผูกสลิปกับงวดเองได้
22. Admin approve สลิปได้
23. เมื่อ approve แล้ว installment เปลี่ยนเป็น paid
24. ถ้าทุกงวด paid แล้ว bill_plan เปลี่ยนเป็น completed
25. ระบบส่งข้อความกลับลูกค้าพร้อม ✅ ในบิลได้
26. ระบบกันส่งบิลซ้ำในวันเดียวกันได้
27. ระบบกันสลิปซ้ำได้
28. มี message_logs สำหรับตรวจสอบย้อนหลัง
29. มี audit_logs สำหรับ action สำคัญ
30. ทุก payment approval ต้องทำใน transaction
31. ทุกวันเวลาใช้ timezone Asia/Bangkok
32. ข้อความที่ส่งหาลูกค้าต้องสุภาพและไม่ใช้ถ้อยคำข่มขู่
33. LINE webhook ต้อง verify signature
34. Admin API ต้องมี authentication
35. Job API ต้องมี internal authentication

---

## 20. Environment Variables

ตัวอย่าง `.env` ที่ควรรองรับ:

```env
NODE_ENV=development
APP_PORT=3000
APP_TIMEZONE=Asia/Bangkok

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/line_oa_billing

LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=

ADMIN_API_KEY=change-me
INTERNAL_JOB_API_KEY=change-me

PAYMENT_AUTO_APPROVE_ENABLED=false

STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./storage
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_REGION=

OCR_PROVIDER=mock
OCR_API_KEY=

MAX_SLIP_FILE_SIZE_MB=10
```

---

## 21. Out of Scope for Current Phase

ยังไม่ต้องทำ:

1. Frontend dashboard เต็มรูปแบบ
2. Rich menu editor
3. ระบบ login admin แบบ production-grade
4. Role permission แบบละเอียด
5. Export Excel
6. รายงานสรุปยอดแบบละเอียด
7. ระบบค่าปรับละเอียด
8. ระบบ blacklisting
9. ระบบหลายสาขา/หลายบัญชีแยกตามสาขา
10. ระบบ broadcast marketing
11. Auto approve payment เปิดใช้งานจริง
12. OCR provider production integration แบบ lock provider
13. Slip verification กับธนาคารแบบ real-time

แต่ Database และ API ควรออกแบบเผื่อขยายในอนาคต

---

## 22. Recommended Development Phases

### Phase 1.1: Foundation

- Setup Bun + Elysia + TypeScript
- Setup Prisma + PostgreSQL
- Create Prisma schema
- Create migrations
- Seed billing_cycle_presets
- Seed default bank account
- Response wrapper
- Error handling
- Admin API key middleware
- Internal job API key middleware

### Phase 1.2: Core Billing

- Customer API
- Bank Account API
- Billing Cycle API
- Bill Plan API
- Generate installments
- Bill details API
- Message renderer
- Unit tests for billing logic

### Phase 1.3: LINE Integration

- LINE webhook endpoint
- LINE signature verification
- LINE push/reply service
- Daily reminder job
- Message logs
- Retry failed LINE messages

### Phase 1.4: Payment Submission

- Receive LINE image
- Download LINE message content
- Store slip image
- Generate image_hash
- Create payment_submission
- OCR abstraction
- Mock OCR provider
- Slip parser
- Payment matching service

### Phase 1.5: Admin Payment Flow

- List payment submissions
- Candidate installments
- Manual match
- Approve payment transaction
- Reject payment
- Update installment status
- Update bill_plan completed
- Send approved/rejected LINE message
- Audit logs

### Phase 1.6: Testing & Hardening

- Unit tests
- Integration tests
- Duplicate slip tests
- LINE signature tests
- Payment transaction tests
- Job idempotency tests
- Basic security review
