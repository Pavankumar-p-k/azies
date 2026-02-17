import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, ShieldCheck, TriangleAlert } from "lucide-react";

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
    <section className="panel space-y-4">
      <h2 className="panel-title">Quantum-Signed Upload</h2>
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? "dropzone-active" : ""}`}
      >
        <input {...getInputProps()} />
        <FileUp className="h-8 w-8 text-neon-green" />
        <p className="text-sm text-zinc-200">
          {isDragActive ? "Release to sign and broadcast" : "Drag and drop a document"}
        </p>
        <p className="text-xs text-zinc-400">
          SHA3-512 to ML-DSA signature to AES vault to Supabase ledger
        </p>
        <button type="button" className="btn-primary mt-2" onClick={open} disabled={busy}>
          <FileUp className="h-4 w-4" />
          <span>{busy ? "Uploading..." : "Choose file"}</span>
        </button>
        <p className="text-xs text-zinc-400">
          {selectedFileName ? `Selected: ${selectedFileName}` : "No file selected"}
        </p>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-zinc-300">
          <span>Verification progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800">
          <div
            className="h-2 rounded-full bg-neon-green transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {busy ? <p className="text-xs text-neon-amber">Processing integrity proof...</p> : null}
      {error ? (
        <p className="inline-flex items-center gap-2 text-xs text-neon-red">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-neon-green">
            <ShieldCheck className="h-4 w-4" />
            Proof generated
          </p>
          <dl className="space-y-1 text-xs text-zinc-200">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-2">
              <dt className="text-zinc-400">File</dt>
              <dd className="break-all sm:col-span-2">{result.filename}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-2">
              <dt className="text-zinc-400">Verification ID</dt>
              <dd className="font-mono break-all sm:col-span-2">{result.verification_id}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-2">
              <dt className="text-zinc-400">Hash</dt>
              <dd className="font-mono break-all sm:col-span-2">{result.hash_sha3_512}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
