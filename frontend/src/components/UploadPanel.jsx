import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp } from "lucide-react";

import { uploadProof } from "../lib/api";

export default function UploadPanel({ onUploaded }) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  const onDrop = useCallback(
    async (acceptedFiles) => {
      const candidate = acceptedFiles?.[0];
      if (!candidate) {
        return;
      }
      setBusy(true);
      setProgress(0);
      setError("");
      setResult(null);
      setSelectedFileName(candidate.name);

      try {
        const response = await uploadProof(candidate, setProgress);
        setResult(response);
        onUploaded(response);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setBusy(false);
      }
    },
    [onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 200 * 1024 * 1024,
    noClick: true,
    noKeyboard: true
  });

  return (
    <section>
      <p className="mb-3 text-xs text-zinc-500">Upload</p>
      <div
        {...getRootProps()}
        className={`flex cursor-pointer items-center justify-between gap-4 rounded border border-dashed px-4 py-3 transition ${
          isDragActive ? "border-neon-green" : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center gap-3 min-w-0">
          <FileUp className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="truncate text-sm text-zinc-400">
            {selectedFileName || (isDragActive ? "Release" : "Drop file or click")}
          </span>
        </div>
        <button type="button" className="shrink-0 rounded bg-neon-green px-3 py-1.5 text-xs font-medium text-zinc-900 hover:brightness-110" onClick={open} disabled={busy}>
          {busy ? "..." : "Browse"}
        </button>
      </div>

      {progress > 0 ? (
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1 flex-1 bg-zinc-800">
            <div className="h-full bg-neon-green transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-zinc-600">{progress}%</span>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-neon-red">{error}</p> : null}

      {result ? (
        <div className="mt-3 space-y-1 text-xs text-zinc-500">
          <p><span className="text-zinc-400">Proof:</span> {result.filename}</p>
          <p className="truncate font-mono text-zinc-600">{result.verification_id}</p>
        </div>
      ) : null}
    </section>
  );
}
