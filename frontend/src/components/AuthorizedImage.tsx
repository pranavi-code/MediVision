import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeMediaPath } from "@/lib/url";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  srcPath?: string | null;
};

/**
 * AuthorizedImage renders images that require an Authorization header (e.g., /api/images/*).
 * It fetches the image as a blob with the current JWT and displays a blob URL.
 * For public or data URLs, it falls back to rendering directly.
 */
export default function AuthorizedImage({ srcPath, alt, className, onClick, onError, ...rest }: Props) {
  const { token } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);

  const resolved = useMemo(() => normalizeMediaPath(srcPath || undefined), [srcPath]);

  useEffect(() => {
    let revoked: string | null = null;
    setBlobUrl(null);
    setDirectUrl(null);

    if (!resolved) return;
    // Data and external URLs can be used directly
    if (resolved.startsWith("data:") || resolved.startsWith("http://") || resolved.startsWith("https://")) {
      // If it's our API image endpoint, prefer authorized fetch; otherwise direct
      const needsAuth = resolved.includes("/api/images/") || resolved.includes("/api/");
      if (!needsAuth) {
        setDirectUrl(resolved);
        return;
      }
    }

    // Try authorized fetch when we have a token and URL looks like API
    const shouldAuthFetch = token && (resolved.includes("/api/images/") || resolved.includes("/api/"));
    if (shouldAuthFetch) {
      fetch(resolved, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const b = await r.blob();
          const url = URL.createObjectURL(b);
          revoked = url;
          setBlobUrl(url);
        })
        .catch(() => {
          // Fallback: hide instead of leaking auth
          setBlobUrl(null);
        });
      return () => {
        if (revoked) URL.revokeObjectURL(revoked);
      };
    }

    // Default: treat as public asset (uploads/temp)
    setDirectUrl(resolved);
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [resolved, token]);

  const src = blobUrl || directUrl || undefined;
  if (!src) {
    return (
      <div className={className} onClick={onClick}>
        {/* Empty placeholder when not available */}
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onClick={onClick} onError={onError} {...rest} />;
}
