import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, makeApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { sendDoctorCredentials, sendPatientCaseAccess } from "@/lib/email";
// Confirm dialog removed as we no longer archive cases here

type Doctor = { _id: string; name: string; email: string; specialty?: string; active?: boolean };
type LabTech = { _id: string; name: string; email: string; active?: boolean };
type CaseItem = { _id: string; caseId: string; patient: any; assignedDoctorId?: string; assignedLabTechId?: string; status: string; createdAt?: string };
type Patient = { _id: string; name?: string; dob?: string; phone?: string; email?: string };
// Settings removed per requirements (no brand/settings UI in Admin)

export default function AdminDashboard() {
	const { token } = useAuth();
	const location = useLocation();
	const authApi = useMemo(() => makeApi(token || undefined), [token]);
		const { toast } = useToast();

	// Derive section from route path: /admin, /admin/cases, /admin/doctors, /admin/labtechs, /admin/patients
	const pathLast = location.pathname.split("/").filter(Boolean).pop();
	const tab: "cases" | "doctors" | "labtechs" | "patients" =
		pathLast === "doctors" || pathLast === "labtechs" || pathLast === "patients" ? (pathLast as any) : "cases";

	// Shared lists
	const [doctors, setDoctors] = useState<Doctor[]>([]);
	const [labtechs, setLabtechs] = useState<LabTech[]>([]);

	// Cases tab state
	const [cases, setCases] = useState<CaseItem[]>([]);
	const [caseQuery, setCaseQuery] = useState<string>("");
	const [creatingCase, setCreatingCase] = useState(false);
	const [newCase, setNewCase] = useState({
		patient: { name: "", dob: "", phone: "", email: "" },
		assignedDoctorId: "",
		assignedLabTechId: "",
	});
		const [loadingCases, setLoadingCases] = useState(false);
		const [casePage, setCasePage] = useState(0);
		const [casePageSize, setCasePageSize] = useState(20);
		// Removed stats/total counters per requirements
			const [busyCaseId, setBusyCaseId] = useState<string | null>(null);
			const [busyDoctorId, setBusyDoctorId] = useState<string | null>(null);
			const [busyLabId, setBusyLabId] = useState<string | null>(null);
			const [creatingBusy, setCreatingBusy] = useState(false);
			// confirm state removed (no archive flow)
			const [caseSort, setCaseSort] = useState<{ key: "createdAt" | "caseId" | "status"; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
			const [debouncedCaseQuery, setDebouncedCaseQuery] = useState("");

	// Doctors tab state
	const [newDoctor, setNewDoctor] = useState({ name: "", email: "", password: "", specialty: "" });
	const [loadingDoctors, setLoadingDoctors] = useState(false);
	const [showAddDoctor, setShowAddDoctor] = useState(false);

	// Lab tech tab state
	const [newLabTech, setNewLabTech] = useState({ name: "", email: "" });
	const [loadingLabtechs, setLoadingLabtechs] = useState(false);
	const [showAddLab, setShowAddLab] = useState(false);

	// Patients tab
	const [patientQuery, setPatientQuery] = useState("");
	const [patients, setPatients] = useState<Patient[]>([]);
	const [loadingPatients, setLoadingPatients] = useState(false);

// Settings removed

	useEffect(() => {
		// Prefetch doctors and labtechs for forms
		refreshDoctors();
		refreshLabTechs();
	}, []);

	useEffect(() => {
		refreshCases();
			}, [debouncedCaseQuery, casePage, casePageSize]);

		// removed stats refresh

			useEffect(() => {
				const t = setTimeout(() => setDebouncedCaseQuery(caseQuery), 300);
				return () => clearTimeout(t);
			}, [caseQuery]);

	async function refreshCases() {
		try {
			setLoadingCases(true);
			const q: string[] = [];
			if (caseQuery) q.push(`q=${encodeURIComponent(caseQuery)}`);
			const qs = q.length ? `?${q.join("&")}` : "";
							const res = await authApi.get<{ items: CaseItem[] }>(`/api/cases${qs}${qs ? "&" : "?"}skip=${casePage*casePageSize}&limit=${casePageSize}`);
							let fetched = res.items || [];
							// client-side sort for now
							fetched = [...fetched].sort((a,b)=>{
								const dir = caseSort.dir === "asc" ? 1 : -1;
								if (caseSort.key === "createdAt") return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
								if (caseSort.key === "caseId") return a.caseId.localeCompare(b.caseId) * dir;
								return 0;
							});
							setCases(fetched);
					// total count omitted (stats removed); rely on page size heuristics
		} catch (e) {
			// noop
		} finally {
			setLoadingCases(false);
		}
	}


	async function refreshDoctors() {
		try {
			setLoadingDoctors(true);
			const res = await api.get<{ items: Doctor[] }>("/api/doctors");
			setDoctors(res.items || []);
		} finally {
			setLoadingDoctors(false);
		}
	}

	async function refreshLabTechs() {
		try {
			setLoadingLabtechs(true);
			const res = await api.get<{ items: LabTech[] }>("/api/labtechs");
			setLabtechs(res.items || []);
		} finally {
			setLoadingLabtechs(false);
		}
	}

	async function onCreateCase(e: React.FormEvent) {
		e.preventDefault();
				setCreatingBusy(true);
				const res = await authApi.post<{ ok: boolean; caseId: string }>("/api/cases", {
			patient: newCase.patient,
			assignedDoctorId: newCase.assignedDoctorId || undefined,
			assignedLabTechId: newCase.assignedLabTechId || undefined,
		});
		setNewCase({ patient: { name: "", dob: "", phone: "", email: "" }, assignedDoctorId: "", assignedLabTechId: "" });
		setCreatingCase(false);
		await refreshCases();
			toast({ description: `Case ${res.caseId} created` });
			// Send patient case access email if email is present
			try {
				if (newCase.patient.email) {
					await sendPatientCaseAccess({
						name: newCase.patient.name,
						email: newCase.patient.email,
						caseId: res.caseId,
						dob: newCase.patient.dob || "",
					});
					toast({ description: `Access email sent to ${newCase.patient.email}` });
				}
			} catch (err) {
				// Non-blocking: log and continue
				console.warn("Failed to send patient access email", err);
			}
				setCreatingBusy(false);
	}

// Archive removed per requirements

	async function onAssign(caseId: string, doctorId?: string, labId?: string) {
				setBusyCaseId(caseId);
				await authApi.patch(`/api/cases/${encodeURIComponent(caseId)}/assign`, {
			assignedDoctorId: doctorId,
			assignedLabTechId: labId,
		});
				await refreshCases();
			toast({ description: `Assignment updated` });
				setBusyCaseId(null);
	}

	async function onAddDoctor(e: React.FormEvent) {
		e.preventDefault();
				setBusyDoctorId("new");
				await authApi.post("/api/doctors", newDoctor);
		setNewDoctor({ name: "", email: "", password: "", specialty: "" });
		await refreshDoctors();
			toast({ description: `Doctor added` });
			// Proactively email credentials using EmailJS (username = email)
			try {
				await sendDoctorCredentials({
					name: newDoctor.name,
					email: newDoctor.email,
					username: newDoctor.email,
					password: newDoctor.password,
					specialty: newDoctor.specialty,
				});
				toast({ description: `Credentials emailed to ${newDoctor.email}` });
			} catch (err) {
				console.warn("Failed to send doctor credentials via EmailJS", err);
			}
				setBusyDoctorId(null);
	}

	async function onToggleDoctor(id: string) {
				setBusyDoctorId(id);
				await authApi.patch(`/api/doctors/${id}/toggle`);
		await refreshDoctors();
			toast({ description: `Doctor updated` });
				setBusyDoctorId(null);
	}

// Removed doctor resend flow per requirements

	async function onAddLabTech(e: React.FormEvent) {
		e.preventDefault();
				setBusyLabId("new");
				await authApi.post("/api/labtechs", newLabTech);
		setNewLabTech({ name: "", email: "" });
		await refreshLabTechs();
			toast({ description: `Lab tech added` });
				setBusyLabId(null);
	}

	async function onToggleLabTech(id: string) {
				setBusyLabId(id);
				await authApi.patch(`/api/labtechs/${id}/toggle`);
				await refreshLabTechs();
				toast({ description: `Lab tech updated` });
				setBusyLabId(null);
	}

	async function searchPatients() {
		setLoadingPatients(true);
		try {
			const res = await api.get<{ items: Patient[] }>(`/api/patients?q=${encodeURIComponent(patientQuery)}`);
			setPatients(res.items || []);
		} finally {
			setLoadingPatients(false);
		}
	}

	// Auto-load patients list on first visit
	useEffect(() => {
		searchPatients();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function updatePatient(p: Patient) {
			await authApi.patch(`/api/patients/${p._id}`, {
			name: p.name, dob: p.dob, phone: p.phone, email: p.email,
		});
		await searchPatients();
			toast({ description: `Patient saved` });
	}

	// Settings removed

	return (
		<div className="min-h-screen bg-background">
			<main className="mx-auto max-w-7xl px-6 py-8">

				{tab === "cases" && (
					<section className="space-y-6">
						<div className="rounded-lg border p-4 bg-card">
							<div className="flex items-end gap-3 flex-wrap">
								<div className="flex-1 min-w-56">
									<Label>Search</Label>
									<Input placeholder="name, phone, email, Case ID" value={caseQuery} onChange={(e)=>setCaseQuery(e.target.value)} />
								</div>
								<Button onClick={()=>setCreatingCase(v=>!v)} variant="default">{creatingCase?"Close":"New Case"}</Button>
							</div>
							{creatingCase && (
								<form onSubmit={onCreateCase} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<Label>Patient Name</Label>
										<Input value={newCase.patient.name} onChange={(e)=>setNewCase({...newCase, patient:{...newCase.patient, name:e.target.value}})} required />
									</div>
									<div>
										<Label>DOB</Label>
										<Input value={newCase.patient.dob} onChange={(e)=>setNewCase({...newCase, patient:{...newCase.patient, dob:e.target.value}})} placeholder="YYYY-MM-DD" />
									</div>
									<div>
										<Label>Phone</Label>
										<Input value={newCase.patient.phone} onChange={(e)=>setNewCase({...newCase, patient:{...newCase.patient, phone:e.target.value}})} />
									</div>
									<div>
										<Label>Email</Label>
										<Input type="email" value={newCase.patient.email} onChange={(e)=>setNewCase({...newCase, patient:{...newCase.patient, email:e.target.value}})} />
									</div>
									<div>
										<Label>Assign Doctor</Label>
										<select className="mt-1 border rounded h-9 px-2 bg-background w-full" value={newCase.assignedDoctorId} onChange={(e)=>setNewCase({...newCase, assignedDoctorId:e.target.value})} required>
											<option value="">Select...</option>
											{doctors.map(d => <option key={d._id} value={d._id}>{d.name} ({d.email})</option>)}
										</select>
									</div>
									<div>
										<Label>Assign Lab Tech (optional)</Label>
										<select className="mt-1 border rounded h-9 px-2 bg-background w-full" value={newCase.assignedLabTechId} onChange={(e)=>setNewCase({...newCase, assignedLabTechId:e.target.value})}>
											<option value="">None</option>
											{labtechs.map(l => <option key={l._id} value={l._id}>{l.name} ({l.email})</option>)}
										</select>
									</div>
									<div className="md:col-span-2"><Button type="submit">Create Case</Button></div>
								</form>
							)}
						</div>

						<div className="rounded-lg border overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-muted/50">
									<tr>
										<th className="text-left p-3 cursor-pointer select-none" onClick={()=>setCaseSort(s=>({ key: "caseId", dir: s.key==="caseId" && s.dir==="asc"?"desc":"asc" }))}>Case ID {caseSort.key==="caseId"? (caseSort.dir==="asc"?"↑":"↓"):""}</th>
										<th className="text-left p-3">Patient</th>
										<th className="text-left p-3">Doctor</th>
										<th className="text-left p-3">Lab Tech</th>
										<th className="text-left p-3 cursor-pointer select-none" onClick={()=>setCaseSort(s=>({ key: "createdAt", dir: s.key==="createdAt" && s.dir==="asc"?"desc":"asc" }))}>Created {caseSort.key==="createdAt"? (caseSort.dir==="asc"?"↑":"↓"):""}</th>
										<th className="text-right p-3">Actions</th>
									</tr>
								</thead>
								<tbody>
									{loadingCases && (
										<tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading...</td></tr>
									)}
									{!loadingCases && cases.map((c)=>{
										const doc = doctors.find(d=>d._id===c.assignedDoctorId);
										const lab = labtechs.find(l=>l._id===c.assignedLabTechId);
										return (
											<tr key={c._id} className="border-t">
												<td className="p-3 font-mono">{c.caseId}</td>
												<td className="p-3">{c.patient?.name}</td>
												<td className="p-3">{doc? doc.name: "—"}</td>
												<td className="p-3">{lab? lab.name: "—"}</td>
												<td className="p-3">{c.createdAt?.slice(0,10) || ""}</td>
																		<td className="p-3 text-right flex gap-2 justify-end">
																										<Button variant="outline" size="sm" disabled={busyCaseId===c.caseId} onClick={()=>{ navigator.clipboard.writeText(c.caseId); toast({ description: `Copied ${c.caseId}`}); }}>{busyCaseId===c.caseId?"...":"Copy ID"}</Button>
																										<Button
																											variant="outline"
																											size="sm"
																											disabled={busyCaseId===c.caseId}
																											onClick={async ()=>{
																												setBusyCaseId(c.caseId);
																												try {
																													if (c.patient?.email) {
																														await sendPatientCaseAccess({
																															name: c.patient?.name || "",
																															email: c.patient?.email,
																															caseId: c.caseId,
																															dob: c.patient?.dob || "",
																														});
																														toast({ description: `Instructions resent to ${c.patient?.email}` });
																													} else {
																														await authApi.post(`/api/cases/${c.caseId}/resend`);
																														toast({ description: "Instructions resent" });
																													}
																												} catch (err) {
																													console.warn("Failed to resend via EmailJS, falling back", err);
																													try {
																														await authApi.post(`/api/cases/${c.caseId}/resend`);
																														toast({ description: "Instructions resent" });
																													} catch {}
																												}
																												setBusyCaseId(null);
																											}}
																										>
																											{busyCaseId===c.caseId?"...":"Resend"}
																										</Button>
																										<select className="border rounded h-9 px-2 bg-background" disabled={busyCaseId===c.caseId} value={c.assignedDoctorId || ""} onChange={(e)=>onAssign(c.caseId, e.target.value || undefined, c.assignedLabTechId)}>
														<option value="">Unassigned</option>
														{doctors.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
													</select>
																										<select className="border rounded h-9 px-2 bg-background" disabled={busyCaseId===c.caseId} value={c.assignedLabTechId || ""} onChange={(e)=>onAssign(c.caseId, c.assignedDoctorId, e.target.value || undefined)}>
																				<option value="">No Lab</option>
																				{labtechs.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
																			</select>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
												<div className="flex items-center justify-between mt-3 text-sm">
													<div className="text-muted-foreground">Page {casePage+1}</div>
													<div className="flex items-center gap-2">
														<Button variant="outline" size="sm" disabled={casePage===0} onClick={()=>setCasePage(p=>Math.max(0,p-1))}>Prev</Button>
														<Button variant="outline" size="sm" onClick={()=>setCasePage(p=>p+1)} disabled={!loadingCases && cases.length < casePageSize}>Next</Button>
														<select className="border rounded h-9 px-2 bg-background" value={casePageSize} onChange={(e)=>{ setCasePageSize(parseInt(e.target.value)||20); setCasePage(0); }}>
															<option value={10}>10</option>
															<option value={20}>20</option>
															<option value={50}>50</option>
														</select>
													</div>
												</div>
					</section>
				)}

				{tab === "doctors" && (
					<section className="space-y-6">
						<div className="flex items-center justify-between">
							<h2 className="text-base font-semibold">Doctors</h2>
							<Button variant="default" size="sm" onClick={()=>setShowAddDoctor(v=>!v)}>{showAddDoctor?"Close":"New Doctor"}</Button>
						</div>
						{showAddDoctor && (
						<form onSubmit={onAddDoctor} className="rounded-lg border p-4 bg-card grid grid-cols-1 md:grid-cols-4 gap-4">
							<div>
								<Label>Name</Label>
								<Input value={newDoctor.name} onChange={(e)=>setNewDoctor({...newDoctor, name:e.target.value})} required />
							</div>
							<div>
								<Label>Email</Label>
								<Input type="email" value={newDoctor.email} onChange={(e)=>setNewDoctor({...newDoctor, email:e.target.value})} required />
							</div>
							<div>
								<Label>Password</Label>
								<Input type="password" value={newDoctor.password} onChange={(e)=>setNewDoctor({...newDoctor, password:e.target.value})} minLength={6} required />
							</div>
							<div>
								<Label>Specialty</Label>
								<Input value={newDoctor.specialty} onChange={(e)=>setNewDoctor({...newDoctor, specialty:e.target.value})} />
							</div>
							<div className="md:col-span-4"><Button type="submit">Add Doctor</Button></div>
						</form>
						)}

						<div className="rounded-lg border overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-muted/50"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Specialty</th><th className="text-left p-3">Active</th><th className="text-right p-3">Actions</th></tr></thead>
								<tbody>
									{doctors.map(d => (
										<tr key={d._id} className="border-t">
											<td className="p-3">{d.name}</td>
											<td className="p-3">{d.email}</td>
											<td className="p-3">{d.specialty || "—"}</td>
											<td className="p-3">{d.active?"Yes":"No"}</td>
											<td className="p-3 text-right flex gap-2 justify-end">
												<Button variant="outline" size="sm" disabled={busyDoctorId===d._id} onClick={()=>onToggleDoctor(d._id)}>{busyDoctorId===d._id?"...":(d.active?"Deactivate":"Activate")}</Button>
															{/* Resend credentials button removed per requirements */}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="text-xs text-muted-foreground">Note: Emails are sent only if SMTP is configured on the server; otherwise they are logged for development.</p>
					</section>
				)}

				{tab === "labtechs" && (
					<section className="space-y-6">
						<div className="flex items-center justify-between">
							<h2 className="text-base font-semibold">Lab Technicians</h2>
							<Button variant="default" size="sm" onClick={()=>setShowAddLab(v=>!v)}>{showAddLab?"Close":"New Lab Tech"}</Button>
						</div>
						{showAddLab && (
						<form onSubmit={onAddLabTech} className="rounded-lg border p-4 bg-card grid grid-cols-1 md:grid-cols-3 gap-4">
							<div>
								<Label>Name</Label>
								<Input value={newLabTech.name} onChange={(e)=>setNewLabTech({...newLabTech, name:e.target.value})} required />
							</div>
							<div>
								<Label>Email</Label>
								<Input type="email" value={newLabTech.email} onChange={(e)=>setNewLabTech({...newLabTech, email:e.target.value})} required />
							</div>
							<div className="md:col-span-3"><Button type="submit">Add Lab Tech</Button></div>
						</form>
						)}

						<div className="rounded-lg border overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-muted/50"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Active</th><th className="text-right p-3">Actions</th></tr></thead>
								<tbody>
									{labtechs.map(l => (
										<tr key={l._id} className="border-t">
											<td className="p-3">{l.name}</td>
											<td className="p-3">{l.email}</td>
											<td className="p-3">{l.active?"Yes":"No"}</td>
											<td className="p-3 text-right flex gap-2 justify-end">
												<Button variant="outline" size="sm" disabled={busyLabId===l._id} onClick={()=>onToggleLabTech(l._id)}>{busyLabId===l._id?"...":(l.active?"Deactivate":"Activate")}</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}

				{tab === "patients" && (
					<section className="space-y-4">
						<div className="flex gap-2">
							<Input placeholder="Search name/phone/email" value={patientQuery} onChange={(e)=>setPatientQuery(e.target.value)} />
							<Button onClick={searchPatients}>Search</Button>
						</div>
						<div className="rounded-lg border overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-muted/50"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">DOB</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Email</th><th className="text-right p-3">Save</th></tr></thead>
								<tbody>
									{patients.map((p, idx) => (
										<tr key={p._id} className="border-t">
											<td className="p-3"><Input value={p.name||""} onChange={(e)=>setPatients(prev=>prev.map((x,i)=>i===idx?{...x, name:e.target.value}:x))} /></td>
											<td className="p-3"><Input value={p.dob||""} onChange={(e)=>setPatients(prev=>prev.map((x,i)=>i===idx?{...x, dob:e.target.value}:x))} /></td>
											<td className="p-3"><Input value={p.phone||""} onChange={(e)=>setPatients(prev=>prev.map((x,i)=>i===idx?{...x, phone:e.target.value}:x))} /></td>
											<td className="p-3"><Input value={p.email||""} onChange={(e)=>setPatients(prev=>prev.map((x,i)=>i===idx?{...x, email:e.target.value}:x))} /></td>
											<td className="p-3 text-right"><Button size="sm" onClick={()=>updatePatient(p)}>Save</Button></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}

				{/* Settings and confirm dialog removed */}
			</main>
		</div>
	);
}
