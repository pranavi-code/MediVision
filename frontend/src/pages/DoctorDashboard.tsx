import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import AuthorizedImage from "@/components/AuthorizedImage";

type CaseItem = {
  _id: string;
  caseId: string;
  status: string;
  createdAt?: string;
  patient?: { name?: string; dob?: string };
  ai_analysis?: { summary?: string; display_path?: string };
};

export default function DoctorDashboard() {
  const { user, logout, token } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCase, setActiveCase] = useState<CaseItem | null>(null);
  const [filter, setFilter] = useState("");
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [storeInDb, setStoreInDb] = useState(true);
  const [images, setImages] = useState<any[]>([]);
  const [selectedModality, setSelectedModality] = useState<string>("");
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [repContent, setRepContent] = useState("");
  const [aiAgreement, setAiAgreement] = useState<string>("");
  const [diagnosis, setDiagnosis] = useState("");
  const [recs, setRecs] = useState<string[]>([]);
  const [savingReport, setSavingReport] = useState(false);
  const [historyText, setHistoryText] = useState("");
  const [symptomsText, setSymptomsText] = useState("");
  const [notifCounts, setNotifCounts] = useState<{new_images:number; new_analyses:number}>({new_images:0,new_analyses:0});
  const [notifSince, setNotifSince] = useState<string>("");

  const recOptions = [
    "Follow-up CT",
    "Antibiotics",
    "Cardiology referral",
    "Pulmonology referral",
  ];

  async function loadCases() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8585/api/doctor/cases", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCases(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCases(); }, [token]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return cases.filter(c => {
      const matchesText = !q || c.caseId.toLowerCase().includes(q) || (c.patient?.name||"").toLowerCase().includes(q);
      if (!matchesText) return false;
      // Modality from images
      const imgs: any[] = (c as any).images || [];
      const hasModality = modalityFilter === 'all' || imgs.some(im => String(im?.modality||'').toUpperCase() === modalityFilter.toUpperCase());
      if (!hasModality) return false;
      // Score from ai_analysis.confidence
      const conf = (c as any).ai_analysis?.confidence as number | undefined;
      if (scoreFilter === 'all') return true;
      if (typeof conf !== 'number') return false;
      if (scoreFilter === 'high') return conf >= 70;
      if (scoreFilter === 'medium') return conf >= 40 && conf < 70;
      if (scoreFilter === 'low') return conf < 40;
      return true;
    });
  }, [cases, filter, modalityFilter, scoreFilter]);

  async function openCase(c: CaseItem) {
    setActiveCase(c);
    setHistoryText((c as any)?.history || "");
    setSymptomsText((c as any)?.symptoms || "");
    // load images
    if (token) {
      try {
        const res = await fetch(`http://localhost:8585/api/doctor/cases/${c.caseId}/images`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        setImages(d.items || []);
      } catch {}
      try {
        const rr = await fetch(`http://localhost:8585/api/doctor/cases/${c.caseId}/reports`, { headers: { Authorization: `Bearer ${token}` } });
        const dj = await rr.json();
        setReports(dj.items || []);
        setSelectedReport(null);
        setRepContent("");
        setAiAgreement("");
        setDiagnosis("");
        setRecs([]);
      } catch {}
    }
  }

  async function runAnalysis() {
    if (!activeCase || !token) return;
    setAnalyzing(activeCase.caseId);
    try {
      const res = await fetch(`http://localhost:8585/api/doctor/cases/${activeCase.caseId}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setActiveCase(a => a ? { ...a, ai_analysis: d.analysis } : a);
        // also refresh list
        loadCases();
        toast({ title: "Analysis Completed", description: "AI analysis is ready for this case." });
      }
    } finally {
      setAnalyzing(null);
    }
  }

  async function saveCaseDetails() {
    if (!activeCase || !token) return;
    try {
      await fetch(`http://localhost:8585/api/doctor/cases/${activeCase.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ history: historyText, symptoms: symptomsText })
      });
      toast({ title: "Case Details Saved" });
    } catch {}
  }

  function toggleRec(option: string) {
    setRecs(prev => prev.includes(option) ? prev.filter(x=>x!==option) : [...prev, option]);
  }

  function editReport(r: any | null) {
    setSelectedReport(r);
    if (r) {
      setRepContent(r.content || "");
      setAiAgreement(r.aiAgreement || "");
      setDiagnosis(r.diagnosis || "");
      setRecs(r.recommendations || []);
    } else {
      setRepContent("");
      setAiAgreement("");
      setDiagnosis("");
      setRecs([]);
    }
  }

  async function saveReport(finalize: boolean) {
    if (!activeCase || !token) return;
    setSavingReport(true);
    try {
      const payload: any = {
        content: repContent,
        status: finalize ? "final" : (selectedReport?.status || "draft"),
        aiAgreement: aiAgreement || null,
        diagnosis: diagnosis || null,
        recommendations: recs || [],
      };
      if (selectedReport) {
        const res = await fetch(`http://localhost:8585/api/doctor/cases/${activeCase.caseId}/reports/${selectedReport._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const dj = await fetch(`http://localhost:8585/api/doctor/cases/${activeCase.caseId}/reports`, { headers: { Authorization: `Bearer ${token}` } });
          const rr = await dj.json();
          setReports(rr.items || []);
          toast({ title: finalize ? "Report Finalized" : "Draft Saved" });
        }
      } else {
        const res = await fetch(`http://localhost:8585/api/doctor/cases/${activeCase.caseId}/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const dj = await fetch(`http://localhost:8585/api/doctor/cases/${activeCase.caseId}/reports`, { headers: { Authorization: `Bearer ${token}` } });
          const rr = await dj.json();
          setReports(rr.items || []);
          toast({ title: finalize ? "Report Finalized" : "Draft Saved" });
        }
      }
    } finally {
      setSavingReport(false);
    }
  }

  // Notifications poller
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const poll = async () => {
      try {
        const url = new URL("http://localhost:8585/api/doctor/notifications");
        if (notifSince) url.searchParams.set("since", notifSince);
        const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
        if (!mounted) return;
        if (res.ok) {
          const d = await res.json();
          setNotifCounts({ new_images: d.new_images || 0, new_analyses: d.new_analyses || 0 });
          setNotifSince(d.since || new Date().toISOString());
        }
      } catch {}
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => { mounted = false; clearInterval(t); };
  }, [token]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-primary/15" />
            <div className="font-semibold">Doctor Workspace</div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/upload" className="underline">MedRAX Assistant</Link>
            <span>{(user?.name && !user.name.includes("@")) ? `Dr. ${user.name}` : (user?.email ? `Dr. ${user.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c=>c.toUpperCase())}` : "Doctor")}</span>
            <Button variant="outline" size="sm" onClick={() => { logout(); nav("/login"); }}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overview */}
        <section className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 -mt-4">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Total Cases</div>
            <div className="text-2xl font-semibold">{cases.length}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-2xl font-semibold">{cases.filter(c=>String(c.status||"").toLowerCase().includes("pending")).length}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-2xl font-semibold">{cases.filter(c=>String(c.status||"").toLowerCase().includes("complete")).length}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">New</div>
            <div className="text-2xl font-semibold">+{notifCounts.new_images + notifCounts.new_analyses}</div>
          </div>
        </section>
        {/* Left: Cases list */}
        <section className="lg:col-span-1 rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">My Cases</div>
            <Input placeholder="Search by case or name" value={filter} onChange={(e)=>setFilter(e.target.value)} className="h-9 w-44" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <select className="border rounded h-9 text-sm px-2" value={modalityFilter} onChange={(e)=>setModalityFilter(e.target.value)}>
              <option value="all">All Modalities</option>
              <option value="DX">DX</option>
              <option value="CR">CR</option>
              <option value="CT">CT</option>
            </select>
            <select className="border rounded h-9 text-sm px-2" value={scoreFilter} onChange={(e)=>setScoreFilter(e.target.value)}>
              <option value="all">All Scores</option>
              <option value="high">High (≥70)</option>
              <option value="medium">Medium (40-69)</option>
              <option value="low">Low (&lt;40)</option>
            </select>
            <div className="text-xs text-muted-foreground flex items-center justify-end">{filtered.length} shown</div>
          </div>
          <div className="divide-y">
            {loading && <div className="text-sm text-muted-foreground p-2">Loading…</div>}
            {!loading && filtered.length===0 && <div className="text-sm text-muted-foreground p-2">No cases</div>}
            {filtered.map(c => (
              <button key={c._id} className={`w-full text-left p-3 hover:bg-muted rounded ${activeCase?.caseId===c.caseId ? "bg-muted" : ""}`} onClick={()=>openCase(c)}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">{c.caseId}</div>
                  <div className="text-xs text-muted-foreground">{new Date(c.createdAt||'').toLocaleString()}</div>
                </div>
                <div className="text-sm">{c.patient?.name || "Unknown"}</div>
                <div className="text-xs text-muted-foreground">
                  {(c as any).images?.[0]?.modality ? `Modality: ${(c as any).images?.[0]?.modality}` : ''}
                  {typeof (c as any).ai_analysis?.confidence === 'number' ? ` · AI ${Math.round((c as any).ai_analysis?.confidence)}%` : ''}
                </div>
                <div className="text-xs text-muted-foreground">{c.status}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Right: Case details */}
        <section className="lg:col-span-2 rounded-lg border p-4 min-h-[400px]">
          {!activeCase && (
            <div className="text-sm text-muted-foreground">Select a case to view details.</div>
          )}
          {activeCase && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold">Case {activeCase.caseId}</div>
                  <div className="text-sm text-muted-foreground">Patient: {activeCase.patient?.name || 'Unknown'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={()=>nav(`/upload?caseId=${encodeURIComponent(activeCase.caseId)}`)}>Open MedRAX</Button>
                  <Button onClick={runAnalysis} disabled={analyzing===activeCase.caseId}>{analyzing===activeCase.caseId?"Analyzing…":"Run AI Analysis"}</Button>
                </div>
              </div>

              {activeCase.ai_analysis ? (
                <div className="rounded border p-3">
                  <div className="font-medium mb-2">AI Analysis</div>
                  {activeCase.ai_analysis.display_path && (
                    <img src={`http://localhost:8585${activeCase.ai_analysis.display_path}`} className="max-h-64 rounded border mb-2 object-contain" />
                  )}
                  <div className="whitespace-pre-wrap text-sm">{activeCase.ai_analysis.summary}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No AI analysis yet.</div>
              )}

              {/* Images gallery and upload */}
              <div className="rounded border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Images</div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm flex items-center gap-1">
                      <input type="checkbox" checked={storeInDb} onChange={(e)=>setStoreInDb(e.target.checked)} /> Store in DB
                    </label>
                    <select className="border rounded h-9 text-sm px-2" value={selectedModality} onChange={(e)=>setSelectedModality(e.target.value)}>
                      <option value="">Modality (auto for DICOM)</option>
                      <option value="DX">DX</option>
                      <option value="CR">CR</option>
                      <option value="CT">CT</option>
                      <option value="MR">MR</option>
                      <option value="US">US</option>
                    </select>
                    <input type="file" accept="image/*,.dcm" onChange={async (e)=>{
                      const f = e.target.files?.[0];
                      if (!f || !activeCase || !token) return;
                      setUploading(true);
                      try {
                        const form = new FormData();
                        form.append("store", storeInDb?"gridfs":"fs");
                        const name = f.name.toLowerCase();
                        if (!name.endsWith('.dcm') && selectedModality) {
                          form.append("modality", selectedModality);
                        }
                        form.append("file", f);
                        const res = await fetch(`http://localhost:8585/api/cases/${activeCase.caseId}/images`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
                        if (res.ok) {
                          const di = await res.json();
                          setImages(prev => [di.image, ...prev]);
                          toast({ title: "Image Uploaded", description: `${f.name} uploaded successfully.` });
                        }
                      } finally {
                        setUploading(false);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }} />
                  </div>
                </div>
                {uploading && <div className="text-xs text-muted-foreground">Uploading…</div>}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map(img => (
                    <div key={img._id} className="text-center">
                      <AuthorizedImage
                        srcPath={img.display_path?.startsWith('/')?`http://localhost:8585${img.display_path}`:`http://localhost:8585/api/images/${img.gridfs_id}`}
                        alt="case image"
                        className="h-32 w-full object-contain rounded border bg-white"
                      />
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(img.uploadedAt||'').toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Case history/symptoms */}
              <div className="rounded border p-3 space-y-2">
                <div className="font-medium">Case Details</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">History</div>
                    <Textarea value={historyText} onChange={(e)=>setHistoryText(e.target.value)} placeholder="Past medical history, relevant notes" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Symptoms</div>
                    <Textarea value={symptomsText} onChange={(e)=>setSymptomsText(e.target.value)} placeholder="Current symptoms" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={saveCaseDetails}>Save Case Details</Button>
                </div>
              </div>

              {/* Reports */}
              <div className="rounded border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Reports</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>New images: {notifCounts.new_images}</span>
                    <span>New analyses: {notifCounts.new_analyses}</span>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {/* List */}
                  <div className="md:col-span-1 border rounded p-2 max-h-60 overflow-auto">
                    <div className="text-xs text-muted-foreground mb-1">Existing Reports</div>
                    <div className="space-y-1">
                      {reports.length===0 && <div className="text-xs text-muted-foreground">No reports yet</div>}
                      {reports.map((r:any) => (
                        <button key={r._id} className={`w-full text-left text-sm p-2 rounded hover:bg-muted ${selectedReport?._id===r._id?"bg-muted":""}`} onClick={()=>editReport(r)}>
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{r.status||"draft"}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(r.updatedAt||r.createdAt||'').toLocaleString()}</div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{r.authorName||""}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-2">
                      <Button size="sm" variant="outline" className="w-full" onClick={()=>editReport(null)}>+ New Report</Button>
                    </div>
                  </div>

                  {/* Editor */}
                  <div className="md:col-span-2 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <label className="flex items-center gap-2"><input type="radio" name="agree" checked={aiAgreement==="agree"} onChange={()=>setAiAgreement("agree")} /> Agree</label>
                      <label className="flex items-center gap-2"><input type="radio" name="agree" checked={aiAgreement==="partial"} onChange={()=>setAiAgreement("partial")} /> Partial</label>
                      <label className="flex items-center gap-2"><input type="radio" name="agree" checked={aiAgreement==="disagree"} onChange={()=>setAiAgreement("disagree")} /> Disagree</label>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Diagnosis</div>
                      <Textarea value={diagnosis} onChange={(e)=>setDiagnosis(e.target.value)} placeholder="Primary diagnosis and differentials" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Recommendations</div>
                      <div className="grid md:grid-cols-2 gap-2">
                        {recOptions.map(opt => (
                          <label key={opt} className="text-sm flex items-center gap-2">
                            <input type="checkbox" checked={recs.includes(opt)} onChange={()=>toggleRec(opt)} /> {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Full Report</div>
                      <Textarea value={repContent} onChange={(e)=>setRepContent(e.target.value)} placeholder="Detailed report content" className="min-h-[120px]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={()=>saveReport(false)} disabled={savingReport}>{savingReport?"Saving…":"Save Draft"}</Button>
                      <Button size="sm" variant="secondary" onClick={()=>saveReport(true)} disabled={savingReport}>Finalize</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
