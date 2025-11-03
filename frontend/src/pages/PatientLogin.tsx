import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

export default function PatientLogin() {
	const nav = useNavigate();
	const [mode, setMode] = useState<"case"|"patient">("case");
	const [caseId, setCaseId] = useState("");
	const [patientId, setPatientId] = useState("");
	const [dob, setDob] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);
		try {
			const payload: any = { dob: dob };
			if (mode === "case") payload.caseId = caseId; else payload.patientId = patientId;
			const res = await api.post<{ ok: boolean; token: string; user: any }>("/api/patient/login", payload);
			localStorage.setItem("auth.token", res.token);
			localStorage.setItem("auth.user", JSON.stringify(res.user));
			nav("/patient/cases", { replace: true });
		} catch (e: any) {
			setError(e?.message || "Not found");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-background p-6">
			<div className="w-full max-w-lg border rounded-xl p-6 bg-card">
				<h1 className="text-xl font-semibold mb-4">Patient Access</h1>
				<div className="flex gap-2 mb-3 text-sm">
					<Button variant={mode==="case"?"default":"outline"} size="sm" onClick={()=>setMode("case")}>By Case ID</Button>
					<Button variant={mode==="patient"?"default":"outline"} size="sm" onClick={()=>setMode("patient")}>By Patient ID</Button>
				</div>
				<form onSubmit={onSubmit} className="space-y-3">
					{mode === "case" ? (
						<Input placeholder="Case ID (e.g., CX20250001)" value={caseId} onChange={(e)=>setCaseId(e.target.value)} required />
					) : (
						<Input placeholder="Patient ID (from message)" value={patientId} onChange={(e)=>setPatientId(e.target.value)} required />
					)}
					<Input placeholder="DOB (YYYY-MM-DD)" value={dob} onChange={(e)=>setDob(e.target.value)} required />
					<Button type="submit" disabled={loading}>{loading?"Verifying...":"Continue"}</Button>
				</form>
				{error && <div className="mt-3 text-sm text-red-600">{error}</div>}
				<div className="mt-3 text-xs text-muted-foreground">We’ll verify your details and take you to your case(s).</div>
			</div>
		</div>
	);
}
