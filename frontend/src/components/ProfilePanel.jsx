import { useEffect, useMemo, useState } from "react";

import { getMyProfile, updateMyProfile } from "../lib/api";

export default function ProfilePanel({
  user,
  proofsCount,
  onPostsClick,
  onSaved,
  initialProfile,
  onProfileLoaded
}) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    handle: "",
    display_name: "",
    bio: "",
    avatar_url: ""
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    if (initialProfile && initialProfile.email === user.email) {
      setProfile(initialProfile);
      setForm({
        handle: initialProfile.handle ?? "",
        display_name: initialProfile.display_name ?? "",
        bio: initialProfile.bio ?? "",
        avatar_url: initialProfile.avatar_url ?? ""
      });
      return;
    }

    let mounted = true;
    getMyProfile()
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setProfile(payload);
        onProfileLoaded?.(payload);
        setForm({
          handle: payload.handle ?? "",
          display_name: payload.display_name ?? "",
          bio: payload.bio ?? "",
          avatar_url: payload.avatar_url ?? ""
        });
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        setStatus(error.message);
      });
    return () => {
      mounted = false;
    };
  }, [initialProfile, onProfileLoaded, user]);

  const stats = useMemo(
    () => ({
      posts: proofsCount ?? 0,
      secureShares: Math.max(0, Math.round((proofsCount ?? 0) * 0.7)),
      rechecks: Math.max(0, Math.round((proofsCount ?? 0) * 1.2))
    }),
    [proofsCount]
  );

  async function onSave() {
    setBusy(true);
    setStatus("");
    try {
      const payload = await updateMyProfile(form);
      setProfile(payload);
      setStatus("Profile updated.");
      onProfileLoaded?.(payload);
      onSaved?.(payload);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">Profile</p>
        <p className="text-sm text-zinc-600">Sign in to manage your profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">Profile</p>
      <p className="text-sm text-zinc-300">{form.display_name || form.handle || "User"}</p>
      <p className="text-xs text-zinc-600">@{form.handle || "handle"} &middot; {stats.posts} proofs</p>
      <div className="space-y-3">
        <input className="w-full border-b border-zinc-800 bg-transparent px-0 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-neon-green" placeholder="Handle" value={form.handle} onChange={(e) => setForm((p) => ({ ...p, handle: e.target.value }))} />
        <input className="w-full border-b border-zinc-800 bg-transparent px-0 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-neon-green" placeholder="Display name" value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} />
        <textarea className="w-full border-b border-zinc-800 bg-transparent px-0 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-neon-green resize-none" placeholder="Bio" value={form.bio} onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))} rows={2} />
        <input className="w-full border-b border-zinc-800 bg-transparent px-0 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-neon-green" placeholder="Avatar URL" value={form.avatar_url} onChange={(e) => setForm((p) => ({ ...p, avatar_url: e.target.value }))} />
      </div>
      <button className="rounded bg-neon-green px-3 py-1.5 text-xs font-medium text-zinc-900 hover:brightness-110" disabled={busy} onClick={onSave}>
        {busy ? "Saving..." : "Save"}
      </button>
      {status ? <p className="text-xs text-neon-green">{status}</p> : null}
    </div>
  );
}
