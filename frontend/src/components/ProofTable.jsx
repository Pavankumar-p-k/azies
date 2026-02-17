import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, FileSearch, Share2, ShieldX, Trash2 } from "lucide-react";

import { createShareLink, deleteProof, verifyProof } from "../lib/api";

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

function fallbackShareUrl(row) {
  if (!row?.share_token) {
    return "";
  }
  if (typeof window === "undefined") {
    return `?share=${encodeURIComponent(row.share_token)}`;
  }
  return `${window.location.origin}/?share=${encodeURIComponent(row.share_token)}`;
}

export default function ProofTable({ proofs, onRefresh, user }) {
  const [busyId, setBusyId] = useState("");
  const [actionBusyId, setActionBusyId] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [shareLinks, setShareLinks] = useState({});
  const selectedFileRef = useRef(null);
  const filePickerRef = useRef(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  const tableRows = useMemo(() => proofs ?? [], [proofs]);

  async function runVerification(verificationId, withFile) {
    setBusyId(verificationId);
    setError("");
    setStatus("");
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

  async function copyText(value) {
    if (!value) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setStatus("Copy is not available in this browser.");
      return;
    }
    await navigator.clipboard.writeText(value);
  }

  async function handleShare(row) {
    setActionBusyId(`share:${row.verification_id}`);
    setError("");
    setStatus("");
    try {
      const payload = await createShareLink(row.verification_id);
      setShareLinks((previous) => ({
        ...previous,
        [row.verification_id]: payload.share_url
      }));
      await copyText(payload.share_url);
      setStatus("Share link created and copied.");
      onRefresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionBusyId("");
    }
  }

  async function handleCopyLink(row) {
    const shareUrl = shareLinks[row.verification_id] || fallbackShareUrl(row);
    if (!shareUrl) {
      setStatus("Create a share link first.");
      return;
    }
    try {
      await copyText(shareUrl);
      setStatus("Share link copied.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDelete(row) {
    const shouldDelete = window.confirm(
      `Delete proof for "${row.filename}" (${row.verification_id})?`
    );
    if (!shouldDelete) {
      return;
    }

    setActionBusyId(`delete:${row.verification_id}`);
    setError("");
    setStatus("");
    try {
      await deleteProof(row.verification_id);
      setShareLinks((previous) => {
        const next = { ...previous };
        delete next[row.verification_id];
        return next;
      });
      setStatus("Proof deleted.");
      onRefresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionBusyId("");
    }
  }

  function isRowBusy(row) {
    return (
      busyId === row.verification_id ||
      actionBusyId === `share:${row.verification_id}` ||
      actionBusyId === `delete:${row.verification_id}`
    );
  }

  function renderRowActions(row) {
    const busy = isRowBusy(row);
    const shareUrl = shareLinks[row.verification_id] || fallbackShareUrl(row);

    return (
      <>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button
            className="btn-secondary w-full text-[11px] sm:w-auto"
            disabled={busy}
            onClick={() => runVerification(row.verification_id, false)}
          >
            Metadata Verify
          </button>
          <button
            className="btn-primary w-full text-[11px] sm:w-auto"
            disabled={busy}
            onClick={() => runVerification(row.verification_id, true)}
          >
            Tamper Check
          </button>
          <button
            className="btn-secondary w-full text-[11px] sm:w-auto"
            disabled={!user || busy}
            onClick={() => handleShare(row)}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>{actionBusyId === `share:${row.verification_id}` ? "Sharing..." : "Share"}</span>
          </button>
          <button
            className="btn-secondary w-full text-[11px] sm:w-auto"
            disabled={busy}
            onClick={() => handleCopyLink(row)}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy Link</span>
          </button>
          <button
            className="btn-secondary w-full text-[11px] sm:w-auto"
            disabled={!user || busy}
            onClick={() => handleDelete(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{actionBusyId === `delete:${row.verification_id}` ? "Deleting..." : "Delete"}</span>
          </button>
        </div>
        {shareUrl ? <p className="mt-2 break-all text-[11px] text-zinc-400">{shareUrl}</p> : null}
      </>
    );
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

      <div className="space-y-3 sm:hidden">
        {tableRows.length === 0 ? (
          <div className="rounded-xl border border-emerald-300/10 bg-black/20 px-3 py-6 text-center text-xs text-zinc-500">
            No proofs yet. Upload a file to generate your first quantum signature.
          </div>
        ) : (
          tableRows.map((row) => (
            <article
              key={row.verification_id}
              className="space-y-3 rounded-xl border border-emerald-300/10 bg-black/20 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="break-all text-sm text-zinc-200">{row.filename}</p>
                <StatusBadge status={row.status} />
              </div>
              <div className="space-y-1 text-[11px] text-zinc-400">
                <p className="break-all">
                  <span className="text-zinc-500">Verification ID:</span>{" "}
                  <span className="font-mono text-zinc-300">{row.verification_id}</span>
                </p>
                <p>
                  <span className="text-zinc-500">Created:</span>{" "}
                  <span className="text-zinc-300">{new Date(row.created_at).toLocaleString()}</span>
                </p>
              </div>
              {renderRowActions(row)}
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-emerald-300/10 sm:block">
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
                  <td className="px-3 py-3 break-all">{row.filename}</td>
                  <td className="px-3 py-3 break-all font-mono">{row.verification_id}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-3">{renderRowActions(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-zinc-300">Optional file for tamper check</p>
        <input
          ref={filePickerRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            selectedFileRef.current = file;
            setSelectedFileName(file?.name ?? "");
          }}
        />
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className="btn-secondary w-full text-[11px] sm:w-auto"
            onClick={() => filePickerRef.current?.click()}
          >
            Choose file
          </button>
          <span className="break-all text-xs text-zinc-400">
            {selectedFileName || "No file selected"}
          </span>
        </div>
      </div>

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
      {status ? <p className="text-xs text-zinc-300">{status}</p> : null}
      {!user ? (
        <p className="text-[11px] text-zinc-500">
          Sign in to create or delete shareable proofs.
        </p>
      ) : null}
    </section>
  );
}
