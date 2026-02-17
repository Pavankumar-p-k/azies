import { useEffect, useMemo, useState } from "react";
import { FileText, Save, UserRound } from "lucide-react";

import { getMyProfile, updateMyProfile } from "../lib/api";

function statClass() {
  return "rounded-lg border border-emerald-300/20 bg-black/20 px-3 py-2 text-center";
}

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
      <section className="panel space-y-3">
        <h2 className="panel-title">Creator Profile</h2>
        <p className="text-sm text-zinc-400">
          Sign in to unlock social profile, sharing identity, and personal notifications.
        </p>
      </section>
    );
  }

  const avatarLabel = form.display_name || form.handle || "aegis";
  const avatarInitial = avatarLabel.trim().slice(0, 1).toUpperCase();

  return (
    <section className="panel space-y-4">
      <h2 className="panel-title">Creator Profile</h2>
      <div className="rounded-xl border border-emerald-300/20 bg-black/20 p-4">
        <div className="flex items-center gap-3">
          {form.avatar_url ? (
            <img
              src={form.avatar_url}
              alt="Avatar"
              className="h-12 w-12 rounded-full border border-emerald-300/30 object-cover"
            />
          ) : (
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/30 bg-zinc-900 text-lg font-semibold text-neon-green">
              {avatarInitial || <UserRound className="h-5 w-5" />}
            </div>
          )}
          <div>
            <p className="font-semibold text-zinc-100">{form.display_name || "Aegis Creator"}</p>
            <p className="text-xs text-zinc-400">@{form.handle || "handle"}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          {onPostsClick ? (
            <button type="button" className={`${statClass()} cursor-pointer`} onClick={onPostsClick}>
              <p className="inline-flex items-center gap-1 text-zinc-400">
                <FileText className="h-3.5 w-3.5" />
                Posts
              </p>
              <p className="font-semibold text-neon-green">{stats.posts}</p>
            </button>
          ) : (
            <div className={statClass()}>
              <p className="text-zinc-400">Posts</p>
              <p className="font-semibold text-neon-green">{stats.posts}</p>
            </div>
          )}
          <div className={statClass()}>
            <p className="text-zinc-400">Secure Shares</p>
            <p className="font-semibold text-neon-green">{stats.secureShares}</p>
          </div>
          <div className={statClass()}>
            <p className="text-zinc-400">Rechecks</p>
            <p className="font-semibold text-neon-green">{stats.rechecks}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <input
          className="input"
          placeholder="Handle"
          value={form.handle}
          onChange={(event) => setForm((prev) => ({ ...prev, handle: event.target.value }))}
        />
        <input
          className="input"
          placeholder="Display name"
          value={form.display_name}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, display_name: event.target.value }))
          }
        />
        <textarea
          className="input min-h-20 resize-y"
          placeholder="Bio"
          value={form.bio}
          onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
        />
        <input
          className="input"
          placeholder="Avatar URL (optional)"
          value={form.avatar_url}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, avatar_url: event.target.value }))
          }
        />
      </div>

      <button type="button" className="btn-primary w-full" disabled={busy} onClick={onSave}>
        <Save className="h-4 w-4" />
        <span>{busy ? "Saving..." : "Save profile"}</span>
      </button>

      {status ? <p className="text-xs text-zinc-300">{status}</p> : null}
      {profile?.email ? <p className="text-[11px] text-zinc-500">{profile.email}</p> : null}
    </section>
  );
}
