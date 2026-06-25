import { FileCheck, Globe, Lock, Shield, Share2, Zap } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Quantum-Resistant Security",
    desc: "Uses ML-DSA (Dilithium) post-quantum signatures via liboqs — future-proof against quantum computing threats."
  },
  {
    icon: Lock,
    title: "AES-256 Encrypted Vault",
    desc: "Every uploaded file is encrypted with AES-256-GCM before storage. Only the integrity proof remains visible."
  },
  {
    icon: FileCheck,
    title: "SHA3-512 Hashing",
    desc: "Cryptographic hashing ensures any file modification is instantly detectable through hash mismatch."
  },
  {
    icon: Share2,
    title: "Shareable Verification Links",
    desc: "Generate share tokens so anyone can re-verify a file against the original proof — no account needed."
  },
  {
    icon: Globe,
    title: "P2P Peer Broadcast",
    desc: "Integrity events are broadcast to peer nodes, creating a decentralized verification network."
  },
  {
    icon: Zap,
    title: "Real-Time Event Feed",
    desc: "Live WebSocket stream of all proof events — uploads, verifications, shares, and tamper alerts."
  }
];

const steps = [
  { num: "01", title: "Upload a File", desc: "Drag & drop any document. It is hashed with SHA3-512 and signed with a quantum-resistant ML-DSA signature." },
  { num: "02", title: "Encrypt & Store", desc: "The file payload is AES-256 encrypted and stored. The proof metadata is saved to the Supabase ledger." },
  { num: "03", title: "Verify Anytime", desc: "Re-upload the file later to verify integrity. Hash match + valid signature = VERIFIED. Any tampering = TAMPERED." },
  { num: "04", title: "Share & Prove", desc: "Create a share link so anyone (even without an account) can verify the file matches the original proof." }
];

export default function AboutPage({ health, heroStatus, onGetStarted }) {
  return (
    <div className="space-y-20">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-300/10 bg-gradient-to-b from-emerald-500/5 to-transparent px-6 py-14 sm:px-10 sm:py-20">
        <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-neon-green/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-500/10">
            <Shield className="h-8 w-8 text-neon-green" />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-neon-green">Project Aegis</p>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
            Quantum-Resistant<br />
            <span className="text-neon-green">File Integrity</span> Platform
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-400 leading-relaxed">
            A local-first, decentralized integrity verification platform that uses post-quantum cryptography
            to prove your files have not been tampered with — today and in the quantum future.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button className="btn-primary px-6 py-3 text-sm" onClick={onGetStarted}>
              <Zap className="h-4 w-4" />
              <span>Get Started</span>
            </button>
            <a href="#about" className="btn-secondary px-6 py-3 text-sm">
              Learn More
            </a>
          </div>
          {health ? (
            <div className="mt-8 inline-flex items-center gap-4 rounded-xl border border-emerald-300/10 bg-black/30 px-5 py-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-neon-green" />
                {health.pqc_algorithm}
              </span>
              <span className="text-zinc-600">|</span>
              <span>Backend: {health.pqc_backend}</span>
              <span className="text-zinc-600">|</span>
              <span>Supabase: {health.supabase_enabled ? "Connected" : "Local"}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section id="about" className="scroll-mt-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neon-green">About</p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">Why Project Aegis?</h2>
          <p className="mt-4 text-base text-zinc-400 leading-relaxed">
            In a world where quantum computers threaten traditional cryptography, Project Aegis provides
            a future-proof solution for file integrity. Every upload is cryptographically sealed with
            NIST-standardized post-quantum algorithms, ensuring your proofs remain trustworthy for decades.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="group rounded-xl border border-emerald-300/10 bg-black/20 p-5 transition hover:border-emerald-300/30 hover:bg-black/40">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-500/10 group-hover:bg-emerald-500/20">
                  <Icon className="h-5 w-5 text-neon-green" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">{feature.title}</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-300/10 bg-gradient-to-r from-emerald-500/5 to-transparent p-8 sm:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neon-green">Workflow</p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">How It Works</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-4">
          {steps.map((step) => (
            <div key={step.num} className="relative text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-500/10 text-sm font-bold text-neon-green">
                {step.num}
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">{step.title}</h3>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-2xl border border-emerald-300/10 bg-black/20 p-8 sm:grid-cols-3 sm:p-10">
        <div className="text-center">
          <p className="text-3xl font-bold text-neon-green">SHA3-512</p>
          <p className="mt-1 text-xs text-zinc-500">Cryptographic Hash</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-neon-green">ML-DSA</p>
          <p className="mt-1 text-xs text-zinc-500">Post-Quantum Signature</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-neon-green">AES-256</p>
          <p className="mt-1 text-xs text-zinc-500">Encrypted Vault</p>
        </div>
      </section>

      <section className="pb-4 text-center">
        <p className="text-xs text-zinc-600">
          Built with FastAPI, React, Tailwind CSS, Supabase, and liboqs.
        </p>
      </section>
    </div>
  );
}
