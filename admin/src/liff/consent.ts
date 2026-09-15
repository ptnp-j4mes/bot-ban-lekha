export const CONSENT_VERSION = "2026-09-15";

export type ConsentSelections = {
  general: boolean;
  gps: boolean;
  photo: boolean;
  image_rights: boolean;
  marketing: boolean;
  retention: boolean;
  truth: boolean;
};

export type LiffConsent = { accepted_at: string; version: string };

export function isConsentSubmissionValid(value: ConsentSelections): boolean {
  return Boolean(value.general && value.retention && value.truth)
    && (!value.photo || value.image_rights);
}
