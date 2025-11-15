import emailjs from "@emailjs/browser";

// Reading your EmailJS keys from .env.local
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_DOCTOR = import.meta.env.VITE_EMAILJS_TEMPLATE_DOCTOR;
const TEMPLATE_PATIENT = import.meta.env.VITE_EMAILJS_TEMPLATE_PATIENT;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// Function to send Doctor Credentials Email
export async function sendDoctorCredentials({
    name,
    email,
    username,
    password,
    specialty
}) {
    try {
        return await emailjs.send(
            SERVICE_ID,
            TEMPLATE_DOCTOR,
            {
                to_name: name,
                to_email: email,
                username,
                password,
                specialty,
            },
            PUBLIC_KEY
        );
    } catch (error) {
        console.error("Error sending doctor email:", error);
        throw error;
    }
}

// Function to send Patient Case Access Email
export async function sendPatientCaseAccess({
    name,
    email,
    caseId,
    dob
}) {
    try {
        return await emailjs.send(
            SERVICE_ID,
            TEMPLATE_PATIENT,
            {
                to_name: name,
                to_email: email,
                caseId,
                dob,
            },
            PUBLIC_KEY
        );
    } catch (error) {
        console.error("Error sending patient email:", error);
        throw error;
    }
}
