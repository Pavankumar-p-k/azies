import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSearch, ShieldX } from "lucide-react";

import { verifyProof } from "../lib/api";

function StatusBadge({ status }) {
  const verified = status === "VERIFIED";
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
        verified
          ? "bg-emerald-400/20 text-neon-green"
          : "bg-red-400/20 text-neon-red"
      }`}
    >
      {status}
    </span>
  );
}

export default function ProofTable({ proofs, onRefresh }) {
  const [busyId, setBusyId] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState("");
  const selectedFileRef = useRef(null);

  const tableRows = useMemo(() => proofs ?? [], [proofs]);

  async function runVerification(verificationId, withFile) {
    setBusyId(verificationId);
    setError("");
    setVerifyResult(null);
    try {
      const payload = await verifyProof(
        verificationId,
        withFile ? selectedFileRef.current : null
      );
      setVerifyResult(payload);
      onRefresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Integrity Ledger</h2>
        <button className="btn-secondary" onClick={onRefresh}>
          <FileSearch className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-emerald-300/10">
        <table className="min-w-full text-left text-xs text-zinc-300">
          <thead className="bg-zinc-900/70 text-[11px] uppercase tracking-widest text-zinc-400">
            <tr>
              <th className="px-3 py-3">File</th>
              <th className="px-3 py-3">Verification ID</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={5}>
                  No proofs yet. Upload a file to generate your first quantum signature.
                </td>
              </tr>
            ) : (
              tableRows.map((row) => (
                <tr key={row.verification_id} className="border-t border-zinc-800">
                  <td className="px-3 py-3">{row.filename}</td>
                  <td className="px-3 py-3 font-mono">{row.verification_id}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary text-[11px]"
                        disabled={busyId === row.verification_id}
                        onClick={() => runVerification(row.verification_id, false)}
                      >
                        Metadata Verify
                      </button>
                      <button
                        className="btn-primary text-[11px]"
                        disabled={busyId === row.verification_id}
                        onClick={() => runVerification(row.verification_id, true)}
                      >
                        Tamper Check
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <label className="text-xs text-zinc-300">
        Optional file for tamper check
        <input
          type="file"
          className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs"
          onChange={(event) => {
            selectedFileRef.current = event.target.files?.[0] ?? null;
          }}
        />
      </label>

      {verifyResult ? (
        <div
          className={`rounded-xl border p-3 text-xs ${
            verifyResult.status === "VERIFIED"
              ? "border-emerald-400/30 bg-emerald-500/10 text-neon-green"
              : "border-red-400/30 bg-red-500/10 text-neon-red"
          }`}
        >
          <p className="mb-1 inline-flex items-center gap-2 font-semibold">
            {verifyResult.status === "VERIFIED" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldX className="h-4 w-4" />
            )}
            {verifyResult.status}
          </p>
          <p>{verifyResult.detail}</p>
        </div>
      ) : null}

      {error ? <p className="text-xs text-neon-red">{error}</p> : null}
    </section>
  );
}
