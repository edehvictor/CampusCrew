export function uploadEvidence(
  booking: string,
  id: string,
  file: File,
  onProgress: (percent: number | null) => void,
) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ id: string }>((resolve, reject) => {
    xhr.open("POST", "/api/evidence?booking=" + encodeURIComponent(booking));
    xhr.responseType = "json";
    xhr.withCredentials = true;
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) =>
      onProgress(
        e.lengthComputable
          ? Math.min(99, Math.round((e.loaded / e.total) * 100))
          : null,
      );
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.id === id)
        resolve({ id });
      else
        reject(
          new Error(
            xhr.response?.error ??
              "Upload was not confirmed. Check attached files before retrying.",
          ),
        );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Connection interrupted. Check attached files; retrying this upload will use the same identifier.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error(
          "Upload confirmation timed out. Check attached files before retrying.",
        ),
      );
    xhr.onabort = () =>
      reject(new DOMException("Upload cancelled", "AbortError"));
    const body = new FormData();
    body.set("file", file);
    body.set("uploadId", id);
    xhr.send(body);
  });
  return { promise, cancel: () => xhr.abort() };
}
export function evidenceSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
