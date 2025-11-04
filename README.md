<h1>🩺 MediVision — Multimodal AI for Real‑Time Chest X‑ray Diagnosis</h1>
<p>FastAPI + React app that combines a multimodal LLM with domain tools (classification, segmentation, VQA, grounding, report generation) to assist clinical CXR interpretation in real time.</p>
<p align="center"> <a href="https://arxiv.org/abs/2502.02673" target="_blank"><img src="https://img.shields.io/badge/arXiv-ICML 2025-FF6B6B?style=for-the-badge&logo=arxiv&logoColor=white" alt="arXiv"></a> <a href="https://github.com/bowang-lab/MedRAX"><img src="https://img.shields.io/badge/GitHub-Code-4A90E2?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"></a> <a href="https://huggingface.co/datasets/wanglab/chest-agent-bench"><img src="https://img.shields.io/badge/HuggingFace-Dataset-FFBF00?style=for-the-badge&logo=huggingface&logoColor=white" alt="HuggingFace Dataset"></a> </p>

![](assets/demo_fast.gif?autoplay=1)

<br>

## 📝 Abstract
MediVision is an intelligent, agentic system designed to assist clinicians or radiologists in interpreting chest X‑rays (CXRs) through natural language queries and multimodal reasoning. Built on a privacy‑conscious architecture, it integrates a powerful multimodal LLM (configurable: GPT‑4o, LLaVA‑Med, or local LLMs via Ollama) with a suite of specialized tools such as MedSAM, CheXagent, DenseNet‑121, SwinV2, Maira‑2, and optionally RoentGen to perform segmentation, classification, visual question answering, grounding, and report generation.

Using a ReAct‑style agent workflow via LangChain/LangGraph, MediVision dynamically selects and orchestrates tools to handle complex, multi‑step clinical queries. It supports memory‑aware interactions and optional persistence with MongoDB. The system can be evaluated with ChestAgentBench—a benchmark of 2,500 curated queries across 7 categories—demonstrating strong performance in diagnosis, localization, and visual explanation tasks.

MediVision improves diagnostic efficiency, supports medical education, and enables transparent, real‑time AI assistance in clinical workflows, making it a valuable tool in modern healthcare settings.

<br/>

## 🔑 Key Features
- 👨‍⚕️ Role‑aware assistant: doctor, patient, and general/teaching personas are injected server‑side.
- 📋 Structured output: concise “Findings” (top 3 ≥ 0.15 probability) and a single‑line “Impression”.
- 🧠 Multimodal reasoning: GPT‑4o/LLaVA‑Med or local LLMs + domain tools for segmentation, classification, grounding, VQA, and reporting.
- 🔄 Agentic execution: ReAct‑style tool selection/orchestration with streaming responses; tool chatter hidden.
- 👋 Greeting short‑circuit: simple greetings answered briefly without running tools.
- 🖼️ DICOM/image workflows: upload, preview, and stable rendering (persisted display paths) in chat and history.
- 🧵 Thread persistence: restore prior conversations with both user and assistant turns; no empty placeholders.
- 🛠️ Admin dashboard: create cases, assign doctors/lab techs, manage users.
- ✉️ Email notifications (EmailJS): separate doctor (credentials) and patient (case access) templates.
  - Doctors: credentials emailed immediately at creation (username=email; no insecure resend).
  - Patients: case access email with two login paths (Case ID + DOB, or Email + DOB).
- 🔒 Privacy‑minded: JWT auth, CORS, optional MongoDB persistence; designed to run behind TLS and RBAC.

<br/>

## 🧱 Architecture & Workflow
1. Requests enter FastAPI (`/api/*`) with JWT auth; role is derived from the token (doctor/patient/general).
2. The server injects the persona and enforces global output rules (no tool names, Findings/Impression format, conservative “normal” threshold).
3. The agent plans and invokes tools as needed (DICOM processing → classification → segmentation/grounding → reporting) while streaming tokens to the client.
4. The server persists user and assistant turns (including image `display_path`) and strips persona prefixes from history for clean display.
5. The React app renders conversation and images, manages threads, and exposes admin flows; EmailJS sends notifications on create/resend events.

Notes:
- Greetings/no‑image small talk bypasses tool calls for speed and UX.
- Tool names/outputs are never surfaced; replies synthesize findings in plain language.

<br/>

## 🛠️ Tech Stack
**Frontend**
- React 18, Vite, TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query

**Backend**
- FastAPI, Uvicorn, Pydantic, CORS, python‑multipart
- LangChain / LangGraph for agent flow and memory

**Database (optional)**
- MongoDB (Motor/PyMongo) for cases, threads, and user management

