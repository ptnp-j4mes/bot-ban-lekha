# Requirement Prompt: LINE OA Bill Reminder & Payment Matching System

ต้องการพัฒนา Backend API และ Database สำหรับระบบ LINE OA ที่ใช้แจ้งเตือนลูกค้าเรื่องยอดชำระรายงวด, สร้างบิลตามรอบที่กำหนด, รับสลิปโอนเงินจากลูกค้า, OCR สลิป, ตรวจสอบยอดกับงวดในบิล และส่งข้อความสถานะกลับไปยังลูกค้าผ่าน LINE OA

## 1. Project Overview

ระบบนี้เป็น LINE OA Bot สำหรับจัดการบิลรายงวด โดยมีความสามารถหลักดังนี้:

1. เพิ่มข้อมูลลูกค้า
2. ผูกลูกค้ากับ LINE OA ผ่าน `line_user_id`
3. สร้างบิลแบบกำหนดรอบเรียกเก็บได้ เช่น ทุก 3 วัน, 5 วัน, 7 วัน หรือ custom dates
4. Generate ตารางงวดอัตโนมัติจากวันที่เริ่มต้น
5. ส่งข้อความแจ้งเตือนยอดชำระให้ลูกค้าทุกเช้า
6. ลูกค้าส่งสลิปกลับมาใน LINE OA
7. ระบบ OCR อ่านข้อมูลจากสลิป เช่น ยอดเงิน วันที่ เวลา ธนาคาร เลขอ้างอิง
8. ระบบพยายามจับคู่สลิปกับงวดในบิลอัตโนมัติ
9. หากยอด/วัน/ข้อมูลไม่ตรงหรือไม่มั่นใจ ให้ส่งเข้า queue ให้ admin ผูกกับงวดในบิลเอง
10. เมื่อชำระสำเร็จ ให้ update สถานะงวดเป็น paid และส่งข้อความกลับลูกค้าพร้อมเครื่องหมาย ✅ ในบิล
11. เก็บ log การส่งข้อความ, การรับสลิป, การ match, และการ approve ทุกครั้ง

Phase นี้ทำเฉพาะ Backend API, Database Schema, Business Logic, Webhook, Scheduler และ Payment Matching Logic ยังไม่ต้องทำ Frontend UI

---

## 2. Core Concepts

โครงสร้างหลักของระบบ:

Customer
→ Bill Plan
→ Bill Installments
→ Payment Submission
→ Payment
→ LINE Message Logs

ตัวอย่าง:

ลูกค้า A มีบิล 1
ต้น 1000 ส่ง 490 ทุก 7 วัน 3 งวดจบ

ระบบต้อง generate งวดเป็น:

16 มิ.ย. 490
23 มิ.ย. 490
30 มิ.ย. 490

เมื่อถึงวันที่ 16 ระบบส่ง LINE แจ้งเตือนลูกค้าในตอนเช้า

เมื่อลูกค้าส่งสลิป 490 บาท วันที่ 16 ระบบ OCR แล้ว match กับงวดวันที่ 16 ถ้าตรงให้ approve หรือรอ admin confirm ตาม config

เมื่อ approve แล้ว บิลต้องแสดงเป็น:

16✅ 490
23💸 490
30💸 490

---

## 3. Required Database Tables

ต้องออกแบบ Database รองรับ PostgreSQL

### 3.1 customers

ใช้เก็บข้อมูลลูกค้าและ LINE user id

Fields:

* id UUID primary key
* customer_code unique
* line_user_id unique nullable
* display_name
* phone
* status: active, blocked, closed
* consent_at
* created_at
* updated_at

### 3.2 billing_cycle_presets

ใช้เก็บ preset รอบเรียกเก็บ เช่น ทุก 3 วัน, ทุก 5 วัน, ทุก 7 วัน

Fields:

* id UUID primary key
* name เช่น “ทุก 3 วัน”
* cycle_days integer
* is_active boolean
* created_at

ต้อง seed ค่าเริ่มต้น:

* ทุก 3 วัน = 3
* ทุก 5 วัน = 5
* ทุก 7 วัน = 7

### 3.3 bill_plans

ใช้เก็บหัวบิล เช่น บิล 1, ต้น 1000, ส่ง 490, ทุก 7 วัน, 3 งวดจบ

Fields:

