import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, User, FileImage, ExternalLink, MessageCircle } from "lucide-react";

interface ImageItem { _id?: string; display_path?: string; modality?: string; uploadedAt?: string }
interface ReportItem { _id?: string; status?: string; content?: string; authorName?: string; createdAt?: string }

const normalize = (p?: string | null) => {
	if (!p) return null;
	try {
		if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://")) return p;
		let path = p.replace(/\\/g, "/");
		if (/^[a-zA-Z]:\//.test(path)) return null;
		if (!path.startsWith("/")) path = "/" + path;
		return `http://localhost:8585${path}`;
	} catch {
		return null;
	}
};

export default function CaseView() {
	const { caseId } = useParams();
	const { token } = useAuth();
	const [loading, setLoading] = useState(true);
	const [caseInfo, setCaseInfo] = useState<any | null>(null);
	const [images, setImages] = useState<ImageItem[]>([]);
	const [analysis, setAnalysis] = useState<any | null>(null);
	const [reports, setReports] = useState<ReportItem[]>([]);

	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			if (!token || !caseId) return;
			setLoading(true);
			try {
				const headers = { Authorization: `Bearer ${token}` } as HeadersInit;
				const [cRes, imgRes, aRes, rRes] = await Promise.all([
					fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}`, { headers }),
					fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}/images`, { headers }),
					fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}/analysis`, { headers }),
					fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}/reports`, { headers }),
				]);
				if (cancelled) return;
				if (cRes.ok) setCaseInfo(await cRes.json());
				if (imgRes.ok) {
					const d = await imgRes.json();
					setImages(d.items || []);
				}
				if (aRes.ok) {
					const d = await aRes.json();
					setAnalysis(d.analysis || null);
				}
				if (rRes.ok) {
					const d = await rRes.json();
					// Only final reports for patients per API, but double-check
					const items: ReportItem[] = (d.items || []).filter((r: any) => r.status === "final" || !("status" in r));
					setReports(items);
				}
			} catch (e) {
				console.error("Failed to load case details", e);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		run();
		return () => { cancelled = true; };
	}, [token, caseId]);

	const formatDate = (dateStr?: string) => {
		if (!dateStr) return "";
		try {
			return new Date(dateStr).toLocaleDateString("en-US", {
				month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
			});
		} catch { return dateStr; }
	};

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="animate-pulse">
					<div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
					<div className="h-4 bg-gray-200 rounded w-1/3"></div>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="h-40 bg-gray-200 rounded animate-pulse"></div>
					<div className="h-40 bg-gray-200 rounded animate-pulse"></div>
				</div>
			</div>
		);
	}

	if (!caseInfo) {
		return (
			<div className="space-y-4">
				<h1 className="text-xl font-semibold">Case not found</h1>
				<Link to="/patient/cases" className="text-blue-600 underline">Back to cases</Link>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Case {caseId}</h1>
					<p className="text-sm text-muted-foreground">Patient: {caseInfo?.patient?.name || "Unknown"}</p>
					<div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
						<span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{formatDate(caseInfo?.createdAt)}</span>
						{caseInfo?.assignedDoctor?.name && (
							<span className="flex items-center gap-1"><User className="w-4 h-4" />Dr. {caseInfo.assignedDoctor.name}</span>
						)}
					</div>
				</div>
				<div className="flex gap-2">
					<Button asChild>
						<Link to={`/patient/chat?caseId=${encodeURIComponent(caseId || "")}`}>
							<MessageCircle className="w-4 h-4 mr-1" /> Ask MedRAX
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link to="/patient/cases">Back to Cases</Link>
					</Button>
				</div>
			</div>

			{/* Images */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><FileImage className="w-5 h-5" /> Images</CardTitle>
				</CardHeader>
				<CardContent>
					{images.length === 0 ? (
						<div className="text-sm text-muted-foreground">No images uploaded yet.</div>
					) : (
						<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
							{images.map((img, idx) => (
								<div key={img._id || idx} className="border rounded p-2">
									<div className="aspect-video bg-gray-50 rounded flex items-center justify-center overflow-hidden">
										{normalize(img.display_path) ? (
											<img src={normalize(img.display_path) || undefined} alt="Image" className="object-contain w-full h-full" />
										) : (
											<div className="text-xs text-muted-foreground">No preview</div>
										)}
									</div>
									<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
										<span>{img.modality || "Image"}</span>
										<span>{img.uploadedAt ? new Date(img.uploadedAt).toLocaleDateString() : ""}</span>
									</div>
									{normalize(img.display_path) && (
										<a className="text-xs text-blue-600 inline-flex items-center gap-1 mt-1" href={normalize(img.display_path) || undefined} target="_blank" rel="noreferrer">
											<ExternalLink className="w-3 h-3" /> Open
										</a>
									)}
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Analysis */}
			<Card>
				<CardHeader>
					<CardTitle>Doctor AI Analysis</CardTitle>
				</CardHeader>
				<CardContent>
					{!analysis ? (
						<div className="text-sm text-muted-foreground">No analysis available yet.</div>
					) : (
						<div className="space-y-3">
							{analysis.display_path && (
								<div className="rounded border overflow-hidden">
									<img src={normalize(analysis.display_path) || undefined} alt="Analysis" className="w-full h-auto object-contain" />
								</div>
							)}
							{analysis.summary && (
								<div className="whitespace-pre-wrap text-sm">{analysis.summary}</div>
							)}
							<div className="text-xs text-muted-foreground flex gap-4">
								{analysis.confidence != null && (
									<span>Confidence: {Math.round(analysis.confidence)}%</span>
								)}
								{analysis.analyzedAt && (
									<span>Analyzed: {formatDate(analysis.analyzedAt)}</span>
								)}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Reports */}
			<Card>
				<CardHeader>
					<CardTitle>Final Reports</CardTitle>
				</CardHeader>
				<CardContent>
					{(!reports || reports.length === 0) ? (
						<div className="text-sm text-muted-foreground">No finalized reports yet.</div>
					) : (
						<div className="space-y-4">
							{reports.map((r, idx) => (
								<div key={r._id || idx} className="border rounded p-3">
									<div className="flex items-center justify-between">
										<div className="text-sm font-medium">Report</div>
										<div className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</div>
									</div>
									{r.authorName && (
										<div className="text-xs text-muted-foreground mt-1">By Dr. {r.authorName}</div>
									)}
									{r.content && (
										<div className="mt-2 text-sm whitespace-pre-wrap">
											{r.content.length > 400 ? `${r.content.slice(0, 400)}...` : r.content}
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
