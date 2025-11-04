export function normalizeMediaPath(p?: string | null): string | null {
  if (!p) return null;
  try {
    if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://")) return p;
    // Normalize Windows backslashes
    let path = p.replace(/\\/g, "/");
    // Ignore absolute filesystem paths (C:/...), no safe way to serve directly
    if (/^[a-zA-Z]:\//.test(path)) return null;
    if (!path.startsWith("/")) path = "/" + path;
    return `http://localhost:8585${path}`;
  } catch {
    return null;
  }
}
