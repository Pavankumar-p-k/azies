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
    <section className="rounded-2xl border border-emerald-300/10 bg-terminal-elev/60 p-5 shadow-panel backdrop-blur-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-500/10">
          <Upload className="h-4 w-4 text-neon-green" />
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">Shared Integrity Verification</h2>
          <p className="text-[10px] text-zinc-600">Verify a file against a shared proof link</p>
        </div>
      </div>

      {busy && !proof ? (
        <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-black/20 px-4 py-6">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-green" />
            <p className="text-xs text-zinc-400">Loading shared proof...</p>
          </div>
        </div>
      ) : null}

      {proof ? (
        <div className="mb-5 overflow-hidden rounded-xl border border-emerald-300/10">
          <div className="border-b border-emerald-300/10 bg-emerald-500/5 px-4 py-2.5">
            <p className="text-[11px] font-medium text-neon-green">Proof Details</p>
          </div>
          <div className="divide-y divide-zinc-800/60 bg-black/20">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] text-zinc-500">Owner</span>
              <span className="text-[11px] text-zinc-200">{proof.owner_display}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] text-zinc-500">File</span>
              <span className="text-[11px] text-zinc-200">{proof.filename}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] text-zinc-500">Verification ID</span>
              <span className="max-w-[200px] truncate text-right font-mono text-[11px] text-zinc-200">{proof.verification_id}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] text-zinc-500">Algorithm</span>
              <span className="text-[11px] text-zinc-200">{proof.pqc_algorithm}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] text-zinc-500">Created</span>
              <span className="text-[11px] text-zinc-200">{new Date(proof.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className="btn-secondary text-[11px]"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Choose File
            </button>
            <span className="text-[11px] text-zinc-500">{fileName || "No file selected"}</span>
          </div>
          <button
            type="button"
            className="btn-primary text-[11px] sm:w-auto"
            onClick={onVerify}
            disabled={busy || !proof}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{busy ? "Verifying..." : "Verify Against Proof"}</span>
          </button>
        </div>
      </div>

      {result ? (
        <div className={`mt-5 overflow-hidden rounded-xl border ${
          result.status === "VERIFIED"
            ? "border-emerald-400/20 bg-emerald-500/5"
            : "border-red-400/20 bg-red-500/5"
        }`}>
          <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${
            result.status === "VERIFIED"
              ? "border-emerald-400/10 bg-emerald-500/10"
              : "border-red-400/10 bg-red-500/10"
          }`}>
            {result.status === "VERIFIED" ? (
              <CheckCircle2 className="h-4 w-4 text-neon-green" />
            ) : (
              <ShieldX className="h-4 w-4 text-neon-red" />
            )}
            <p className={`text-xs font-semibold ${result.status === "VERIFIED" ? "text-neon-green" : "text-neon-red"}`}>
              {result.status}
            </p>
          </div>
          <div className="space-y-2 px-4 py-3">
            <p className="text-xs text-zinc-300">{result.detail}</p>
            <div className="rounded-lg bg-black/30 p-2">
              <p className="text-[11px] text-zinc-500">Expected hash</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-300">{result.expected_hash_sha3_512}</p>
            </div>
            <div className="rounded-lg bg-black/30 p-2">
              <p className="text-[11px] text-zinc-500">Submitted hash</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-zinc-300">{result.submitted_hash_sha3_512}</p>
            </div>
            {result.auto_delete_at ? (
              <p className="text-[11px] text-zinc-500">
                Auto-delete at: {new Date(result.auto_delete_at).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/5 px-3 py-2">
          <ShieldX className="h-3.5 w-3.5 shrink-0 text-neon-red" />
          <p className="text-xs text-neon-red">{error}</p>
        </div>
      ) : null}
    </section>
  );
}
