import { useState, type FormEvent } from "react";
import { Check, LockKeyhole, MapPinned, Megaphone, ShieldCheck, TriangleAlert } from "lucide-react";
import { isConsentSubmissionValid, type ConsentSelections } from "./consent";

type ConsentFormProps = { onSubmit: (selection: ConsentSelections) => Promise<void> };

const initialSelection: ConsentSelections = {
  general: false, gps: false,
  photo: false, image_rights: false, marketing: false, retention: false, truth: false,
};

export function ConsentForm({ onSubmit }: ConsentFormProps) {
  const [selection, setSelection] = useState(initialSelection);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!isConsentSubmissionValid(selection)) {
      setError(selection.photo && !selection.image_rights
          ? "กรุณายืนยันสิทธิในภาพก่อนเผยแพร่ภาพค่ะ"
          : "กรุณาติ๊กช่องบังคับให้ครบถ้วนก่อนยืนยันค่ะ");
      return;
    }
    setSaving(true);
    try { await onSubmit(selection); }
    catch { setError("บันทึกการยินยอมไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ"); }
    finally { setSaving(false); }
  };

  return (
    <section className="liff-consent" aria-labelledby="liff-consent-title">
      <div className="liff-consent-title-row">
        <span className="liff-consent-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
        <div><p className="liff-consent-eyebrow">ก่อนดูข้อมูลบัญชีของคุณ</p><h1 id="liff-consent-title">แบบรับทราบประกาศความเป็นส่วนตัว<br />และให้ความยินยอมผ่าน LINE LIFF</h1></div>
      </div>
      <div className="liff-consent-controller">
        <strong>ผู้ควบคุมข้อมูลส่วนบุคคล: นางสาวชลดา พรมเมศ</strong>
        <span>อีเมล: lekhabankhumthraphy@gmail.com · LINE: @972sgppy</span>
      </div>
      <p className="liff-consent-intro">โปรดอ่านรายละเอียดและเลือกเฉพาะความยินยอมที่ตรงกับการใช้งานจริง การปฏิเสธความยินยอมที่ไม่จำเป็นจะไม่กระทบสิทธิในการใช้บริการที่เกี่ยวข้องค่ะ</p>

      <form onSubmit={submit}>
        <fieldset className="liff-consent-block">
          <legend>ข้อมูลส่วนบุคคลทั่วไป - รับทราบและยินยอม</legend>
          <label className="liff-check liff-check--required">
            <input type="checkbox" checked={selection.general} required onChange={(event) => setSelection((value) => ({ ...value, general: event.target.checked }))} />
            <span>ข้าพเจ้าได้รับทราบและยินยอมให้นางสาวชลดา พรมเมศ เก็บรวบรวม ใช้ เปิดเผย และ/หรือประมวลผลข้อมูลส่วนบุคคลทั่วไปของข้าพเจ้าเท่าที่จำเป็น ได้แก่</span>
          </label>
          <ul className="liff-consent-list">
            <li>ชื่อ-นามสกุล</li><li>เบอร์โทรศัพท์และ LINE ID</li><li>ที่อยู่ปัจจุบัน</li>
            <li>ที่อยู่และเบอร์โทรศัพท์ที่ทำงาน</li><li>รูปถ่ายสถานที่ทำงานหรือหน้าร้าน</li>
            <li>รูปบัตรประชาชน</li><li>สลิปเงินเดือนหรือเอกสารแสดงรายได้</li>
          </ul>
          <p>เพื่อสมัครบริการ เปิดบิล ตรวจสอบตัวตนและข้อมูล ตรวจสอบรายได้ ติดต่อประสานงาน ป้องกันการทุจริต และปฏิบัติตามกฎหมายที่เกี่ยวข้อง</p>
          <p>ข้อมูลอาจถูกเปิดเผยหรือส่งต่อแก่ผู้ให้บริการระบบ แพลตฟอร์ม LINE โฮสติ้ง หรือผู้ให้บริการที่เกี่ยวข้อง เฉพาะเท่าที่จำเป็นต่อการให้บริการ</p>
        </fieldset>

        <fieldset className="liff-consent-block">
          <legend><MapPinned size={16} aria-hidden="true" /> การยืนยันที่อยู่ด้วย GPS <small>แสดงเมื่อมีการใช้จริง</small></legend>
          <label className="liff-check"><input type="checkbox" checked={selection.gps} onChange={(event) => setSelection((value) => ({ ...value, gps: event.target.checked }))} /><span>ข้าพเจ้ายินยอมให้นางสาวชลดา พรมเมศ เก็บภาพถ่ายพร้อมพิกัด GPS วันเวลา และข้อมูลสถานที่เป็นการชั่วคราว เพื่อยืนยันที่อยู่ปัจจุบันเท่านั้น</span></label>
          <p>การเก็บข้อมูล GPS เป็นการเก็บแบบครั้งเดียว ไม่ใช่การติดตามตำแหน่งอย่างต่อเนื่อง และจะไม่ใช้ข้อมูล GPS เพื่อวัตถุประสงค์อื่น</p>
        </fieldset>

        <fieldset className="liff-consent-block">
          <legend>การเผยแพร่ภาพ <small>แสดงเฉพาะเมื่อมีการใช้จริง</small></legend>
          <label className="liff-check"><input type="checkbox" checked={selection.photo} onChange={(event) => setSelection((value) => ({ ...value, photo: event.target.checked, image_rights: event.target.checked ? value.image_rights : false }))} /><span>ข้าพเจ้ายินยอมให้นางสาวชลดา พรมเมศ ใช้และเผยแพร่ภาพของข้าพเจ้า หรือภาพที่ข้าพเจ้ามีสิทธิให้เผยแพร่ ผ่าน LINE OA, Facebook หรือเว็บไซต์ เพื่อประกาศตามหาบุคคลหรือขอให้ติดต่อกลับเท่านั้น</span></label>
          <p>จะหยุดเผยแพร่เมื่อบรรลุวัตถุประสงค์ หรือเมื่อข้าพเจ้าถอนความยินยอม</p>
          <label className={`liff-check liff-check--nested${selection.photo ? "" : " is-disabled"}`}><input type="checkbox" disabled={!selection.photo} required={selection.photo} checked={selection.image_rights} onChange={(event) => setSelection((value) => ({ ...value, image_rights: event.target.checked }))} /><span>ข้าพเจ้ารับรองว่าเป็นเจ้าของภาพ หรือได้รับอนุญาตจากเจ้าของภาพและบุคคลในภาพให้ใช้และเผยแพร่ภาพดังกล่าวแล้ว</span></label>
        </fieldset>

        <fieldset className="liff-consent-block">
          <legend><Megaphone size={16} aria-hidden="true" /> การตลาด - ไม่บังคับ</legend>
          <label className="liff-check"><input type="checkbox" checked={selection.marketing} onChange={(event) => setSelection((value) => ({ ...value, marketing: event.target.checked }))} /><span>ข้าพเจ้ายินยอมให้นางสาวชลดา พรมเมศ ใช้ชื่อ เบอร์โทรศัพท์ หรือ LINE ID เพื่อส่งข่าวสาร โปรโมชั่น และข้อเสนอทางการตลาด</span></label>
        </fieldset>

        <fieldset className="liff-consent-block">
          <legend><LockKeyhole size={16} aria-hidden="true" /> ระยะเวลาและสิทธิ</legend>
          <label className="liff-check liff-check--required"><input type="checkbox" checked={selection.retention} required onChange={(event) => setSelection((value) => ({ ...value, retention: event.target.checked }))} /><span>ข้าพเจ้าได้รับทราบว่า ข้อมูลจะถูกเก็บไว้เท่าที่จำเป็น และจะหยุดใช้หรือลบข้อมูลเมื่อบรรลุวัตถุประสงค์ หรือหมดระยะเวลาที่กฎหมายกำหนด</span></label>
          <p>ข้าพเจ้าสามารถขอเข้าถึง แก้ไข ลบ ระงับการใช้ หรือถอนความยินยอมได้ที่ อีเมล: lekhabankhumthraphy@gmail.com หรือ LINE: @972sgppy</p>
        </fieldset>

        <label className="liff-check liff-check--final liff-check--required"><input type="checkbox" checked={selection.truth} required onChange={(event) => setSelection((value) => ({ ...value, truth: event.target.checked }))} /><span>ข้าพเจ้ายืนยันว่าข้อมูลที่ให้เป็นความจริง และได้อ่านรายละเอียดข้างต้นแล้ว</span></label>
        {error && <p className="liff-consent-error" role="alert"><TriangleAlert size={16} aria-hidden="true" />{error}</p>}
        <button className="liff-button liff-consent-submit" type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : <><Check size={19} aria-hidden="true" />ยืนยันและส่งข้อมูล</>}</button>
      </form>
    </section>
  );
}
