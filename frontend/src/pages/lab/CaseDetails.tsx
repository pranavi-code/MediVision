import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { normalizeMediaPath } from "@/lib/url";

type ImageItem = {
	_id: string;
	original_path?: string;
	display_path?: string;
	gridfs_id?: string | null;
	modality?: string | null;
	uploadedAt?: string;
};

type CaseDoc = {
	_id: string;
	caseId: string;
	patient?: {
		name?: string;
		email?: string;
		phone?: string;
		dob?: string;
	};
	images?: ImageItem[];
	createdAt?: string;
	updatedAt?: string;
};

export default function CaseDetails() {
	const { token } = useAuth();
	const { toast } = useToast();
	const { caseId = "" } = useParams();

	const [doc, setDoc] = useState<CaseDoc | null>(null);
	const [images, setImages] = useState<ImageItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [files, setFiles] = useState<FileList | null>(null);
	const [modality, setModality] = useState("");
	const [uploading, setUploading] = useState(false);

	const hasPatientDetails = useMemo(() => {
		const p = doc?.patient || {};
		return Boolean(p.name || p.email || p.phone || p.dob);
	}, [doc]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			if (!token || !caseId) return;
			try {
				setLoading(true);
				const [cRes, iRes] = await Promise.all([
					fetch(`http://localhost:8585/api/lab/cases/${caseId}`, {
						headers: { Authorization: `Bearer ${token}` },
					}),
					fetch(`http://localhost:8585/api/lab/cases/${caseId}/images`, {
						headers: { Authorization: `Bearer ${token}` },
					}),
				]);
				if (!cancelled) {
					if (cRes.ok) {
						const c = await cRes.json();
						setDoc(c);
					}
					if (iRes.ok) {
						const i = await iRes.json();
						setImages(i.items || []);
					}
				}
			} catch (e) {
				console.error("Failed to load case:", e);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [token, caseId]);

	const handleUpload = async () => {
		if (!files || files.length === 0) {
			toast({ title: "Select files", description: "Choose one or more files to upload", variant: "destructive" });
			return;
		}
		try {
			setUploading(true);
			for (const f of Array.from(files)) {
				const fd = new FormData();
				fd.append("file", f);
				if (modality) fd.append("modality", modality);
				const res = await fetch(`http://localhost:8585/api/lab/cases/${caseId}/upload`, {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body: fd,
				});
				if (!res.ok) {
					const txt = await res.text();
					throw new Error(txt || `Upload failed for ${f.name}`);
				}
			}
			toast({ title: "Uploaded", description: "File(s) added to case" });
			// Refresh images
			const iRes = await fetch(`http://localhost:8585/api/lab/cases/${caseId}/images`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (iRes.ok) {
				const i = await iRes.json();
				setImages(i.items || []);
			}
			setFiles(null);
			setModality("");
		} catch (e) {
			console.error(e);
			toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
		} finally {
			setUploading(false);
		}
	};

	if (loading) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-semibold">Case {caseId}</h1>
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!doc) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-semibold">Case {caseId}</h1>
				<div className="text-muted-foreground">Case not found</div>
				<Link to="/lab/cases">
					<Button variant="outline">Back to Cases</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Case {doc.caseId}</h1>
					<p className="text-sm text-muted-foreground">View patient details and manage uploads</p>
				</div>
				<Link to="/lab/cases">
					<Button variant="outline">Back to Cases</Button>
				</Link>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				{/* Patient details */}
				<Card className="md:col-span-1">
					<CardHeader>
						<CardTitle>Patient</CardTitle>
						<CardDescription>Associated with this case</CardDescription>
					</CardHeader>
					<CardContent>
						{hasPatientDetails ? (
							<div className="space-y-2">
								<div className="text-sm"><span className="font-medium">Name:</span> {doc.patient?.name || "—"}</div>
								<div className="text-sm"><span className="font-medium">Email:</span> {doc.patient?.email || "—"}</div>
								<div className="text-sm"><span className="font-medium">Phone:</span> {doc.patient?.phone || "—"}</div>
								<div className="text-sm"><span className="font-medium">DOB:</span> {doc.patient?.dob || "—"}</div>
							</div>
						) : (
							<div className="text-sm text-muted-foreground">No patient details available</div>
						)}
					</CardContent>
				</Card>

				{/* Upload form */}
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle>Upload Images/Reports</CardTitle>
						<CardDescription>Add DICOM, JPG/PNG, or PDF files</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="files">Select Files</Label>
							<Input id="files" type="file" multiple accept=".dcm,.jpg,.jpeg,.png,.pdf,.tif,.tiff" onChange={(e) => setFiles(e.target.files)} />
							<p className="text-xs text-muted-foreground">Supported: DICOM, JPEG/PNG, PDF, TIFF</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="modality">Modality (optional)</Label>
							<Select value={modality} onValueChange={setModality}>
								<SelectTrigger>
									<SelectValue placeholder="Select imaging modality..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="CR">CR - Computed Radiography</SelectItem>
									<SelectItem value="CT">CT - Computed Tomography</SelectItem>
									<SelectItem value="MR">MR - Magnetic Resonance</SelectItem>
									<SelectItem value="US">US - Ultrasound</SelectItem>
									<SelectItem value="DX">DX - Digital Radiography</SelectItem>
									<SelectItem value="MG">MG - Mammography</SelectItem>
									<SelectItem value="PT">PT - PET</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Button onClick={handleUpload} disabled={!files || uploading}>
							{uploading ? "Uploading..." : "Upload to Case"}
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Images */}
			<Card>
				<CardHeader>
					<CardTitle>Uploaded Files</CardTitle>
					<CardDescription>Preview or download files attached to this case</CardDescription>
				</CardHeader>
				<CardContent>
					{images.length === 0 ? (
						<div className="text-muted-foreground">No files uploaded yet.</div>
					) : (
						<div className="grid gap-4 md:grid-cols-3">
							{images.map((img) => {
								const displayUrl = normalizeMediaPath(img.display_path);
								const isImage = (displayUrl || "").match(/\.(jpg|jpeg|png|webp)$/i);
								return (
									<div key={img._id} className="border rounded p-3">
										<div className="text-sm font-medium mb-2">{img.modality || "File"}</div>
										{isImage && displayUrl ? (
											<img src={displayUrl} alt={img.modality || "image"} className="w-full h-40 object-cover rounded" />
										) : (
											<div className="text-sm text-muted-foreground mb-2">Preview not available</div>
										)}
										{displayUrl && (
											<a className="text-sm text-primary underline" href={displayUrl} target="_blank" rel="noreferrer">
												Open
											</a>
										)}
										<div className="text-xs text-muted-foreground mt-1">{img.uploadedAt ? new Date(img.uploadedAt).toLocaleString() : ""}</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
