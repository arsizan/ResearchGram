"use client";

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Sparkles,
  GitBranch,
  MessageSquare,
  FolderKanban,
  Bell,
  Lock,
  Video,
  Users,
  CheckCircle2,
  FileText,
  Menu,
  X,
  Send,
  Check,
} from "lucide-react";

/* ── Scroll-reveal wrapper (vanilla IntersectionObserver, no extra deps) ── */
function Reveal({
  children,
  delay = 0,
  className = "",
  direction = "up",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "left";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const revealClass = direction === "left" ? "reveal-left" : "reveal";

  return (
    <div
      ref={ref}
      className={`${revealClass} ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ── Department pills for the trust strip ── */
const RESEARCH_FIELDS = [
  "Computer Science", "Biomedical Engineering", "Physics", "Environmental Science",
  "Electrical Engineering", "Economics", "Psychology", "Materials Science",
  "Mathematics", "Public Health", "Chemistry", "Data Science",
];

const FEATURES = [
  {
    icon: FileText,
    title: "Research Feed",
    desc: "Publish ideas, papers, and datasets. Add co-authors, tags, and attachments. Get comments and collaboration interest from researchers worldwide.",
    color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: GitBranch,
    title: "Collaboration Requests",
    desc: "Send and receive structured requests to join a research idea. Accepted requests open a dedicated chat and shared workspace automatically.",
  color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: Lock,
    title: "Controlled Paper Access",
    desc: "Keep full papers private by default. Approve or reject access requests individually, with a full audit trail of who asked and when.",
   color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: FolderKanban,
    title: "Shared Workspaces",
    desc: "Turn an accepted collaboration into a real workspace — tasks, milestones, file storage, and a progress timeline, all in one place.",
   color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: MessageSquare,
    title: "Direct & Group Messaging",
    desc: "Direct chats with connections, collaboration threads tied to a request, and workspace group chats — with typing indicators and read receipts.",
   color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: Video,
    title: "Meetings & Recording",
    desc: "Spin up a video meeting from any workspace in one click, and record sessions locally for later review or absent teammates.",
  color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: Bell,
    title: "Real-Time Notifications",
    desc: "Stay on top of new requests, comments, and approvals the moment they happen, with a live unread indicator across the app.",
    color: "text-black",
bg: "bg-neutral-100",
  },
  {
    icon: Users,
    title: "Researcher Discovery",
    desc: "Search students, faculty, and alumni across institutions by department, skills, and research interests to find the right people to work with.",
   color: "text-black",
bg: "bg-neutral-100",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Build your academic profile",
    desc: "Add your department, skills, and research interests so the right collaborators can find you — and you can find them.",
  },
  {
    n: "02",
    title: "Post and discover research",
    desc: "Share an idea, paper, or dataset, or browse the feed to find research aligned with what you're working on.",
  },
  {
    n: "03",
    title: "Collaborate in a real workspace",
    desc: "Accepted requests open a dedicated workspace with tasks, files, milestones, and chat — so the work actually moves forward.",
  },
];

const PREVIEW_TABS = [
  { id: "feed", label: "Feed" },
  { id: "workspace", label: "Workspace" },
  { id: "messages", label: "Messages" },
] as const;

type PreviewTab = (typeof PREVIEW_TABS)[number]["id"];

function FeedPreviewMock() {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3 bg-muted/50 rounded-2xl p-3.5">
        <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          KU
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Dr. Karim Uddin</p>
          <p className="text-xs text-muted-foreground">CSE · Research Paper</p>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 flex-shrink-0">
          New
        </span>
      </div>
      <div>
        <h4 className="text-sm font-extrabold text-foreground">
          BanglaFormer: Low-Resource NLP for South Asian Languages
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
          Sharing our latest draft on extending transformer architectures to
          low-resource Bangla corpora — looking for collaborators with NLP or
          dataset experience.
        </p>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 rounded-xl border border-border">
        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground truncate">
          banglaformer-draft.pdf
        </span>
        <Lock className="w-3 h-3 text-amber-500 ml-auto flex-shrink-0" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button className="flex-1 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-white">
          Request to Collaborate
        </button>
        <button className="text-xs font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
          Comment
        </button>
      </div>
    </div>
  );
}

function WorkspacePreviewMock() {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-extrabold text-foreground">BanglaFormer Research</p>
          <p className="text-xs text-muted-foreground">Shared Workspace · 4 members</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
          Shared
        </span>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Progress</span>
          <span className="text-xs font-extrabold text-primary">68%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: "68%" }} />
        </div>
      </div>
      <div className="space-y-2">
        {[
          { label: "Collect Hindi/Urdu corpora", done: true },
          { label: "Train baseline model", done: true },
          { label: "Evaluate cross-lingual transfer", done: false },
        ].map((t) => (
          <div key={t.label} className="flex items-center gap-2.5 px-3 py-2 bg-muted/40 rounded-xl">
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${t.done ? "bg-emerald-500 border-emerald-500" : "border-border"}`}>
              {t.done && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <span className={`text-xs font-medium ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {t.label}
            </span>
          </div>
        ))}
      </div>
      <button className="w-full flex items-center justify-center gap-2 text-xs font-bold px-3 py-2.5 rounded-xl bg-primary text-white">
        <Video className="w-3.5 h-3.5" /> Start Meeting
      </button>
    </div>
  );
}

function MessagesPreviewMock() {
  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2.5 pb-3 border-b border-border">
        <div className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          FA
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Fatima Al-Rashid</p>
          <p className="text-[11px] text-emerald-600 font-medium">● Online</p>
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="flex">
          <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2 text-xs text-foreground max-w-[75%]">
            Got the corpus uploaded to the workspace files tab!
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-primary text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-xs max-w-[75%]">
            Perfect, I&apos;ll start preprocessing tonight 🚀
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-5 h-5 rounded-full bg-violet-500 flex-shrink-0" />
          <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <div className="flex-1 text-xs text-muted-foreground bg-muted rounded-2xl px-3.5 py-2.5">
          Type a message…
        </div>
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Send className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("feed");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="landing-monochrome min-h-screen bg-white overflow-x-hidden">
      {/* ───────── Nav ───────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/90 backdrop-blur-md border-b border-border shadow-sm"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 h-16 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <BrandLogo size={32} className="h-8 w-8" eager />
            <span className="font-extrabold text-lg tracking-tight text-foreground">
              Research<span className="text-primary">Gram</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1 mx-auto">
            {[
              { label: "Features", href: "#features" },
              { label: "How it Works", href: "#how-it-works" },
              { label: "Preview", href: "#preview" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted rounded-xl transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/auth/signup"
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors shadow-sm"
            >
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="md:hidden ml-auto p-2 rounded-xl hover:bg-muted transition-colors flex-shrink-0"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-border px-4 py-4 space-y-1 shadow-lg">
            {[
              { label: "Features", href: "#features" },
              { label: "How it Works", href: "#how-it-works" },
              { label: "Preview", href: "#preview" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted rounded-xl"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/auth/login"
                className="text-center px-4 py-2.5 text-sm font-semibold text-foreground border border-border rounded-xl"
              >
                Log in
              </Link>
              <Link
                href="/auth/signup"
                className="text-center px-4 py-2.5 text-sm font-bold text-white bg-primary rounded-xl"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ───────── Hero ───────── */}
      <section className="relative pt-32 pb-24 lg:pt-44 lg:pb-32 px-4 lg:px-6 overflow-hidden">
        {/* animated gradient blobs */}
        {/* <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-[-5%] w-[420px] h-[420px] rounded-full bg-indigo-300/30 blur-3xl animate-blob" />
          <div
            className="absolute top-[10%] right-[-8%] w-[380px] h-[380px] rounded-full bg-violet-300/30 blur-3xl animate-blob"
            style={{ animationDelay: "4s" }}
          />
          <div
            className="absolute bottom-[-15%] left-[20%] w-[400px] h-[400px] rounded-full bg-blue-200/30 blur-3xl animate-blob"
            style={{ animationDelay: "8s" }}
          />
        </div> */}
        {/* clean white background */}
<div className="absolute inset-0 -z-10 bg-white" />

        <div className="max-w-[1280px] mx-auto grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div>
            <Reveal direction="left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-black/15 text-black text-xs font-bold mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                A modern platform for global research collaboration
              </div>
            </Reveal>

            <Reveal direction="left" delay={80}>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-foreground leading-[1.08] tracking-tight">
                Where research ideas{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 text-primary">become collaborations</span>
                  <span className="absolute bottom-1 left-0 w-full h-3 bg-neutral-200 -z-0 rounded-full" />
                </span>
              </h1>
            </Reveal>

            <Reveal direction="left" delay={160}>
              <p className="text-base lg:text-lg text-muted-foreground leading-relaxed mt-6 max-w-xl">
                ResearchGram connects students, faculty, researchers, and
                alumni from institutions everywhere in one place — share
                research, find collaborators, manage workspaces, and message
                your team without juggling five different apps.
              </p>
            </Reveal>

            <Reveal direction="left" delay={240}>
              <div className="flex flex-wrap items-center gap-3 mt-8">
                <Link
                  href="/auth/signup"
                  className="group flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5"
                >
                  Create Free Account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/auth/login"
                  className="px-6 py-3.5 rounded-2xl border border-border bg-white text-sm font-bold text-foreground hover:bg-muted transition-colors"
                >
                  Log In
                </Link>
              </div>
            </Reveal>

            <Reveal direction="left" delay={320}>
              <div className="flex items-center gap-6 mt-10 flex-wrap">
                {[
                  "No setup cost", "Built for academic use", "Secure & private by default",
                ].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Hero visual: floating mockup cards */}
          <Reveal delay={200} className="relative">
            <div
              role="img"
              aria-label="Preview of ResearchGram: a research post in the feed, project progress and a new collaboration request"
            >
            <div inert className="relative mx-auto max-w-md lg:max-w-none">
              {/* main card */}
              <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-border p-5 animate-float-slow">
                <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    researchgram.app/feed
                  </span>
                </div>
                <FeedPreviewMock />
              </div>

              {/* floating workspace card */}
              <div className="hidden sm:block absolute -bottom-8 -left-10 z-20 w-52 bg-white rounded-2xl shadow-xl border border-border p-3.5 animate-float-slower">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Progress</span>
                  <span className="text-xs font-extrabold text-primary">68%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2.5">
                  <div className="h-full bg-primary rounded-full" style={{ width: "68%" }} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2 h-2 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground line-through">
                    Train baseline model
                  </span>
                </div>
              </div>

              {/* floating notification chip */}
              <div
                className="hidden sm:flex absolute -top-6 -right-6 z-20 items-center gap-2.5 bg-white rounded-2xl shadow-xl border border-border px-4 py-3 animate-float-slow"
                style={{ animationDelay: "1.5s" }}
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground">New collaboration request</p>
                  <p className="text-[10px] text-muted-foreground">2 min ago</p>
                </div>
              </div>
            </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Trust strip: scrolling research field marquee ───────── */}
      <Reveal>
        <section className="py-8 border-y border-border bg-white/60">
          <p className="text-center text-xs font-bold text-muted-foreground uppercase tracking-widest mb-5">
            Built for every research discipline
          </p>
          <div className="relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />
            <div className="flex w-max animate-marquee gap-3">
              {[...RESEARCH_FIELDS, ...RESEARCH_FIELDS].map((field, i) => (
                <span
                  key={`${field}-${i}`}
                  className="flex-shrink-0 px-4 py-2 rounded-full bg-card border border-border text-xs font-semibold text-muted-foreground whitespace-nowrap"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ───────── Features ───────── */}
      <section id="features" className="py-24 px-4 lg:px-6">
        <div className="max-w-[1280px] mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Everything in one place</span>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-foreground mt-3 tracking-tight">
              Every tool a research team actually needs
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              No more scattered group chats and lost files. ResearchGram brings
              the entire collaboration lifecycle — from idea to publication — into one platform.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div className="group bg-card rounded-2xl border border-border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 p-5 h-full">
                  <div className={`w-11 h-11 rounded-2xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <f.icon className={`w-5 h-5 ${f.color}`} />
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-1.5">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how-it-works" className="py-24 px-4 lg:px-6 bg-white/60 border-y border-border">
        <div className="max-w-[1100px] mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Simple by design</span>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-foreground mt-3 tracking-tight">
              From idea to active collaboration in three steps
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-indigo-200 via-primary/40 to-indigo-200" />
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 120}>
                <div className="relative text-center md:text-left">
                  <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center text-lg font-extrabold mx-auto md:mx-0 shadow-lg shadow-primary/20 relative z-10">
                    {step.n}
                  </div>
                  <h3 className="text-base font-bold text-foreground mt-5">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Product preview tabs ───────── */}
      <section id="preview" className="py-24 px-4 lg:px-6">
        <div className="max-w-[1100px] mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">See it in action</span>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-foreground mt-3 tracking-tight">
              A platform that feels familiar from day one
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              Switch between the feed, your workspace, and messages — all designed
              to feel as natural as the apps you already use.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="flex justify-center gap-2 mb-6">
              {PREVIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={previewTab === tab.id}
                  onClick={() => setPreviewTab(tab.id)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    previewTab === tab.id
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div
              role="img"
              aria-label={`Preview of the ResearchGram ${previewTab} page`}
              className="max-w-md mx-auto bg-white rounded-3xl shadow-2xl border border-border overflow-hidden"
            >
              <div inert>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-muted/40">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-bold text-muted-foreground bg-card px-2.5 py-1 rounded-full ml-2">
                  researchgram.app/{previewTab}
                </span>
              </div>
              <div key={previewTab} style={{ animation: "fade-in-up 0.4s ease-out" }}>
                {previewTab === "feed" && <FeedPreviewMock />}
                {previewTab === "workspace" && <WorkspacePreviewMock />}
                {previewTab === "messages" && <MessagesPreviewMock />}
              </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── CTA banner ───────── */}
      <section className="px-4 lg:px-6 pb-24">
        <Reveal>
         <div className="max-w-[1100px] mx-auto relative overflow-hidden rounded-3xl bg-black px-8 py-14 lg:px-16 lg:py-16 text-center shadow-2xl shadow-black/20">
            <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl animate-gentle-pulse" />
            <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full bg-white/10 blur-2xl animate-gentle-pulse" style={{ animationDelay: "1.5s" }} />

            <div className="relative">
              <h2 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                Ready to find your next research collaborator?
              </h2>
              <p className="text-indigo-100 mt-3 max-w-lg mx-auto leading-relaxed">
                Join ResearchGram and turn your next idea into a real, organized
                collaboration with the global research community.
              </p>
              <div className="flex flex-wrap justify-center gap-3 mt-8">
                <Link
                  href="/auth/signup"
                 className="flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-black text-sm font-bold hover:bg-neutral-100 transition-all shadow-lg hover:-translate-y-0.5"
                >
                  Create Free Account <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/auth/login"
                  className="px-7 py-3.5 rounded-2xl border border-white/30 text-white text-sm font-bold hover:bg-white/10 transition-colors"
                >
                  I already have an account
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-border bg-white/60 px-4 lg:px-6 py-10">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo size={32} className="h-8 w-8" />
            <span className="font-extrabold text-foreground">
              Research<span className="text-primary">Gram</span>
            </span>
          </Link>
          <p className="text-xs text-muted-foreground text-center">
            Digital Research Collaboration Platform for Students, Faculty &amp; Researchers Worldwide
          </p>
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <Link href="/auth/login" className="hover:text-foreground transition-colors">Log in</Link>
            <Link href="/auth/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
