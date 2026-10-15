"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import AppNav from "@/components/AppNav";
import {
  Camera,
  Check,
  X,
  Edit3,
  Star,
  Mail,
  Globe,
  Zap,
  GitBranch,
  BookOpen,
  TrendingUp,
  BarChart2,
  Award,
  FileText,
  Users,
  Bookmark,
  LogOut,
  Upload,
  ImageIcon,
  ExternalLink,
  Link2,
  RefreshCcw,
  ShieldCheck,
  Download,
  Trash2,
} from "lucide-react";

type ProfileUIProps = {
  loading: boolean;
  saving: boolean;
  uploading: boolean;
  editMode: boolean;

  email: string;
  name: string;
  dept: string;
  skills: string;
  interests: string;
  bio: string;
  orcidId: string;
googleScholarUrl: string;
researchGateUrl: string;
personalWebsiteUrl: string;

externalPublicationCount: number;
externalCitationCount: number;
externalHIndex: number;
externalMetricsSyncedAt: string;
syncingMetrics: boolean;
  /** When the ORCID iD was proven with ORCID sign-in ("" = not verified). */
  orcidVerifiedAt?: string;
  orcidSignInAvailable?: boolean;
  handleVerifyOrcid?: () => void;
  isAdmin?: boolean;
  downloadingData?: boolean;
  deletingAccount?: boolean;
  handleDownloadData?: () => void;
  handleDeleteAccount?: (typedConfirmation: string) => void;

  profilePicUrl: string;
  coverPhotoUrl: string;
  previewProfileUrl: string;
  previewCoverUrl: string;

  profilePicFile: File | null;
  coverPhotoFile: File | null;

  setEditMode: (value: boolean) => void;
  setName: (value: string) => void;
  setDept: (value: string) => void;
  setSkills: (value: string) => void;
  setInterests: (value: string) => void;
  setBio: (value: string) => void;
  setOrcidId: (value: string) => void;
setGoogleScholarUrl: (value: string) => void;
setResearchGateUrl: (value: string) => void;
setPersonalWebsiteUrl: (value: string) => void;
handleSyncExternalMetrics: () => void;

  handleProfilePicSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCoverPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleUploadProfilePic: () => void;
  handleUploadCover: () => void;
  handleSave: () => void;
  handleLogout: () => void;
};

function splitCommaItems(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getInitials(name: string, email: string) {
  const source = (name || email.split("@")[0] || "U").trim();
  const parts = source.split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}
function normalizeUrl(url: string) {
  const clean = url.trim();

  if (!clean) return "";

  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }

  return `https://${clean}`;
}

function formatSyncTime(value: string) {
  if (!value) return "Not synced yet";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "Not synced yet";
  }
}

// Self-hosted default cover (an abstract network), so profiles without a cover
// make no request to another site.
const DEFAULT_COVER = "/images/default-cover.svg";