* id UUID primary key
* customer_id FK customers.id
* bill_no integer
* principal_amount numeric
* installment_amount numeric
* cycle_type: interval_days, custom_dates
* cycle_days nullable
* total_installments integer
* start_date date
* status: active, completed, cancelled
* note text
* created_by nullable
* created_at
* updated_at

Rules:

* ถ้า cycle_type = interval_days ต้องมี cycle_days และ cycle_days > 0
* ถ้า cycle_type = custom_dates จะใช้วันที่จาก installment ที่ส่งมาเอง
* bill_plan หนึ่งรายการมีหลาย bill_installments

### 3.4 bill_installments

ใช้เก็บงวดที่ต้องชำระจริง

Fields:

* id UUID primary key
* bill_plan_id FK bill_plans.id
* installment_no integer
* due_date date
* amount_due numeric
* amount_paid numeric default 0
* status: pending, partial_paid, paid, overdue, cancelled
* paid_at timestamp nullable
* paid_by_payment_id nullable
* morning_sent_at nullable
* before_deadline_sent_at nullable
* overdue_sent_at nullable
* created_at
* updated_at

Constraints:

* unique bill_plan_id + installment_no
* unique bill_plan_id + due_date

### 3.5 payment_submissions

ใช้เก็บสลิปที่ลูกค้าส่งเข้ามาก่อนตรวจสอบ

Fields:

* id UUID primary key
* customer_id nullable FK customers.id
* line_user_id
* line_message_id
* image_url
* original_file_name
* image_hash nullable
* ocr_status: pending, processing, success, failed
* ocr_raw_text text
* parsed_amount numeric nullable
* parsed_transfer_date date nullable
* parsed_transfer_time time nullable
* parsed_bank_name nullable
* parsed_account_no nullable
* parsed_reference_no nullable
* match_status: unmatched, auto_matched, needs_admin_match, admin_matched, rejected
* matched_installment_id nullable FK bill_installments.id
* match_confidence numeric
* match_reason text
* review_status: pending_review, approved, rejected
* reviewed_by nullable
* reviewed_at nullable
* created_at
* updated_at

Important:

* ห้ามนับ payment_submissions เป็นยอดจ่ายจริงจนกว่าจะ approve
* ต้องกันสลิปซ้ำด้วย parsed_reference_no หรือ image_hash
* ถ้า OCR อ่านไม่ได้ ให้ status = needs_admin_match

### 3.6 payments

ใช้เก็บยอดชำระจริงหลัง approve แล้ว

Fields:

* id UUID primary key
* customer_id FK customers.id
* payment_submission_id nullable FK payment_submissions.id
* bill_installment_id FK bill_installments.id
* amount numeric
* paid_at timestamp nullable
* payment_method default bank_transfer
* status: approved, cancelled
* approved_by nullable
* approved_at
* created_at

Rules:

* เมื่อสร้าง payment ต้อง update bill_installments ใน transaction เดียวกัน
* ถ้าชำระเต็ม amount_due ให้ installment.status = paid
* ถ้าชำระไม่เต็ม ให้ installment.status = partial_paid
* ถ้าจ่ายเกินหรือยอดไม่ตรง ให้ admin review ก่อน

### 3.7 message_logs

ใช้เก็บ log ข้อความ LINE ที่ส่งออก

Fields:

* id UUID primary key
* customer_id nullable
* bill_plan_id nullable
* bill_installment_id nullable
* payment_submission_id nullable
* line_user_id
* message_type เช่น daily_reminder, payment_received, payment_need_admin, payment_approved, payment_rejected, overdue_reminder
* message_text
* line_response jsonb nullable
* status: sent, failed
* error_message nullable
* sent_at

---

## 4. Required API Endpoints

### 4.1 Customer APIs

POST /api/customers

สร้างลูกค้า

Request:

{
"customer_code": "CUS0001",
"display_name": "คุณเอ",
"phone": "0800000000"
}

GET /api/customers

ดูลูกค้าทั้งหมด

GET /api/customers/{id}

ดูรายละเอียดลูกค้า

PATCH /api/customers/{id}

แก้ไขข้อมูลลูกค้า

POST /api/customers/link-line

ผูก customer กับ line_user_id

Request:

{
"customer_code": "CUS0001",
"line_user_id": "Uxxxxxxxx"
}

---

