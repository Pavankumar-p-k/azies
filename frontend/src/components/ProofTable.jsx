import { useMemo, useRef, useState } from "react";

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
    <section>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-zinc-500">Proofs</p>
        <button className="text-xs text-zinc-600 hover:text-zinc-300" onClick={onRefresh}>Refresh</button>
      </div>

      {tableRows.length === 0 ? (
        <p className="text-sm text-zinc-600">No proofs yet.</p>
      ) : (
        <div className="space-y-1">
          {tableRows.map((row) => (
            <div key={row.verification_id} className="border-t border-zinc-800/50 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{row.filename}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-zinc-600">{row.verification_id}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700" onClick={() => runVerification(row.verification_id, false)} disabled={busyId === row.verification_id}>
                  Verify
                </button>
                <button className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700" onClick={() => runVerification(row.verification_id, true)} disabled={busyId === row.verification_id}>
                  Check
                </button>
                <button className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700" onClick={() => handleShare(row)} disabled={!user || actionBusyId === `share:${row.verification_id}`}>
                  Share
                </button>
                <button className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700" onClick={() => handleDelete(row)} disabled={actionBusyId === `delete:${row.verification_id}`}>
                  Delete
                </button>
              </div>
              {shareLinks[row.verification_id] ? (
                <p className="mt-1 truncate text-xs text-zinc-600">{shareLinks[row.verification_id]}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-zinc-800/50 pt-4">
        <p className="text-xs text-zinc-600">Check file:</p>
        <input ref={filePickerRef} type="file" className="hidden" onChange={(event) => { const f = event.target.files?.[0] ?? null; selectedFileRef.current = f; setSelectedFileName(f?.name ?? ""); }} />
        <button className="rounded bg-neon-green px-2.5 py-1 text-xs font-medium text-zinc-900 hover:brightness-110" onClick={() => filePickerRef.current?.click()}>
          {selectedFileName || "Choose"}
        </button>
      </div>

      {verifyResult ? (
        <p className={`mt-3 text-xs ${verifyResult.status === "VERIFIED" ? "text-neon-green" : "text-neon-red"}`}>
          {verifyResult.status} — {verifyResult.detail}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs text-neon-red">{error}</p> : null}
      {status ? <p className="mt-3 text-xs text-zinc-500">{status}</p> : null}
      {!user ? <p className="mt-4 text-xs text-zinc-600">Sign in to share and delete.</p> : null}
    </section>
  );
}