**Agent, Tools, and Models**
- **Multimodal LLM**: GPT‑4o or LLaVA‑Med; local LLMs via Ollama (e.g., Qwen2.5, Mistral)
- **Visual QA**: Utilizes CheXagent and LLaVA-Med for complex visual understanding and medical reasoning
- **Segmentation**: Employs MedSAM and PSPNet model trained on ChestX-Det for precise anatomical structure identification
- **Grounding**: Uses Maira-2 for localizing specific findings in medical images
- **Report Generation**: Implements SwinV2 Transformer trained on CheXpert Plus for detailed medical reporting
- **Disease Classification**: Leverages DenseNet-121 from TorchXRayVision for detecting 18 pathology classes
- **X-ray Generation**: Utilizes RoentGen for synthetic CXR generation
- **Utilities**: Includes DICOM processing, visualization tools, and custom plotting capabilities
<br><br>

**Evaluation**
- ChestAgentBench: 2,500 expert queries across 7 diagnostic categories

<br/>

## 👥 Target Users
- 🩺 Doctors / Radiologists — accelerate interpretation with structured findings and concise impressions.
- 🏥 Clinicians (ER, Pulmonology, ICU) — receive real‑time support on likely findings and next steps.
- 🎓 Students / Trainees — learn diagnostic reasoning via a general/teaching persona with explanations.
- 🛠️ Admins / IT — manage RBAC, cases, and deployment policies.
- 🔬 Researchers — study tool orchestration, agent behaviors, and benchmark performance.

<br/>

## ❓ Why Agentic Workflows
- 🏥 Handles complex, multi‑step clinical tasks via planning and tool chaining.
- 🔧 Combines multiple tools automatically (classification, segmentation, grounding, reporting).
- 💯 Improves accuracy and flexibility by adapting to the specific question and context.
- 🧠 Mimics clinical reasoning: “What’s the finding? Where is it? Has it changed?”
- 🔍 Enables comparisons over time (e.g., two CXRs) and subtle change detection.

<br/>

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- Optional CUDA/GPU for tool performance

### 1) Backend setup (FastAPI)
```powershell
# from repo root
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -e .

# optional environment
$env:JWT_SECRET = "change-me"
# Optional DB for persistence
# $env:MONGODB_URI = "mongodb://localhost:27017/medivision"
# Defer heavy model init
$env:LAZY_INIT = "true"

# run API on 8585
python -m uvicorn api:app --reload --port 8585
```

Common backend env vars:
- JWT_SECRET — HMAC secret for JWT auth (required for protected admin routes)
- MONGODB_URI — optional, enables Mongo persistence for cases/threads
- LAZY_INIT=true — defer agent/tool initialization until first request
- FORCE_INIT=true with LAZY_INIT — background init after startup
- OLLAMA_BASE_URL — set if using a local LLM through Ollama
- CUDA_AVAILABLE=true — hint to prefer GPU

### 2) Frontend setup (Vite React)
Create `frontend/.env` (or `.env.local`) with your API and EmailJS settings:
```
VITE_API_URL=http://localhost:8585

# EmailJS
VITE_EMAILJS_SERVICE_ID=service_xxx
VITE_EMAILJS_PUBLIC_KEY=public_xxx
# Optional fallback template
VITE_EMAILJS_TEMPLATE_ID=template_fallback
# Specific templates (recommended)
VITE_EMAILJS_TEMPLATE_DOCTOR_ID=template_doctor_xxx
VITE_EMAILJS_TEMPLATE_PATIENT_ID=template_patient_xxx
```

Then install and run:
```powershell
cd frontend
npm install
npm run dev
```

The app expects the API at `VITE_API_URL` (defaults to `http://localhost:8585`).

<br/>

## ✉️ Email Setup (EmailJS)
We use two templates, one for doctors and one for patients. In EmailJS:
- Create a service (SMTP or Gmail) and note its Service ID.
- Create two templates with Subject = `{{subject}}`.
- Doctor variables: `subject, greeting, body, username, password, specialty, login_url`.
- Patient variables: `subject, greeting, body, case_id, dob_hint, login_by_case_url, login_by_email_url`.
- Use a public logo URL in the template (browser clients can’t attach CID images).

Provide the Service ID and template IDs in the frontend `.env` as shown above. The app will:
- Send doctor credentials right after creation (uses the password entered at creation time)
- Send patient case access after case creation (two login options: Case ID + DOB, or Email + DOB)
- Case “Resend” uses EmailJS if patient email exists, otherwise falls back to backend
- Doctor “Resend” is intentionally removed for security (no plaintext password stored)

<br/>

## 🤝 Contributors
- @Akshaya05-code — Kadari Akshaya
- @pranavi-code — Ginnareddy Pranavi Reddy
- @gouniaksharareddy — Gouni Akshara Reddy
- @Tejaswi-g — Gillella Tejaswi
- @guntishivani — Gunti Shivani

