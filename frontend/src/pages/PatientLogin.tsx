import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function PatientLogin() {
	const nav = useNavigate();
	const location = useLocation();
	const { setSession } = useAuth();
	const [mode, setMode] = useState<"case"|"email">("case");
	const [caseId, setCaseId] = useState("");
	const [email, setEmail] = useState("");
	const [dob, setDob] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	// Prefill caseId from query param if present (e.g., /patient-login?caseId=CX20250001)
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const cid = params.get("caseId") || "";
		const em = params.get("email") || "";
		if (cid) { setCaseId(cid); setMode("case"); }
		else if (em) { setEmail(em); setMode("email"); }
	}, [location.search]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);
		try {
			const payload: any = { dob };
			if (mode === "case") payload.caseId = caseId; else payload.email = email;
			const res = await api.post<{ ok: boolean; token: string; user: any }>("/api/patient/login", payload);
			// Update global auth context so protected routes allow access immediately
			setSession(res.user, res.token);
			// If it was a caseId login, go straight to that case; else go to list
			if (mode === "case" && caseId) nav(`/patient/cases/${encodeURIComponent(caseId)}`, { replace: true });
			else nav("/patient/cases", { replace: true });
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
					<Button variant={mode==="email"?"default":"outline"} size="sm" onClick={()=>setMode("email")}>By Email</Button>
				</div>
				<form onSubmit={onSubmit} className="space-y-3">
					{mode === "case" ? (
						<Input placeholder="Case ID (e.g., CX20250001)" value={caseId} onChange={(e)=>setCaseId(e.target.value)} required />
					) : (
						<Input placeholder="Email (used during case creation)" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
					)}
					<Input placeholder="DOB (YYYY-MM-DD)" value={dob} onChange={(e)=>setDob(e.target.value)} required />
					<Button type="submit" disabled={loading}>{loading?"Verifying...":"Continue"}</Button>
				</form>
				{error && <div className="mt-3 text-sm text-red-600">{error}</div>}
				<div className="mt-3 text-xs text-muted-foreground">We’ll verify your details and take you to your case(s).</div>
				<div className="mt-4 text-center text-sm text-muted-foreground">
					Are you staff (admin/doctor/lab)?{" "}
					<Link to="/login" className="text-primary hover:underline font-medium">Sign in here</Link>
				</div>
			</div>
		</div>
	);
}
