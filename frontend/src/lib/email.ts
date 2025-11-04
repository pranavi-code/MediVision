import emailjs from "@emailjs/browser";

export type DoctorCredentials = {
  name: string;
  email: string;
  username: string;
  password: string;
  specialty?: string;
};

export type PatientCaseAccess = {
  name: string;
  email: string;
  caseId: string;
  dob: string; // YYYY-MM-DD
};

function getEnv(key: string, fallback?: string): string {
  const v = (import.meta as any).env?.[key] as string | undefined;
  if (v && v.length) return v;
  if (fallback) return fallback;
  throw new Error(`${key} is not set in .env`);
}

function getConfig() {
  const serviceId = getEnv("VITE_EMAILJS_SERVICE_ID");
  // Back-compat default template if specific ones aren't provided
  const defaultTemplateId = getEnv("VITE_EMAILJS_TEMPLATE_ID", "template_bf01c6f");
  const doctorTemplateId = (import.meta as any).env?.["VITE_EMAILJS_TEMPLATE_DOCTOR_ID"] || defaultTemplateId;
  const patientTemplateId = (import.meta as any).env?.["VITE_EMAILJS_TEMPLATE_PATIENT_ID"] || defaultTemplateId;
  const publicKey = getEnv("VITE_EMAILJS_PUBLIC_KEY", "0fh2pGyc8qbcEp7qM");
  return { serviceId, doctorTemplateId, patientTemplateId, publicKey };
}

export async function sendDoctorCredentials(payload: DoctorCredentials) {
  const { serviceId, doctorTemplateId, publicKey } = getConfig();
  const templateParams = {
    to_name: payload.name,
    to_email: payload.email,
    subject: "MedRAX Doctor Access",
    greeting: `Welcome, Dr. ${payload.name}!`,
    body: `Your MedRAX account has been created. Use the following credentials to sign in.`,
    username: payload.username,
    password: payload.password,
    specialty: payload.specialty || "General",
    login_url: window.location.origin + "/login",
  } as Record<string, any>;
  return emailjs.send(serviceId, doctorTemplateId, templateParams, { publicKey });
}

export async function sendPatientCaseAccess(payload: PatientCaseAccess) {
  const { serviceId, patientTemplateId, publicKey } = getConfig();
  const origin = window.location.origin;
  const loginByCase = `${origin}/patient-login?caseId=${encodeURIComponent(payload.caseId)}`;
  const loginByEmail = `${origin}/patient-login?email=${encodeURIComponent(payload.email)}`;
  const templateParams = {
    to_name: payload.name || "Patient",
    to_email: payload.email,
    subject: "Your MedRAX Case Access",
    greeting: `Hello ${payload.name || "Patient"},`,
    body: `Your case has been created in MedRAX. You can access your reports using either method below:`,
    case_id: payload.caseId,
    dob_hint: payload.dob,
    login_by_case_url: loginByCase,
    login_by_email_url: loginByEmail,
    extra: `For security, we verify your Date of Birth (YYYY-MM-DD).`,
  } as Record<string, any>;
  return emailjs.send(serviceId, patientTemplateId, templateParams, { publicKey });
}