### 4.2 Billing Cycle APIs

GET /api/billing-cycle-presets

ดึงรอบเรียกเก็บทั้งหมด เช่น 3 วัน, 5 วัน, 7 วัน

POST /api/billing-cycle-presets

เพิ่ม preset ใหม่

Request:

{
"name": "ทุก 10 วัน",
"cycle_days": 10
}

PATCH /api/billing-cycle-presets/{id}

แก้ไข preset

---

### 4.3 Bill Plan APIs

POST /api/bill-plans

สร้างบิลแบบรอบทุก X วัน และ generate installments อัตโนมัติ

Request:

{
"customer_id": "customer-uuid",
"bill_no": 1,
"principal_amount": 1000,
"installment_amount": 490,
"cycle_type": "interval_days",
"cycle_days": 7,
"total_installments": 3,
"start_date": "2026-06-16",
"note": "ต้น 1000 ส่ง 490 ทุก 7 วัน 3 งวดจบ"
}

Response ต้องมี installments ที่ generate แล้ว:

{
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
}

POST /api/bill-plans/custom-dates

สร้างบิลแบบกำหนดวันเอง

Request:

{
"customer_id": "customer-uuid",
"bill_no": 2,
"principal_amount": 2000,
"cycle_type": "custom_dates",
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

GET /api/customers/{customer_id}/bill-plans

ดูบิลทั้งหมดของลูกค้า

GET /api/bill-plans/{id}

ดูรายละเอียดบิลพร้อม installments

PATCH /api/bill-plans/{id}/cancel

ยกเลิกบิล

---

### 4.4 Installment APIs

GET /api/installments/due-today

ดูงวดที่ครบกำหนดวันนี้

GET /api/installments/overdue

ดูงวดที่ค้างชำระ

PATCH /api/installments/{id}

แก้ไขงวด เช่น amount, due_date, status

---

### 4.5 LINE Webhook API

POST /api/line/webhook

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
11. ถ้า match ชัดเจน ให้ auto_matched หรือ approve ตาม config
12. ถ้าไม่ชัดเจน ให้ needs_admin_match
13. ส่งข้อความตอบกลับลูกค้า

---

### 4.6 Job APIs

POST /api/jobs/send-daily-bill-reminders

ส่งแจ้งเตือนบิลทุกเช้า

Logic:

* หา bill_installments ที่ due_date = today
* status in pending, partial_paid
* customer.status = active
* customer.line_user_id is not null
* morning_sent_at is null
* ส่ง LINE push message
* update morning_sent_at
* insert message_logs

POST /api/jobs/send-before-deadline-reminders

ส่งเตือนก่อนครบเวลา เช่น 16:00 หรือก่อน 17:00

POST /api/jobs/mark-overdue

เปลี่ยนสถานะงวดที่เลย due date แล้วยังไม่ paid เป็น overdue

---

### 4.7 Payment Submission Admin APIs

GET /api/admin/payment-submissions

ดูสลิปทั้งหมด พร้อม filter ได้

Query params:

* match_status
* review_status
* customer_id
* date_from
* date_to

GET /api/admin/payment-submissions/{id}

ดูรายละเอียดสลิป, OCR result, candidate installments

PATCH /api/admin/payment-submissions/{id}/match-installment

ให้ admin ผูกสลิปกับงวดเอง

Request:

{
"bill_installment_id": "installment-uuid",
"note": "ผูกกับงวดวันที่ 23 ตามที่ลูกค้าแจ้ง"
}

Logic:

* update matched_installment_id
* match_status = admin_matched
* match_reason = admin note
* review_status ยังเป็น pending_review จนกว่า admin approve

POST /api/admin/payment-submissions/{id}/approve

อนุมัติสลิปและสร้าง payment จริง

Logic ต้องใช้ database transaction:

1. ตรวจว่า payment_submission มี matched_installment_id
2. ตรวจว่างวดยังไม่ paid
3. ตรวจว่า reference_no หรือ image_hash ไม่ซ้ำ
4. insert payments
5. update bill_installments amount_paid, status, paid_at, paid_by_payment_id
6. update payment_submissions review_status = approved
7. ส่ง LINE message ให้ลูกค้าพร้อมบิลล่าสุดที่มี ✅
8. insert message_logs

POST /api/admin/payment-submissions/{id}/reject

ปฏิเสธสลิป

Request:

{
"reason": "ยอดเงินไม่ตรงกับบิล"
}

Logic:

* payment_submissions.review_status = rejected
* match_status = rejected
* ส่งข้อความแจ้งลูกค้า

---

## 5. Bill Generation Logic

สำหรับ cycle_type = interval_days:

Input:

* start_date
* cycle_days
* total_installments
* installment_amount

Generate:

due_date ของงวดที่ n = start_date + cycle_days * (n - 1)

Example:

start_date = 2026-06-16
cycle_days = 7
total_installments = 3
installment_amount = 490

Output:

1. 2026-06-16 = 490
2. 2026-06-23 = 490
3. 2026-06-30 = 490

ต้อง validate:

* cycle_days > 0
* total_installments > 0
* installment_amount > 0
* start_date required
* customer must exist
* bill_no should not duplicate for same customer unless allowed by business config

---

## 6. OCR & Payment Matching Logic

เมื่อ OCR อ่านสลิปแล้ว ต้อง parse ข้อมูล:

* amount
* transfer_date
* transfer_time
* bank_name
* account_no
* reference_no
* raw_text

Auto match ได้เมื่อ:

1. customer เจอจาก line_user_id
2. parsed_amount ตรงกับ amount_due
3. parsed_transfer_date ตรงกับ due_date
4. งวดนั้นยังไม่ paid
5. reference_no หรือ image_hash ยังไม่เคยใช้
6. confidence สูงพอ

Scoring example:

* amount_match = +50
* date_match = +40
* due_today = +10
* reference_unique = +10
* same_customer = required

Suggested thresholds:

* score >= 90 = auto_matched
* score 70-89 = needs_admin_match หรือ admin confirm
* score < 70 = unmatched / needs_admin_match

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

เมื่อ needs_admin_match:

* เก็บ submission ไว้
* ส่งข้อความกลับลูกค้าว่าได้รับสลิปแล้ว กำลังตรวจสอบ
* admin จะเลือก bill_installment_id เอง
* หลัง admin approve จึงสร้าง payment และ update installment

---

## 7. LINE Message Templates

ต้องมี message renderer สำหรับสร้างข้อความ LINE

### 7.1 Daily Reminder Message

Format:

💸💸 วันนี้มีชำระยอดประจำงวดวันที่ 1️⃣6️⃣ มิถุนายน 6️⃣9️⃣ นะคะ 💸💸

กรุณาชำระภายในเวลา 17.00 น.

หากชำระแล้ว สามารถส่งสลิปกลับมาในแชทนี้ได้เลยค่ะ 🙏

### 7.2 Bill Text Message

Format:

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

### 7.3 Payment Received Message

กรณีได้รับสลิปแล้วแต่ยังรอตรวจ:

📌 ได้รับสลิปแล้วค่ะ

ระบบกำลังตรวจสอบยอดชำระ
หากตรวจสอบเรียบร้อยแล้ว จะแจ้งสถานะกลับทางแชทนี้ค่ะ 🙏

### 7.4 Payment Needs Admin Match Message

กรณี OCR หรือ match ไม่มั่นใจ:

📌 ได้รับสลิปแล้วค่ะ

ระบบยังไม่สามารถจับคู่ยอดกับงวดในบิลได้อัตโนมัติ
แอดมินจะตรวจสอบและอัปเดตสถานะให้ค่ะ 🙏

### 7.5 Payment Approved Message

กรณี approve แล้ว:

✅ รับยอดชำระเรียบร้อยค่ะ

บิล 1️⃣
งวดวันที่ 1️⃣6️⃣ มิถุนายน 6️⃣9️⃣
ยอดชำระ 490 บาท

สถานะบิลล่าสุด

16✅ 490
23💸 490
30💸 490

ขอบคุณค่ะ 🙏

### 7.6 Payment Rejected Message

กรณีสลิปถูกปฏิเสธ:

ขออภัยค่ะ สลิปที่ส่งมายังไม่สามารถยืนยันยอดได้

เหตุผล: {reason}

กรุณาตรวจสอบและส่งสลิปใหม่อีกครั้งค่ะ 🙏

---

## 8. Emoji Number Formatter

ต้องมี utility แปลงเลขเป็น emoji number

Mapping:

0 → 0️⃣
1 → 1️⃣
2 → 2️⃣
3 → 3️⃣
4 → 4️⃣
5 → 5️⃣
6 → 6️⃣
7 → 7️⃣
8 → 8️⃣
9 → 9️⃣

ใช้กับ:

* เลขวันที่
* เลขปี พ.ศ. แบบ 2 หลัก
* เลขบิล

ตัวอย่าง:

16 มิถุนายน 69
ต้อง render เป็น:

1️⃣6️⃣ มิถุนายน 6️⃣9️⃣

---

## 9. Status Flow

### 9.1 Bill Installment Status

pending
→ partial_paid
→ paid

pending
→ overdue
→ paid

pending
→ cancelled

### 9.2 Payment Submission Status

created
→ ocr_processing
→ ocr_success
→ auto_matched
→ approved

created
→ ocr_success
→ needs_admin_match
→ admin_matched
→ approved

created
→ ocr_failed
→ needs_admin_match
→ admin_matched
→ approved

created
→ rejected

---

## 10. Security & Compliance Requirements

1. ต้อง verify LINE webhook signature ทุกครั้ง
2. ห้าม trust ข้อมูลจาก OCR 100%
3. ต้องมี admin review ในกรณี match ไม่มั่นใจ
4. ต้องกันสลิปซ้ำด้วย reference_no หรือ image_hash
5. ต้องใช้ transaction ตอน approve payment
6. ต้องเก็บ audit log ทุกครั้งที่ admin match, approve, reject
7. ต้องเก็บ message_logs ทุกครั้งที่ส่ง LINE
8. ต้องเก็บข้อมูลส่วนบุคคลอย่างระมัดระวัง เช่น line_user_id, เบอร์โทร, สลิป, ยอดชำระ
9. ข้อความทวงถามต้องใช้ถ้อยคำสุภาพ ไม่ข่มขู่ ไม่เปิดเผยข้อมูลให้บุคคลอื่น
10. ห้ามส่งข้อความหาลูกค้าหากไม่มี line_user_id หรือยังไม่ได้ผูกบัญชี
11. ต้องรองรับ timezone Asia/Bangkok
12. วันที่ในระบบต้องแยกชัดเจนระหว่าง due_date, transfer_date, paid_at และ created_at

---

## 11. Scheduler Requirements

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

* ถ้าเคยส่งแล้ว ไม่ส่งซ้ำ
* ใช้ morning_sent_at, before_deadline_sent_at, overdue_sent_at เป็นตัวกันซ้ำ
* ถ้า LINE ส่ง failed ให้เก็บ log แต่ไม่ทำให้ทั้ง job ล้ม

---

## 12. Required Business Rules

1. ลูกค้าหนึ่งคนมีได้หลาย bill_plans
2. bill_plan หนึ่งรายการมีหลาย installments
3. installment หนึ่งงวดควรมี payment approved ได้หลัก ๆ หนึ่งรายการ เว้นแต่รองรับ partial payment
4. สลิปหนึ่งใบต้องไม่ถูกใช้ซ้ำกับหลายงวด
5. ถ้าลูกค้าส่งยอดตรงกับวันปัจจุบันและยอดตรงกับงวด ให้ auto match ได้
6. ถ้าลูกค้าส่งยอดแต่วันที่ในสลิปไม่ตรงกับ due_date ให้ส่งเข้า admin match
7. ถ้า OCR อ่านไม่ได้ ให้ส่งเข้า admin match
8. ถ้าสลิปถูก approve แล้ว ต้อง render บิลล่าสุดกลับไปให้ลูกค้าพร้อม ✅
9. ถ้างวดทุกงวดใน bill_plan เป็น paid แล้ว ให้ bill_plan.status = completed
10. ถ้าบิล completed แล้ว ข้อความท้ายบิลควรแสดง “จบแล้ว ✅”
11. ถ้ายังไม่ครบทุกงวด ให้แสดง “ยังไม่จบค่ะ 🙏”

---

## 13. API Response Style

ทุก API ควร response เป็น JSON format เดียวกัน

Success:

{
"success": true,
"data": {},
"message": "success"
}

Error:

{
"success": false,
"error": {
"code": "VALIDATION_ERROR",
"message": "cycle_days is required"
}
}

Common error codes:

* VALIDATION_ERROR
* NOT_FOUND
* DUPLICATE_SLIP
* INSTALLMENT_ALREADY_PAID
* LINE_PUSH_FAILED
* OCR_FAILED
* UNAUTHORIZED
* FORBIDDEN
* INTERNAL_ERROR

---

## 14. MVP Scope

Phase แรกให้ทำเฉพาะ:

Database:

1. customers
2. billing_cycle_presets
3. bill_plans
4. bill_installments
5. payment_submissions
6. payments
7. message_logs

API:

1. POST /api/customers
2. POST /api/customers/link-line
3. GET /api/billing-cycle-presets
4. POST /api/bill-plans
5. POST /api/bill-plans/custom-dates
6. GET /api/customers/{customer_id}/bill-plans
7. POST /api/line/webhook
8. POST /api/jobs/send-daily-bill-reminders
9. GET /api/admin/payment-submissions
10. PATCH /api/admin/payment-submissions/{id}/match-installment
11. POST /api/admin/payment-submissions/{id}/approve
12. POST /api/admin/payment-submissions/{id}/reject

Logic:

1. Generate installments
2. Render LINE reminder message
3. Render bill text with 💸 and ✅
4. Receive LINE image
5. OCR slip
6. Parse slip data
7. Auto match payment
8. Admin manual match
9. Approve payment
10. Send payment approved message

---

## 15. Acceptance Criteria

ระบบถือว่าผ่าน MVP เมื่อทำได้ครบ:

1. Admin สร้างลูกค้าได้
2. ผูกลูกค้ากับ LINE user id ได้
3. Admin สร้างบิลแบบทุก 3/5/7/custom วันได้
4. ระบบ generate installments ได้ถูกต้อง
5. ระบบส่งแจ้งเตือน LINE ตอนเช้าตาม due_date ได้
6. ลูกค้าส่งรูปสลิปเข้า LINE OA ได้
7. ระบบสร้าง payment_submission ได้
8. ระบบ OCR และ parse ยอด/วันที่ได้
9. ระบบ auto match ได้เมื่อยอดและวันที่ตรงกับงวด
10. ระบบส่งเข้า admin match ได้เมื่อยอดหรือวันที่ไม่ตรง
11. Admin ผูกสลิปกับงวดเองได้
12. Admin approve สลิปได้
13. เมื่อ approve แล้ว installment เปลี่ยนเป็น paid
14. ระบบส่งข้อความกลับลูกค้าพร้อม ✅ ในบิลได้
15. ระบบกันส่งบิลซ้ำในวันเดียวกันได้
16. ระบบกันสลิปซ้ำได้
17. มี message_logs สำหรับตรวจสอบย้อนหลัง
18. ทุก payment approval ต้องทำใน transaction
19. ทุกวันเวลาใช้ timezone Asia/Bangkok
20. ข้อความที่ส่งหาลูกค้าต้องสุภาพและไม่ใช้ถ้อยคำข่มขู่

---

## 16. Suggested Implementation Stack & Structure

ระบบนี้ให้พัฒนาโดยใช้ Stack ดังนี้:

### Frontend

ใช้สำหรับหน้าจัดการของ Admin ในอนาคต

* React
* Vite
* TypeScript
* shadcn/ui
* Tailwind CSS
* React Hook Form
* Zod สำหรับ validation
* TanStack Query สำหรับเรียก API และจัดการ server state

Frontend ต้องรองรับหน้าจัดการหลักในอนาคต เช่น:

1. หน้าจัดการลูกค้า
2. หน้าผูกลูกค้ากับ LINE user id
3. หน้าสร้างบิล
4. หน้าดูตารางงวด
5. หน้ารายการสลิปที่รอตรวจสอบ
6. หน้า admin manual match สลิปกับงวด
7. หน้า approve/reject payment
8. หน้า dashboard ยอดที่ครบกำหนดวันนี้
9. หน้า overdue list
10. หน้า message/payment logs

Phase ปัจจุบันยังไม่ต้อง implement frontend ให้ครบ แต่ Backend API ต้องออกแบบให้ frontend ชุดนี้เรียกใช้งานได้ง่าย

---

### Backend

ใช้สำหรับ API, LINE webhook, scheduler job, OCR integration, payment matching และ payment approval logic

Backend stack:

* Bun runtime
* Elysia framework
* TypeScript
* PostgreSQL
* Prisma ORM
* Zod หรือ Elysia schema validation
* LINE Messaging API integration
* OCR service integration
* Cron/job runner สำหรับ daily reminder และ overdue jobs

Backend ควรแยก service layer ชัดเจน เช่น:

1. CustomerService
2. BillingCyclePresetService
3. BillPlanService
4. InstallmentService
5. LineWebhookService
6. LineMessagingService
7. OcrService
8. SlipParserService
9. PaymentSubmissionService
10. PaymentMatchingService
11. PaymentApprovalService
12. MessageRendererService
13. SchedulerJobService
14. MessageLogService
15. AuditLogService

---

### Database

ใช้ PostgreSQL และจัดการ schema ผ่าน Prisma

ต้องมี Prisma models อย่างน้อย:

1. Customer
2. BillingCyclePreset
3. BillPlan
4. BillInstallment
5. PaymentSubmission
6. Payment
7. MessageLog

ควรใช้ Prisma migration สำหรับ version control ของ database schema

---

### Project Structure Suggestion

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

      messages/
        message-renderer.service.ts
        message-log.service.ts

    lib/
      prisma.ts
      line.ts
      date.ts
      emoji-number.ts
      errors.ts
      response.ts
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
      bill-plan.schema.ts
      payment-submission.schema.ts
```

---

### API Response Standard

Backend ทุก endpoint ควร response เป็นรูปแบบเดียวกัน:

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

---

### Required Tests

ควรเขียน unit test และ integration test สำหรับ logic สำคัญ:

1. generateInstallments
2. toEmojiNumber
3. renderBillStatus
4. payment matching score
5. approve payment transaction
6. duplicate slip detection
7. due today query
8. LINE webhook signature validation
9. OCR failed fallback to needs_admin_match
10. bill_plan completed เมื่อทุกงวด paid แล้ว


---

## 17. Out of Scope for Current Phase

ยังไม่ต้องทำ:

1. Frontend dashboard
2. Rich menu editor
3. ระบบ login admin
4. Role permission
5. Export Excel
6. รายงานสรุปยอด
7. ระบบค่าปรับละเอียด
8. ระบบ blacklisting
9. ระบบบัญชีหลายบัญชีธนาคาร
10. ระบบ broadcast marketing

แต่ Database และ API ควรออกแบบเผื่อขยายในอนาคต

## เพิ่ม Requirement: Config ช่องทางการโอนเงิน

ระบบต้องรองรับการ config ข้อมูลบัญชีรับโอนเงินได้ ไม่ hardcode เลขบัญชีไว้ใน message template

---

## Database เพิ่มเติม

### bank_accounts

ใช้เก็บบัญชีธนาคารสำหรับรับชำระเงิน

Fields:

* id UUID primary key
* account_name varchar
* account_no varchar
* bank_name varchar
* bank_code nullable
* branch_name nullable
* is_default boolean default false
* is_active boolean default true
* note text nullable
* created_at timestamp
* updated_at timestamp

Rules:

1. ต้องมีบัญชี default ได้เพียง 1 บัญชีต่อระบบ หรือ 1 บัญชีต่อสาขา ถ้าในอนาคตรองรับหลายสาขา
2. ถ้า `is_active = false` ห้ามนำบัญชีนี้ไปแสดงในบิลใหม่
3. หากไม่มีการเลือกบัญชีตอนสร้างบิล ให้ใช้บัญชีที่เป็น default
4. ต้องไม่ hardcode เลขบัญชีใน code หรือ message template

---

## ปรับ bill_plans

เพิ่ม field:

* bank_account_id nullable FK bank_accounts.id

ใช้เพื่อกำหนดว่าบิลนี้ต้องใช้บัญชีไหนในการรับโอน

ตัวอย่าง:

```text
bill_plans
- id
- customer_id
- bill_no
- principal_amount
- installment_amount
- cycle_type
- cycle_days
- total_installments
- start_date
- bank_account_id
- status
- note
- created_at
- updated_at
```

Business Rules:

1. ตอนสร้าง bill_plan ถ้า request ส่ง `bank_account_id` มา ให้ใช้บัญชีนั้น
2. ถ้าไม่ส่ง `bank_account_id` มา ให้ใช้บัญชี default
3. ถ้าบัญชีที่เลือกไม่ active ให้ reject request
4. เมื่อ render บิล ให้ดึงข้อมูลบัญชีจาก bank_account_id ของ bill_plan
5. บิลเดิมควรเก็บ bank_account_id เดิมไว้ เพื่อให้ประวัติข้อความและช่องทางโอนย้อนหลังถูกต้อง

---

## API เพิ่มเติม

### GET /api/bank-accounts

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

---

### POST /api/bank-accounts

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

---

### PATCH /api/bank-accounts/{id}

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

---

### PATCH /api/bank-accounts/{id}/set-default

ตั้งบัญชีนี้เป็นบัญชี default

Logic:

1. Set `is_default = false` ให้ทุกบัญชีอื่น
2. Set `is_default = true` ให้บัญชีนี้
3. บัญชีที่จะตั้ง default ต้อง `is_active = true`

---

### PATCH /api/bank-accounts/{id}/deactivate

ปิดใช้งานบัญชี

Rules:

1. ถ้าบัญชีนี้เป็น default ห้าม deactivate จนกว่าจะมี default account อื่น
2. บิลเก่าที่ยังอ้างอิงบัญชีนี้ยังต้องแสดงข้อมูลย้อนหลังได้
3. บิลใหม่ห้ามเลือกบัญชีที่ inactive

---

## ปรับ API สร้างบิล

### POST /api/bill-plans

เพิ่ม field `bank_account_id`

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

---

## ปรับ Message Renderer

ข้อความบิลต้องดึงข้อมูลบัญชีจาก database

ห้าม hardcode แบบนี้ใน code:

```text
เลขที่บัญชี 2509480357
ธนาคารกรุงศรีอยุธยา
ชื่อบัญชี ชลดา พรมเมศ
```

ให้ render จาก bank_accounts แทน:

```text
💸 ช่องทางการโอนเงิน 💸

เลขที่บัญชี {account_no}
{bank_name}
ชื่อบัญชี {account_name}
```

ตัวอย่างผลลัพธ์:

```text
💸 ช่องทางการโอนเงิน 💸

เลขที่บัญชี 2509480357
ธนาคารกรุงศรีอยุธยา
ชื่อบัญชี ชลดา พรมเมศ
```

---

## Prisma Model เพิ่มเติม

```prisma
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
```

ปรับ BillPlan:

```prisma
model BillPlan {
  id                 String @id @default(uuid())
  customerId         String @map("customer_id")
  bankAccountId      String? @map("bank_account_id")

  billNo             Int @map("bill_no")
  principalAmount    Decimal @map("principal_amount")
  installmentAmount  Decimal @map("installment_amount")
  cycleType          String @default("interval_days") @map("cycle_type")
  cycleDays          Int? @map("cycle_days")
  totalInstallments  Int @map("total_installments")
  startDate          DateTime @map("start_date")
  status             String @default("active")
  note               String?

  customer           Customer @relation(fields: [customerId], references: [id])
  bankAccount        BankAccount? @relation(fields: [bankAccountId], references: [id])
  installments       BillInstallment[]

  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@map("bill_plans")
}
```

---

## ปรับ MVP Scope

เพิ่ม Database:

8. bank_accounts

เพิ่ม API:

13. GET /api/bank-accounts
14. POST /api/bank-accounts
15. PATCH /api/bank-accounts/{id}
16. PATCH /api/bank-accounts/{id}/set-default
17. PATCH /api/bank-accounts/{id}/deactivate

เพิ่ม Logic:

11. Get default bank account ตอนสร้างบิล
12. Render bank account จาก database
13. Validate bank account active ก่อนใช้ใน bill_plan

---

## Acceptance Criteria เพิ่มเติม

21. Admin สามารถเพิ่มบัญชีรับโอนได้
22. Admin สามารถตั้ง default bank account ได้
23. ตอนสร้างบิลสามารถเลือก bank_account_id ได้
24. ถ้าไม่เลือก bank_account_id ระบบต้องใช้ default bank account
25. ข้อความบิลต้องแสดงเลขบัญชี ธนาคาร และชื่อบัญชีจาก database
26. ห้าม hardcode เลขบัญชีใน message renderer
27. บัญชี inactive ห้ามใช้กับบิลใหม่
28. บิลเก่าที่ผูกกับบัญชีเดิมยังต้อง render ข้อมูลบัญชีเดิมได้

