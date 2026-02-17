import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ShieldX, Upload } from "lucide-react";

import { getSharedProof, verifySharedUpload } from "../lib/api";

export default function SharedVerifyPanel({ shareToken }) {
  const [proof, setProof] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    setBusy(true);
    setError("");
    setResult(null);
    setProof(null);
    getSharedProof(shareToken)
      .then((payload) => {
        if (mounted) {
          setProof(payload);
        }
      })
      .catch((requestError) => {
        if (mounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (mounted) {
          setBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [shareToken]);

  async function onVerify() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to verify.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await verifySharedUpload(shareToken, file);
      setResult(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4">
      <h2 className="panel-title">Shared Integrity Verification</h2>

      {busy && !proof ? <p className="text-sm text-zinc-400">Loading shared proof...</p> : null}

      {proof ? (
        <div className="rounded-xl border border-emerald-300/20 bg-black/20 p-4 text-sm">
          <p className="text-zinc-100">
            <span className="text-zinc-400">Owner:</span> {proof.owner_display}
          </p>
          <p className="text-zinc-100">
            <span className="text-zinc-400">File:</span> {proof.filename}
          </p>
          <p className="text-zinc-100">
            <span className="text-zinc-400">Verification ID:</span> {proof.verification_id}
          </p>
          <p className="text-zinc-100">
            <span className="text-zinc-400">PQC:</span> {proof.pqc_algorithm}
          </p>
          <p className="text-zinc-100">
            <span className="text-zinc-400">Created:</span>{" "}
            {new Date(proof.created_at).toLocaleString()}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            Choose File
          </button>
          <span className="text-xs text-zinc-400">{fileName || "No file selected"}</span>
        </div>
        <button type="button" className="btn-primary" onClick={onVerify} disabled={busy || !proof}>
          <Upload className="h-4 w-4" />
          <span>{busy ? "Verifying..." : "Verify Against Shared Proof"}</span>
        </button>
      </div>

      {result ? (
        <div
          className={`rounded-xl border p-3 text-xs ${
            result.status === "VERIFIED"
              ? "border-emerald-400/30 bg-emerald-500/10 text-neon-green"
              : "border-red-400/30 bg-red-500/10 text-neon-red"
          }`}
        >
          <p className="mb-1 inline-flex items-center gap-2 font-semibold">
            {result.status === "VERIFIED" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldX className="h-4 w-4" />
            )}
            {result.status}
          </p>
          <p>{result.detail}</p>
          <p className="mt-2 break-all font-mono text-[11px]">
            Expected: {result.expected_hash_sha3_512}
          </p>
          <p className="mt-1 break-all font-mono text-[11px]">
            Submitted: {result.submitted_hash_sha3_512}
          </p>
          {result.auto_delete_at ? (
            <p className="mt-1 text-[11px]">Auto-delete at: {new Date(result.auto_delete_at).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-neon-red">{error}</p> : null}
    </section>
  );
}