export default function ProfileUI({
  loading,
  saving,
  uploading,
  editMode,
  email,
  name,
  dept,
  skills,
  interests,
bio,
orcidId,
googleScholarUrl,
researchGateUrl,
personalWebsiteUrl,
externalPublicationCount,
externalCitationCount,
externalHIndex,
externalMetricsSyncedAt,
syncingMetrics,
orcidVerifiedAt = "",
orcidSignInAvailable = false,
handleVerifyOrcid,
isAdmin = false,
downloadingData = false,
deletingAccount = false,
handleDownloadData,
handleDeleteAccount,
profilePicUrl,
  coverPhotoUrl,
  previewProfileUrl,
  previewCoverUrl,
  profilePicFile,
  coverPhotoFile,
  setEditMode,
  setName,
  setDept,
  setSkills,
  setInterests,
  setBio,
setOrcidId,
setGoogleScholarUrl,
setResearchGateUrl,
setPersonalWebsiteUrl,
handleSyncExternalMetrics,
handleProfilePicSelect,
  handleCoverPhotoSelect,
  handleUploadProfilePic,
  handleUploadCover,
  handleSave,
  handleLogout,
}: ProfileUIProps) {
  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  // With ORCID sign-in set up, numbers are only fetched for a verified iD.
  const syncNeedsVerification = orcidSignInAvailable && !orcidVerifiedAt;

  const initials = getInitials(name, email);
  const skillsList = useMemo(() => splitCommaItems(skills), [skills]);
  const interestsList = useMemo(() => splitCommaItems(interests), [interests]);

  // Profile completeness score — purely derived from filled fields
  const completionScore = useMemo(() => {
    const fields = [
      name,
      dept,
      bio,
      skills,
      interests,
      profilePicUrl,
      coverPhotoUrl,
    ];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [name, dept, bio, skills, interests, profilePicUrl, coverPhotoUrl]);

  const displayCover = previewCoverUrl || coverPhotoUrl || DEFAULT_COVER;
  const displayProfile = previewProfileUrl || profilePicUrl;

 if (loading) {
  return <ResearchGramSkeleton activePage="profile" variant="profile" />;
}
  return (
    <main className="min-h-screen bg-background pb-24 lg:pb-12">
      <AppNav activePage="profile" />

      {/* ── Cover ────────────────────────────────────────────────────────── */}
      <div className="relative h-52 lg:h-60 overflow-hidden bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 group">
        {/* Cover photo from Supabase Storage (or the default picture): a plain
            <img> so it does not use Vercel's image-optimization quota. If it
            cannot load, the gradient behind it shows instead of a broken image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={displayCover}
          src={displayCover}
          alt=""
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/60 via-indigo-700/20 to-transparent pointer-events-none" />

        {/* Cover photo controls */}
        <div className="absolute bottom-4 right-4 lg:right-6 flex items-center gap-2">
          {previewCoverUrl && coverPhotoFile ? (
            <button
              onClick={handleUploadCover}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? "Uploading…" : "Save Cover"}
            </button>
          ) : null}
          <button
            onClick={() => coverFileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm rounded-xl text-white text-sm font-semibold border border-white/20 hover:bg-black/55 transition-colors"
          >
            <Camera className="w-4 h-4" /> Change Cover
          </button>
          <input
            ref={coverFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverPhotoSelect}
          />
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 lg:px-6">
        {/* ── Profile header card ──────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border shadow-md -mt-10 relative z-10 p-5 lg:p-6 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 lg:gap-5">
              {/* Avatar */}
              <div className="-mt-20 flex-shrink-0 relative group">
                <div
                  className="w-24 h-24 lg:w-28 lg:h-28 rounded-2xl border-[5px] border-white shadow-lg overflow-hidden flex items-center justify-center text-white text-2xl font-extrabold"
                  style={{ backgroundColor: "#4f46e5" }}
                >
                  {displayProfile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayProfile}
                      alt={name || "Profile"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>

                {/* Avatar overlay control */}
                <button
                  onClick={() => profileFileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-primary text-white border-2 border-white shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
                  aria-label="Change profile photo"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={profileFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfilePicSelect}
                />
              </div>

              <div className="pt-2 min-w-0">
                {editMode ? (
                  <input
                    type="text"
                    aria-label="Full name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="text-xl font-extrabold text-foreground bg-muted rounded-xl px-3 py-1.5 border border-border focus:border-primary focus:bg-white focus:outline-none transition-all w-full max-w-[320px]"
                  />
                ) : (
                  <h1 className="text-xl font-extrabold text-foreground break-words">
                    {name || "Unnamed researcher"}
                  </h1>
                )}

                <p className="text-sm font-semibold text-primary mt-0.5">
                  {dept || "Add your department"}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="break-all">{email}</span>
                  </span>
                  {dept && !editMode && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BookOpen className="w-3 h-3 flex-shrink-0" />
                      {dept}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right buttons */}
            <div className="flex flex-wrap gap-2 pt-1 flex-shrink-0">
              {editMode ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Pending profile pic upload banner */}
          {previewProfileUrl && profilePicFile && (
            <div className="mt-4 p-3 rounded-xl bg-accent border border-primary/20 flex items-center gap-3 flex-wrap">
              <ImageIcon className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                New profile photo selected:{" "}
                <span className="font-semibold">{profilePicFile.name}</span>
              </span>
              <button
                onClick={handleUploadProfilePic}
                disabled={uploading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                {uploading ? "Uploading…" : "Upload Photo"}
              </button>
            </div>
          )}

          {/* Completion bar */}
          <div className="mt-5 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                Profile Completeness
              </span>
              <span className="text-xs font-extrabold text-primary">
                {completionScore}%
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${completionScore}%`,
                  background: "linear-gradient(90deg, #4f46e5, #3b82f6)",
                }}
              />
            </div>
            {completionScore < 100 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {completionScore < 60
                  ? "Add your bio, skills, interests, and photos to complete your researcher profile."
                  : "Almost there! Fill the remaining sections to reach 100%."}
              </p>
            )}
          </div>
        </div>

        {/* ── Content grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[296px_1fr] gap-5">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Academic info */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> Academic
                Information
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Department
                  </dt>
                  {editMode ? (
                    <input
                      type="text"
                      aria-label="Department"
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                      placeholder="e.g. Computer Science & Engineering"
                      className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                    />
                  ) : (
                    <dd className="text-sm text-foreground font-semibold">
                      {dept || (
                        <span className="text-muted-foreground italic font-normal">
                          Not set
                        </span>
                      )}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Email
                  </dt>
                  <dd className="text-sm text-foreground font-semibold break-all">
                    {email}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Skills */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Skills & Expertise
              </h2>
              {editMode ? (
                <>
                  <textarea
                    aria-label="Skills"
                    aria-describedby="profile-skills-hint"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="Python, TensorFlow, PyTorch, SQL, …"
                    rows={3}
                    className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                  />
                  <p id="profile-skills-hint" className="text-[11px] text-muted-foreground mt-1.5">
                    Separate skills with commas
                  </p>
                </>
              ) : skillsList.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skillsList.map((s) => (
                    <span
                      key={s}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors cursor-default"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No skills added yet. Click Edit Profile to add some.
                </p>
              )}
            </div>

            {/* Research interests */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Research
                Interests
              </h2>
              {editMode ? (
                <>
                  <textarea
                    aria-label="Research interests"
                    aria-describedby="profile-interests-hint"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="NLP, Machine Learning, IoT Security, …"
                    rows={3}
                    className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                  />
                  <p id="profile-interests-hint" className="text-[11px] text-muted-foreground mt-1.5">
                    Separate interests with commas
                  </p>
                </>
              ) : interestsList.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {interestsList.map((i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100 hover:bg-blue-100 transition-colors cursor-default"
                    >
                      {i}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No interests added yet.
                </p>
              )}
            </div>

            {/* Contact */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Contact
              </h2>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-foreground font-medium break-all">
                  {email}
                </span>
              </div>
            </div>
          </div>

          {/* ── Right column ────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* About / Bio */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">
                  About / Bio
                </h2>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              {editMode ? (
                <textarea
                  aria-label="Bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Write a short bio about your research focus, current work, and what you're passionate about…"
                  rows={6}
                  className="w-full text-sm px-4 py-3 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all leading-relaxed"
                />
              ) : bio ? (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {bio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No bio added yet. Tell other researchers about your work.
                </p>
              )}
            </div>

            {/* Research metrics — placeholders (data not in DB yet) */}
            {/* Research metrics */}
<div className="bg-card rounded-2xl border border-border shadow-sm p-5">
  <div className="flex items-center justify-between gap-3 mb-4">
  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
    <BarChart2 className="w-4 h-4 text-primary" /> Research Metrics
  </h2>

  <div className="flex flex-wrap items-center justify-end gap-2">
    {orcidId && (
      <a
        href={`https://orcid.org/${orcidId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] font-bold text-muted-foreground hover:border-primary/30 hover:text-primary"
      >
        ORCID
        <ExternalLink className="h-3 w-3" />
      </a>
    )}

    {orcidVerifiedAt ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Verified
      </span>
    ) : orcidSignInAvailable && handleVerifyOrcid ? (
      <button
        type="button"
        onClick={handleVerifyOrcid}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Verify with ORCID
      </button>
    ) : null}

    <button
      type="button"
      onClick={handleSyncExternalMetrics}
      disabled={syncingMetrics || !orcidId || syncNeedsVerification}
      title={syncNeedsVerification ? "Verify your ORCID iD first" : undefined}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <RefreshCcw
        className={`h-3 w-3 ${syncingMetrics ? "animate-spin" : ""}`}
      />
      {syncingMetrics ? "Syncing" : "Sync"}
    </button>
  </div>
</div>

  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    {[
      {
        label: "Publications",
        value: externalPublicationCount,
        cls: "text-violet-600 bg-violet-50",
        icon: FileText,
      },
      {
        label: "Collaborations",
        value: "—",
        cls: "text-blue-600 bg-blue-50",
        icon: Users,
      },
      {
        label: "Citations",
        value: externalCitationCount,
        cls: "text-amber-600 bg-amber-50",
        icon: Award,
      },
      {
        label: "Projects",
        value: "—",
        cls: "text-emerald-600 bg-emerald-50",
        icon: GitBranch,
      },
      {
        label: "Saved Posts",
        value: "—",
        cls: "text-rose-600 bg-rose-50",
        icon: Bookmark,
      },
      {
        label: "h-index",
        value: externalHIndex,
        cls: "text-slate-600 bg-slate-100",
        icon: BarChart2,
      },
    ].map(({ label, value, cls, icon: Icon }) => (
      <div
        key={label}
        className="bg-muted/40 rounded-2xl p-4 text-center border border-border hover:border-primary/20 transition-colors"
      >
        <div
          className={`w-10 h-10 rounded-xl ${cls} flex items-center justify-center mx-auto mb-2.5`}
        >
          <Icon className="w-5 h-5" />
        </div>

        <p className="text-2xl font-extrabold text-foreground leading-none">
          {typeof value === "number" ? value : value}
        </p>

        <p className="text-xs text-muted-foreground mt-1 font-medium">
          {label}
        </p>
      </div>
    ))}
  </div>

  <p className="text-[11px] text-muted-foreground mt-3 italic">
    Publications, citations and h-index come from OpenAlex for the ORCID iD
    above{orcidVerifiedAt ? ", which you verified with ORCID" : ""}. Last sync:{" "}
    {formatSyncTime(externalMetricsSyncedAt)}.
    {syncNeedsVerification && " Verify your ORCID iD to sync them."}
  </p>
</div>




{/* External research profiles */}
<div className="bg-card rounded-2xl border border-border shadow-sm p-5">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
      <Globe className="w-4 h-4 text-primary" /> External Research Profiles
    </h2>

    {!editMode && (
      <button
        onClick={() => setEditMode(true)}
        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
      >
        <Edit3 className="w-3 h-3" /> Edit
      </button>
    )}
  </div>

  {editMode ? (
    <div className="space-y-3">
      <div>
        <label htmlFor="profile-orcid" className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          ORCID iD
        </label>
        <input
          id="profile-orcid"
          type="text"
          aria-describedby="profile-orcid-hint"
          value={orcidId}
          onChange={(e) => setOrcidId(e.target.value)}
          placeholder="0000-0002-1825-0097"
          className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
        />
        <p id="profile-orcid-hint" className="mt-1 text-[11px] text-muted-foreground">
          Enter only your ORCID iD or full ORCID URL.
          {orcidVerifiedAt && " Changing it removes the verification."}
        </p>
      </div>

      <div>
        <label htmlFor="profile-google-scholar" className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          Google Scholar Profile URL
        </label>
        <input
          id="profile-google-scholar"
          type="url"
          value={googleScholarUrl}
          onChange={(e) => setGoogleScholarUrl(e.target.value)}
          placeholder="https://scholar.google.com/citations?user=..."
          className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
        />
      </div>

      <div>
        <label htmlFor="profile-researchgate" className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          ResearchGate Profile URL
        </label>
        <input
          id="profile-researchgate"
          type="url"
          value={researchGateUrl}
          onChange={(e) => setResearchGateUrl(e.target.value)}
          placeholder="https://www.researchgate.net/profile/..."
          className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
        />
      </div>

      <div>
        <label htmlFor="profile-website" className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          Personal Website / Portfolio
        </label>
        <input
          id="profile-website"
          type="url"
          value={personalWebsiteUrl}
          onChange={(e) => setPersonalWebsiteUrl(e.target.value)}
          placeholder="https://your-website.com"
          className="w-full text-sm px-3 py-2 bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
        />
      </div>
    </div>
  ) : (
    <div className="space-y-2">
      {[
        {
          label: "ORCID",
          value: orcidId,
          href: orcidId ? `https://orcid.org/${orcidId}` : "",
        },
        {
          label: "Google Scholar",
          value: googleScholarUrl,
          href: normalizeUrl(googleScholarUrl),
        },
        {
          label: "ResearchGate",
          value: researchGateUrl,
          href: normalizeUrl(researchGateUrl),
        },
        {
          label: "Website",
          value: personalWebsiteUrl,
          href: normalizeUrl(personalWebsiteUrl),
        },
      ]
        .filter((item) => item.value)
        .map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-primary"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{item.label}</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
          </a>
        ))}

      {!orcidId &&
        !googleScholarUrl &&
        !researchGateUrl &&
        !personalWebsiteUrl && (
          <p className="text-sm text-muted-foreground italic">
            No external research profiles added yet.
          </p>
        )}
    </div>
  )}
</div>










            {/* Mentorship — soft promo card */}
            <div
              className="rounded-2xl border border-indigo-100 p-5"
              style={{
                background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                  <Star className="w-4 h-4 text-indigo-600" /> Mentorship
                </h2>
              </div>
              <p className="text-sm text-indigo-700 mb-4 leading-relaxed">
                Connect with senior researchers for thesis guidance, paper
                writing, or career advice — or become a mentor yourself.
              </p>
              <a
                href="/mentorship"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
              >
                <Star className="w-4 h-4" /> Find Mentors
              </a>
            </div>

            {/* Account section */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Account
              </h2>
              <div className="space-y-2">
                <a
                  href="/auth/forgot-password"
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold text-foreground transition-colors"
                >
                  Change password
                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold text-foreground transition-colors"
                  >
                    Admin console
                    <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  </Link>
                )}
                {handleDownloadData && (
                  <button
                    type="button"
                    onClick={handleDownloadData}
                    disabled={downloadingData}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold text-foreground transition-colors disabled:opacity-60"
                  >
                    {downloadingData ? "Preparing your data…" : "Download my data"}
                    <Download className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                >
                  Logout from ResearchGram
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Link href="/privacy" className="font-semibold text-muted-foreground hover:text-foreground hover:underline">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="font-semibold text-muted-foreground hover:text-foreground hover:underline">
                  Terms of Service
                </Link>
              </p>

              {handleDeleteAccount && (
                <div className="mt-4 border-t border-border pt-4">
                  {!showDeleteAccount ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteAccount(true)}
                      className="text-xs font-semibold text-red-700 hover:underline"
                    >
                      Delete my account…
                    </button>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-red-800">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete account
                      </h3>
                      <p className="text-xs leading-relaxed text-red-800">
                        This permanently deletes your profile, posts, comments, messages, uploaded
                        files and connections, and the workspaces you own (for all their members).
                        Download your data first if you want a copy.
                      </p>
                      <div>
                        <label htmlFor="delete-account-confirm" className="block text-xs font-semibold text-red-800">
                          Type DELETE to confirm
                        </label>
                        <input
                          id="delete-account-confirm"
                          type="text"
                          autoComplete="off"
                          value={deleteConfirmation}
                          onChange={(event) => setDeleteConfirmation(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-foreground focus:border-red-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(deleteConfirmation)}
                          disabled={deletingAccount || deleteConfirmation.trim() !== "DELETE"}
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingAccount ? "Deleting…" : "Delete my account permanently"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteAccount(false);
                            setDeleteConfirmation("");
                          }}
                          disabled={deletingAccount}
                          className="rounded-lg px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
