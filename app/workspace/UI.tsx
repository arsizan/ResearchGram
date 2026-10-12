"use client";

import { useMemo, useRef, useState } from "react";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import AppNav from "@/components/AppNav";
import LocalRecorder from "./LocalRecorder";
import {
  Plus,
  X,
  Check,
  Upload,
  Calendar,
  Clock,
  Users,
  Video,
  FileText,
  Database,
  Code,
  Image as ImageIcon,
  Folder,
  Paperclip,
  CheckSquare,
  Flag,
  Activity,
  Play,
  MonitorPlay,
  ChevronDown,
  ExternalLink,
  Trash2,
  Lock,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Hash,
  Layers,
} from "lucide-react";

// ─── Types (preserved verbatim) ──────────────────────────────────────────────

export type WorkspaceType = "personal" | "shared";

export type WorkspaceTab =
  | "overview"
  | "tasks"
  | "milestones"
  | "files"
  | "members"
  | "meetings"
  | "recordings"
  | "updates";

export type Workspace = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  research_area: string | null;
  workspace_type: WorkspaceType | null;
  status: string;
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkspaceTask = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkspaceFile = {
  id: string;
  workspace_id: string;
  uploaded_by: string;
  file_url: string | null;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  file_ext: string | null;
  file_size: number | null;
  file_category: string;
  created_at: string | null;
};

export type WorkspaceMilestone = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkspaceMeeting = {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  provider: string;
  room_name: string;
  meeting_url: string;
  starts_at: string | null;
  created_at: string | null;
};

export type WorkspaceRecording = {
  id: string;
  workspace_id: string;
  meeting_id: string | null;
  recorded_by: string;
  title: string;
  file_name: string;
  file_type: string | null;
  duration_seconds: number | null;
  saved_location_note: string | null;
  created_at: string | null;
};

export type WorkspaceUpdate = {
  id: string;
  workspace_id: string;
  author_id: string;
  update_type: string;
  body: string;
  created_at: string | null;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  department: string | null;
  profile_pic_url: string | null;
  skills: string | null;
  interests: string | null;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string | null;
  profile: Profile | null;
};

type StatusCounts = {
  todo: number;
  in_progress: number;
  review: number;
  completed: number;
};

type WorkspaceUIProps = {
  loading: boolean;
  userId: string;

  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;

  workspaces: Workspace[];
  selectedWorkspaceId: string;
  selectedWorkspace: Workspace | null;

  tasks: WorkspaceTask[];
  workspaceFiles: WorkspaceFile[];
  members: WorkspaceMember[];
  milestones: WorkspaceMilestone[];
  meetings: WorkspaceMeeting[];
  recordings: WorkspaceRecording[];
  updates: WorkspaceUpdate[];

  collaboratorOptions: Profile[];
  selectedCollaboratorId: string;

  creatingWorkspace: boolean;
  addingTask: boolean;
  uploadingFile: boolean;
  addingMember: boolean;
  savingMilestone: boolean;
  savingMeeting: boolean;
  savingUpdate: boolean;

  workspaceType: WorkspaceType;
  workspaceTitle: string;
  workspaceDescription: string;
  workspaceResearchArea: string;
  workspaceDueDate: string;

  taskTitle: string;
  taskDescription: string;
  taskPriority: string;
  taskDueDate: string;
  taskAssignedTo: string;

  milestoneTitle: string;
  milestoneDescription: string;
  milestoneDueDate: string;

  meetingTitle: string;
  meetingStart: string;
  activeMeeting: WorkspaceMeeting | null;

  updateText: string;
  selectedFiles: File[];

  progress: number;
  statusCounts: StatusCounts;

  setWorkspaceType: (value: WorkspaceType) => void;
  setWorkspaceTitle: (value: string) => void;
  setWorkspaceDescription: (value: string) => void;
  setWorkspaceResearchArea: (value: string) => void;
  setWorkspaceDueDate: (value: string) => void;

  setTaskTitle: (value: string) => void;
  setTaskDescription: (value: string) => void;
  setTaskPriority: (value: string) => void;
  setTaskDueDate: (value: string) => void;
  setTaskAssignedTo: (value: string) => void;

  setMilestoneTitle: (value: string) => void;
  setMilestoneDescription: (value: string) => void;
  setMilestoneDueDate: (value: string) => void;

  setMeetingTitle: (value: string) => void;
  setMeetingStart: (value: string) => void;
  setActiveMeeting: (meeting: WorkspaceMeeting | null) => void;

  setUpdateText: (value: string) => void;
  setSelectedFiles: (files: File[]) => void;
  setSelectedCollaboratorId: (value: string) => void;

  handleSelectWorkspace: (workspaceId: string) => void;
  handleCreateWorkspace: () => void;
  handleConvertToShared: () => void;
  handleAddWorkspaceMember: () => void;
  handleRemoveWorkspaceMember: (member: WorkspaceMember) => void;
  handleAddTask: () => void;
  handleUpdateTaskStatus: (taskId: string, nextStatus: string) => void;
  handleUploadFiles: () => void;
  handleAddMilestone: () => void;
  handleUpdateMilestoneStatus: (milestoneId: string, nextStatus: string) => void;
  handleCreateMeeting: () => void;
  handleAddUpdate: () => void;
  handleReloadCurrentWorkspace: () => void;
};

// ─── Constants (preserved verbatim) ──────────────────────────────────────────

const TABS: { value: WorkspaceTab; label: string; icon: typeof CheckSquare }[] = [
  { value: "overview",   label: "Overview",   icon: Layers },
  { value: "tasks",      label: "Tasks",      icon: CheckSquare },
  { value: "milestones", label: "Milestones", icon: Flag },
  { value: "files",      label: "Files",      icon: Folder },
  { value: "members",    label: "Members",    icon: Users },
  { value: "meetings",   label: "Meetings",   icon: Video },
  { value: "recordings", label: "Recordings", icon: MonitorPlay },
  { value: "updates",    label: "Updates",    icon: Activity },
];

const TASK_STATUS = [
  { value: "todo",        label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "review",      label: "Review" },
  { value: "completed",   label: "Completed" },
];

const MILESTONE_STATUS = [
  { value: "planned",     label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
];

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
];

// ─── Helpers (preserved + extended) ──────────────────────────────────────────

function formatDate(dateString: string | null) {
  if (!dateString) return "No deadline";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "short", day: "numeric",
    }).format(new Date(dateString));
  } catch {
    return "Invalid date";
  }
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return "Instant meeting";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    }).format(new Date(dateString));
  } catch {
    return "Invalid time";
  }
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "Unknown size";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "Unknown duration";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function statusStyle(status: string) {
  if (status === "completed")   return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "in_progress") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "review")      return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === "planned")     return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function priorityStyle(priority: string) {
  if (priority === "high")   return "bg-red-50 text-red-700 border-red-200";
  if (priority === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function getMemberName(memberId: string | null, members: WorkspaceMember[]) {
  if (!memberId) return "Unassigned";
  const member = members.find((item) => item.user_id === memberId);
  return (
    member?.profile?.full_name ||
    member?.profile?.email?.split("@")[0] ||
    "Workspace member"
  );
}

function getProfileName(profile: Profile | null) {
  return profile?.full_name || profile?.email?.split("@")[0] || "Researcher";
}

function getInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function colorFromString(s: string) {
  const palette = ["#4f46e5", "#7c3aed", "#0e7490", "#047857", "#dc2626", "#b45309"];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function fileIcon(category: string) {
  if (category === "image")   return { Icon: ImageIcon, color: "text-blue-500",     bg: "bg-blue-50"     };
  if (category === "paper")   return { Icon: FileText,  color: "text-red-500",      bg: "bg-red-50"      };
  if (category === "dataset") return { Icon: Database,  color: "text-emerald-500",  bg: "bg-emerald-50"  };
  if (category === "code")    return { Icon: Code,      color: "text-slate-600",    bg: "bg-slate-100"   };
  return { Icon: Paperclip, color: "text-muted-foreground", bg: "bg-muted" };
}

// ─── Small sub-components ────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, message }: { icon: typeof CheckSquare; title: string; message: string }) {
  return (
    <div className="bg-muted/40 rounded-2xl border border-dashed border-border p-10 text-center">
      <Icon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-sm mx-auto">{message}</p>
    </div>
  );
}

function WorkspaceTypeBadge({ type }: { type: WorkspaceType | null }) {
  const safe = type || "personal";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
        safe === "personal"
          ? "bg-slate-50 text-slate-700 border-slate-200"
          : "bg-indigo-50 text-indigo-700 border-indigo-200"
      }`}
    >
      {safe === "personal" ? <Lock className="w-2.5 h-2.5" /> : <Users className="w-2.5 h-2.5" />}
      {safe === "personal" ? "Personal" : "Shared"}
    </span>
  );
}

function Avatar({ name, picUrl, size = "md" }: { name: string; picUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" }[size];
  const color = colorFromString(name || "?");
  return (
    <div
      className={`${s} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ backgroundColor: color }}
    >
      {picUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

// ─── Main UI ─────────────────────────────────────────────────────────────────

export default function WorkspaceUI({
  loading, userId,
  activeTab, setActiveTab,
  workspaces, selectedWorkspaceId, selectedWorkspace,
  tasks, workspaceFiles, members, milestones, meetings, recordings, updates,
  collaboratorOptions, selectedCollaboratorId,
  creatingWorkspace, addingTask, uploadingFile, addingMember,
  savingMilestone, savingMeeting, savingUpdate,
  workspaceType, workspaceTitle, workspaceDescription, workspaceResearchArea, workspaceDueDate,
  taskTitle, taskDescription, taskPriority, taskDueDate, taskAssignedTo,
  milestoneTitle, milestoneDescription, milestoneDueDate,
  meetingTitle, meetingStart, activeMeeting,
  updateText, selectedFiles,
  progress, statusCounts,
  setWorkspaceType, setWorkspaceTitle, setWorkspaceDescription, setWorkspaceResearchArea, setWorkspaceDueDate,
  setTaskTitle, setTaskDescription, setTaskPriority, setTaskDueDate, setTaskAssignedTo,
  setMilestoneTitle, setMilestoneDescription, setMilestoneDueDate,
  setMeetingTitle, setMeetingStart, setActiveMeeting,
  setUpdateText, setSelectedFiles, setSelectedCollaboratorId,
  handleSelectWorkspace, handleCreateWorkspace, handleConvertToShared,
  handleAddWorkspaceMember, handleRemoveWorkspaceMember,
  handleAddTask, handleUpdateTaskStatus, handleUploadFiles,
  handleAddMilestone, handleUpdateMilestoneStatus,
  handleCreateMeeting, handleAddUpdate, handleReloadCurrentWorkspace,
}: WorkspaceUIProps) {
  const isOwner = Boolean(selectedWorkspace && selectedWorkspace.owner_id === userId);
  const isPersonal = selectedWorkspace?.workspace_type === "personal";

  const [showCreateForm, setShowCreateForm] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // Sort + group tasks by status for cleaner view
  const tasksByStatus = useMemo(() => {
    const groups: Record<string, WorkspaceTask[]> = {
      todo: [], in_progress: [], review: [], completed: [],
    };
    tasks.forEach((t) => {
      const key = (groups[t.status] ? t.status : "todo") as keyof typeof groups;
      groups[key].push(t);
    });
    return groups;
  }, [tasks]);

  // Sort milestones by status order
  const milestonesSorted = useMemo(() => {
    const order: Record<string, number> = { in_progress: 0, planned: 1, completed: 2 };
    return [...milestones].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));
  }, [milestones]);

if (loading) {
  return <ResearchGramSkeleton activePage="workspace" variant="workspace" />;
}

  return (
    <main className="min-h-screen bg-background pb-24 lg:pb-12">
      <AppNav activePage="workspace" />
      {/* Page title for screen readers; the design has no visible one (RG-32). */}
      <h1 className="sr-only">Workspace</h1>

      <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-5">
          {/* ────────────────── LEFT SIDEBAR ───────────────────────────── */}
          <section aria-label="Your workspaces" className="lg:w-72 flex-shrink-0 space-y-4">
            {/* Create buttons */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Create New
                </p>
                {showCreateForm && (
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    aria-label="Close the new workspace form"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {!showCreateForm ? (
                <>
                  <button
                    onClick={() => { setWorkspaceType("personal"); setShowCreateForm(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Personal Workspace
                  </button>
                  <button
                    onClick={() => { setWorkspaceType("shared"); setShowCreateForm(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-accent text-primary text-sm font-semibold border border-primary/20 hover:bg-indigo-100 transition-colors"
                  >
                    <Users className="w-4 h-4" /> Shared Workspace
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  {/* Type toggle */}
                  <div className="grid grid-cols-2 gap-2">
                    {(["personal", "shared"] as WorkspaceType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={workspaceType === t}
                        onClick={() => setWorkspaceType(t)}
                        className={`px-2 py-2 rounded-lg text-xs font-bold transition-all border ${
                          workspaceType === t
                            ? "bg-primary text-white border-primary"
                            : "bg-muted text-muted-foreground border-transparent hover:border-border"
                        }`}
                      >
                        {t === "personal" ? "Personal" : "Shared"}
                      </button>
                    ))}
                  </div>

                  <input
                    aria-label="Project title"
                    value={workspaceTitle}
                    onChange={(e) => setWorkspaceTitle(e.target.value)}
                    placeholder="Project title"
                    className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                  />
                  <input
                    aria-label="Research area"
                    value={workspaceResearchArea}
                    onChange={(e) => setWorkspaceResearchArea(e.target.value)}
                    placeholder="Research area (AI, IoT, NLP…)"
                    className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                  />
                  <textarea
                    aria-label="Short description"
                    value={workspaceDescription}
                    onChange={(e) => setWorkspaceDescription(e.target.value)}
                    placeholder="Short description…"
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                  />
                  <div>
                    <label htmlFor="workspace-due-date" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                      Deadline (optional)
                    </label>
                    <input
                      id="workspace-due-date"
                      type="date"
                      value={workspaceDueDate}
                      onChange={(e) => setWorkspaceDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={async () => { await handleCreateWorkspace(); setShowCreateForm(false); }}
                    disabled={creatingWorkspace || !workspaceTitle.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {creatingWorkspace && (
                      <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    )}
                    {creatingWorkspace ? "Creating…" : `Create ${workspaceType === "personal" ? "Personal" : "Shared"} Workspace`}
                  </button>
                </div>
              )}
            </div>

            {/* Workspaces list */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                My Workspaces ({workspaces.length})
              </p>
              <div className="space-y-1.5">
                {workspaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-3">
                    No workspaces yet. Create one to begin tracking research progress.
                  </p>
                ) : (
                  workspaces.map((ws) => {
                    const isActive = selectedWorkspaceId === ws.id;
                    return (
                      <button
                        key={ws.id}
                        onClick={() => handleSelectWorkspace(ws.id)}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                          isActive
                            ? "bg-accent border border-primary/20"
                            : "hover:bg-muted border border-transparent"
                        }`}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 font-bold text-xs"
                          style={{ backgroundColor: colorFromString(ws.title) }}
                        >
                          {getInitials(ws.title || "?")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                            {ws.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <WorkspaceTypeBadge type={ws.workspace_type} />
                            <span className="text-[10px] text-muted-foreground truncate">
                              {ws.research_area || "General"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Tip card */}
            <div className="bg-gradient-to-br from-indigo-50 via-blue-50 to-indigo-50 rounded-2xl border border-indigo-100 p-4">
              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Workspace Tip
              </p>
              <p className="text-xs text-indigo-700 leading-relaxed">
                Start personal for early drafts, then convert to shared when collaborators join. Local recordings are downloaded to your computer only — metadata stays on ResearchGram.
              </p>
            </div>
          </section>

          {/* ────────────────── MAIN AREA ──────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">
            {!selectedWorkspace ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent flex items-center justify-center">
                  <Folder className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-extrabold text-foreground">Select or create a workspace</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                  Pick a workspace from the left sidebar to see tasks, milestones, files, meetings, recordings, and team updates.
                </p>
              </div>
            ) : (
              <>
                {/* Workspace header */}
                <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg flex-shrink-0"
                        style={{ backgroundColor: colorFromString(selectedWorkspace.title) }}
                      >
                        {getInitials(selectedWorkspace.title || "?")}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-extrabold text-foreground">{selectedWorkspace.title}</h2>
                          <WorkspaceTypeBadge type={selectedWorkspace.workspace_type} />
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full capitalize">
                            {selectedWorkspace.status}
                          </span>
                          {isOwner && (
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                              Owner
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {selectedWorkspace.description || "No description provided."}
                        </p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {selectedWorkspace.research_area || "General research"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(selectedWorkspace.due_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {members.length} member{members.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setActiveTab("meetings")}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
                      >
                        <Video className="w-4 h-4" /> Start / Join Meeting
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        Overall Progress
                      </span>
                      <span className="text-sm font-extrabold text-primary">{progress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progress}%`, background: "linear-gradient(90deg, #4f46e5, #3b82f6)" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden -mx-4 px-4 lg:mx-0 lg:px-0">
                  <div className="flex gap-1 bg-card rounded-2xl border border-border shadow-sm p-1.5 min-w-max lg:min-w-0">
                    {TABS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={activeTab === value}
                        onClick={() => setActiveTab(value)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${
                          activeTab === value
                            ? "bg-primary text-white shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── OVERVIEW ─────────────────────────────────────────── */}
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    {/* Status grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: "To Do",       value: statusCounts.todo,        icon: CheckSquare, color: "text-slate-600 bg-slate-100"   },
                        { label: "In Progress", value: statusCounts.in_progress, icon: RefreshCw,   color: "text-blue-600 bg-blue-50"      },
                        { label: "Review",      value: statusCounts.review,      icon: AlertCircle, color: "text-violet-600 bg-violet-50"  },
                        { label: "Completed",   value: statusCounts.completed,   icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="bg-card rounded-2xl border border-border shadow-sm p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                                {label}
                              </p>
                              <p className="text-3xl font-extrabold text-foreground mt-1">{value}</p>
                            </div>
                            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
                              <Icon className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick action cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: "Members",    value: members.length,    icon: Users,       color: "text-indigo-600 bg-indigo-50", tab: "members" as const   },
                        { label: "Milestones", value: milestones.length, icon: Flag,        color: "text-violet-600 bg-violet-50", tab: "milestones" as const },
                        { label: "Meetings",   value: meetings.length,   icon: Video,       color: "text-blue-600 bg-blue-50",     tab: "meetings" as const   },
                        { label: "Files",      value: workspaceFiles.length, icon: Folder,  color: "text-emerald-600 bg-emerald-50", tab: "files" as const     },
                      ].map(({ label, value, icon: Icon, color, tab }) => (
                        <button
                          key={label}
                          onClick={() => setActiveTab(tab)}
                          className="bg-card rounded-2xl border border-border shadow-sm p-4 text-left hover:shadow-md hover:border-primary/20 transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-3xl font-extrabold text-foreground">{value}</p>
                              <p className="text-xs font-semibold text-muted-foreground mt-0.5">{label}</p>
                            </div>
                            <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
                              <Icon className="w-4 h-4" />
                            </div>
                          </div>
                          <p className="text-[11px] text-primary font-semibold mt-2 flex items-center gap-1">
                            View <ArrowRight className="w-3 h-3" />
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Recent updates preview */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary" /> Recent Activity
                        </h3>
                        <button
                          onClick={() => setActiveTab("updates")}
                          className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                        >
                          View all <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                      {updates.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No project updates yet. Post your first update under the Updates tab.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {updates.slice(0, 4).map((u) => (
                            <div key={u.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                              <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                                <Activity className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{u.body}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {formatDateTime(u.created_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── TASKS ─────────────────────────────────────────────── */}
                {activeTab === "tasks" && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                    {/* Task list */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between p-5 border-b border-border">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-primary" /> Tasks ({tasks.length})
                        </h3>
                      </div>
                      {tasks.length === 0 ? (
                        <div className="p-5">
                          <EmptyState
                            icon={CheckSquare}
                            title="No tasks yet"
                            message="Add literature review, dataset preparation, model development, writing, or final presentation tasks."
                          />
                        </div>
                      ) : (
                        TASK_STATUS.map((status) => {
                          const items = tasksByStatus[status.value] || [];
                          if (!items.length) return null;
                          return (
                            <div key={status.value} className="border-b border-border last:border-0">
                              <div className="px-5 py-2.5 bg-muted/30 flex items-center gap-2">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusStyle(status.value)}`}>
                                  {status.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {items.length} task{items.length === 1 ? "" : "s"}
                                </span>
                              </div>
                              {items.map((task) => {
                                const assignee = members.find((m) => m.user_id === task.assigned_to);
                                return (
                                  <div
                                    key={task.id}
                                    className="px-5 py-4 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div
                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                          task.status === "completed"
                                            ? "border-emerald-500 bg-emerald-500"
                                            : "border-border"
                                        }`}
                                      >
                                        {task.status === "completed" && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className={`text-sm font-semibold ${
                                            task.status === "completed"
                                              ? "line-through text-muted-foreground"
                                              : "text-foreground"
                                          }`}
                                        >
                                          {task.title}
                                        </p>
                                        {task.description && (
                                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                                            {task.description}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityStyle(task.priority)}`}>
                                            {task.priority} priority
                                          </span>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {formatDate(task.due_date)}
                                          </span>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Avatar
                                              name={assignee ? getProfileName(assignee.profile) : "Unassigned"}
                                              picUrl={assignee?.profile?.profile_pic_url}
                                              size="sm"
                                            />
                                            {getMemberName(task.assigned_to, members)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="relative">
                                        <select
                                          aria-label={`Status of ${task.title}`}
                                          value={task.status}
                                          onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                                          className="appearance-none pl-3 pr-7 py-1.5 text-xs font-semibold bg-muted rounded-lg border border-border focus:border-primary focus:outline-none cursor-pointer"
                                        >
                                          {TASK_STATUS.map((s) => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                          ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Add task form */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 h-fit space-y-3 lg:sticky lg:top-[76px]">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Plus className="w-4 h-4 text-primary" /> Add Task
                      </h3>
                      <input
                        aria-label="Task title"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Task title"
                        className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                      />
                      <textarea
                        aria-label="Task description"
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <select
                            aria-label="Priority"
                            value={taskPriority}
                            onChange={(e) => setTaskPriority(e.target.value)}
                            className="w-full appearance-none pl-3 pr-7 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:outline-none cursor-pointer"
                          >
                            {PRIORITY_OPTIONS.map((p) => (
                              <option key={p.value} value={p.value}>{p.label} priority</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                        <input
                          type="date"
                          aria-label="Task due date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <select
                          aria-label="Assign to"
                          value={taskAssignedTo}
                          onChange={(e) => setTaskAssignedTo(e.target.value)}
                          className="w-full appearance-none pl-3 pr-7 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:outline-none cursor-pointer"
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {getProfileName(m.profile)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      </div>
                      <button
                        onClick={handleAddTask}
                        disabled={addingTask || !taskTitle.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {addingTask ? (
                          <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        {addingTask ? "Adding…" : "Add Task"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── MILESTONES ────────────────────────────────────────── */}
                {activeTab === "milestones" && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                    {/* Timeline */}
                    <div className="space-y-3">
                      {milestonesSorted.length === 0 ? (
                        <EmptyState
                          icon={Flag}
                          title="No milestones yet"
                          message="Add major checkpoints like proposal, dataset, implementation, result analysis, or final report."
                        />
                      ) : (
                        <div className="relative">
                          <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-border hidden sm:block" />
                          <div className="space-y-3">
                            {milestonesSorted.map((m) => {
                              const cls =
                                m.status === "completed"
                                  ? { dot: "bg-emerald-500 border-emerald-500", Icon: CheckCircle, iconColor: "text-emerald-500" }
                                  : m.status === "in_progress"
                                    ? { dot: "bg-amber-400 border-amber-400", Icon: RefreshCw, iconColor: "text-amber-500" }
                                    : { dot: "bg-slate-200 border-slate-300", Icon: Flag, iconColor: "text-slate-400" };
                              return (
                                <div key={m.id} className="flex items-start gap-4">
                                  <div
                                    className={`w-12 h-12 rounded-full border-2 ${cls.dot} bg-white flex items-center justify-center flex-shrink-0 relative z-10`}
                                  >
                                    <cls.Icon className={`w-5 h-5 ${cls.iconColor}`} />
                                  </div>
                                  <div className="flex-1 bg-card rounded-2xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <h4 className="text-sm font-bold text-foreground">{m.title}</h4>
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyle(m.status)}`}>
                                            {m.status.replaceAll("_", " ")}
                                          </span>
                                        </div>
                                        {m.description && (
                                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            {m.description}
                                          </p>
                                        )}
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                                          <Calendar className="w-3 h-3" />
                                          {formatDate(m.due_date)}
                                        </span>
                                      </div>
                                      <div className="relative">
                                        <select
                                          aria-label={`Status of ${m.title}`}
                                          value={m.status}
                                          onChange={(e) => handleUpdateMilestoneStatus(m.id, e.target.value)}
                                          className="appearance-none pl-3 pr-7 py-1.5 text-xs font-semibold bg-muted rounded-lg border border-border focus:border-primary focus:outline-none cursor-pointer"
                                        >
                                          {MILESTONE_STATUS.map((s) => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                          ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Add milestone */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 h-fit space-y-3 lg:sticky lg:top-[76px]">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Plus className="w-4 h-4 text-primary" /> Add Milestone
                      </h3>
                      <input
                        aria-label="Milestone title"
                        value={milestoneTitle}
                        onChange={(e) => setMilestoneTitle(e.target.value)}
                        placeholder="Milestone title"
                        className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                      />
                      <textarea
                        aria-label="Milestone description"
                        value={milestoneDescription}
                        onChange={(e) => setMilestoneDescription(e.target.value)}
                        placeholder="What does completing this milestone mean?"
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                      />
                      <input
                        type="date"
                        aria-label="Milestone due date"
                        value={milestoneDueDate}
                        onChange={(e) => setMilestoneDueDate(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:outline-none transition-all"
                      />
                      <button
                        onClick={handleAddMilestone}
                        disabled={savingMilestone || !milestoneTitle.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {savingMilestone ? (
                          <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        {savingMilestone ? "Adding…" : "Add Milestone"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── FILES ─────────────────────────────────────────────── */}
                {activeTab === "files" && (
                  <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-5 border-b border-border">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Folder className="w-4 h-4 text-primary" /> Workspace Files ({workspaceFiles.length})
                      </h3>
                      <button
                        onClick={() => filesInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Pick Files
                      </button>
                      <input
                        ref={filesInputRef}
                        type="file"
                        multiple
                        onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                        className="hidden"
                      />
                    </div>

                    {/* Drop zone */}
                    <div
                      role="button"
                      tabIndex={0}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const dropped = Array.from(e.dataTransfer.files || []);
                        if (dropped.length > 0) setSelectedFiles(dropped);
                      }}
                      onClick={() => filesInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          filesInputRef.current?.click();
                        }
                      }}
                      className="mx-5 mt-4 mb-2 border-2 border-dashed border-border rounded-2xl p-6 text-center hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer"
                    >
                      <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-semibold text-foreground">Drop research files here or click to select</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Papers, datasets, code, figures, presentations — meeting recordings download locally instead.
                      </p>
                    </div>

                    {/* Selected files queue */}
                    {selectedFiles.length > 0 && (
                      <div className="mx-5 mb-4 p-3 rounded-xl bg-accent/40 border border-primary/15">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2">
                          Ready to upload ({selectedFiles.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {selectedFiles.map((f, i) => (
                            <span
                              key={`${f.name}-${i}`}
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-card text-primary text-[11px] font-medium rounded-lg border border-primary/15"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span className="max-w-[160px] truncate">{f.name}</span>
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={handleUploadFiles}
                          disabled={uploadingFile}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
                        >
                          {uploadingFile ? (
                            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          {uploadingFile ? "Uploading…" : "Upload All Files"}
                        </button>
                      </div>
                    )}

                    {/* File list */}
                    {workspaceFiles.length === 0 ? (
                      <div className="px-5 pb-5">
                        <EmptyState
                          icon={Folder}
                          title="No shared files yet"
                          message="Upload research documents, datasets, code, or results above. Files are accessible to all workspace members."
                        />
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {workspaceFiles.map((file) => {
                          const { Icon, color, bg } = fileIcon(file.file_category);
                          return (
                            <a
                              key={file.id}
                              href={file.file_url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                            >
                              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                                <Icon className={`w-5 h-5 ${color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{file.original_name}</p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {file.file_category.replaceAll("_", " ")} · {formatFileSize(file.file_size)}
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                Open <ExternalLink className="w-3 h-3" />
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── MEMBERS ───────────────────────────────────────────── */}
                {activeTab === "members" && (
                  <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-border">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" /> Members ({members.length})
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Personal workspaces are private. Shared workspaces can have collaborators and assigned task members.
                      </p>
                    </div>

                    {isPersonal ? (
                      <div className="m-5 p-5 rounded-2xl border border-indigo-100" style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)" }}>
                        <div className="flex items-start gap-3">
                          <Lock className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-indigo-900">Private personal workspace</p>
                            <p className="text-sm text-indigo-700 mt-1 leading-relaxed">
                              Only you can access this workspace. Convert it to shared when you want to add teammates and collaborate.
                            </p>
                            {isOwner && (
                              <button
                                onClick={handleConvertToShared}
                                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                              >
                                <Users className="w-4 h-4" /> Convert to Shared
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="m-5 p-4 rounded-xl bg-accent/40 border border-primary/15">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2">Invite a collaborator</p>
                        {collaboratorOptions.length === 0 ? (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                            No accepted collaborators available. Accept a collaboration / connection request first, then you can add that person here.
                          </p>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-1">
                              <select
                                key={`${selectedWorkspaceId}-${collaboratorOptions.length}`}
                                aria-label="Collaborator to invite"
                                value={selectedCollaboratorId}
                                onChange={(e) => setSelectedCollaboratorId(e.target.value)}
                                className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm bg-card rounded-xl border border-border focus:border-primary focus:outline-none cursor-pointer"
                              >
                                <option value="">— Select collaborator —</option>
                                {collaboratorOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {getProfileName(p)}{p.department ? ` · ${p.department}` : ""}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            </div>
                            <button
                              onClick={handleAddWorkspaceMember}
                              disabled={addingMember || !selectedCollaboratorId.trim() || !isOwner}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {addingMember ? (
                                <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                              {addingMember ? "Adding…" : "Add Member"}
                            </button>
                          </div>
                        )}
                        {!isOwner && (
                          <p className="text-xs text-muted-foreground mt-3 italic">
                            Only the workspace owner can add or remove members.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Member list */}
                    <div className="divide-y divide-border">
                      {members.length === 0 ? (
                        <div className="p-5">
                          <EmptyState icon={Users} title="No members yet" message="" />
                        </div>
                      ) : (
                        members.map((member) => (
                          <div key={member.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                            <Avatar
                              name={getProfileName(member.profile)}
                              picUrl={member.profile?.profile_pic_url}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-foreground">{getProfileName(member.profile)}</p>
                                {member.user_id === userId && (
                                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                    You
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {member.profile?.department || "Research community"}
                              </p>
                            </div>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                                member.role === "owner"
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {member.role}
                            </span>
                            {member.role !== "owner" && isOwner && (
                              <button
                                onClick={() => handleRemoveWorkspaceMember(member)}
                                className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                                aria-label="Remove member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* ── MEETINGS ──────────────────────────────────────────── */}
                {activeTab === "meetings" && (
                  <div className="space-y-4">
                    {/* Active meeting */}
                    {activeMeeting && (
                      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-border">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                              <Video className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-foreground truncate">{activeMeeting.title}</h3>
                              <p className="text-xs text-muted-foreground">Jitsi video conference</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setActiveMeeting(null)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold border border-red-100 hover:bg-red-100 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" /> Close Meeting
                          </button>
                        </div>
                        <iframe
                          src={activeMeeting.meeting_url}
                          title={activeMeeting.title}
                          allow="camera; microphone; fullscreen; display-capture"
                          className="w-full border-0"
                          style={{ height: 600 }}
                        />
                        <div className="p-5 bg-muted/30">
                          <LocalRecorder
                            workspaceId={selectedWorkspaceId}
                            meeting={activeMeeting}
                            userId={userId}
                            onSaved={handleReloadCurrentWorkspace}
                          />
                        </div>
                      </div>
                    )}

                    {/* Create + list */}
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                      {/* Meeting list */}
                      <div className="space-y-3">
                        {meetings.length === 0 ? (
                          <EmptyState
                            icon={Video}
                            title="No meetings created yet"
                            message="Create a Jitsi video room. Anyone in the workspace can join from inside ResearchGram or in a new tab."
                          />
                        ) : (
                          meetings.map((m) => (
                            <div key={m.id} className="bg-card rounded-2xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
                              <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Video className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-bold text-foreground">{m.title}</h4>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatDateTime(m.starts_at)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-1 break-all font-mono">
                                    {m.meeting_url}
                                  </p>
                                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                                    <button
                                      onClick={() => setActiveMeeting(m)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                                    >
                                      <Play className="w-3 h-3" /> Join Inside
                                    </button>
                                    <a
                                      href={m.meeting_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3" /> New Tab
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Create meeting */}
                      <div className="bg-card rounded-2xl border border-border shadow-sm p-5 h-fit space-y-3 lg:sticky lg:top-[76px]">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Plus className="w-4 h-4 text-primary" /> Create Video Meeting
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Creates a Jitsi room link. Recording downloads locally to the recorder&apos;s computer; only metadata stays on ResearchGram.
                        </p>
                        <input
                          aria-label="Meeting title"
                          value={meetingTitle}
                          onChange={(e) => setMeetingTitle(e.target.value)}
                          placeholder="Meeting title"
                          className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
                        />
                        <div>
                          <label htmlFor="workspace-meeting-start" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                            Start time (optional — leave blank for instant)
                          </label>
                          <input
                            id="workspace-meeting-start"
                            type="datetime-local"
                            value={meetingStart}
                            onChange={(e) => setMeetingStart(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:outline-none transition-all"
                          />
                        </div>
                        <button
                          onClick={handleCreateMeeting}
                          disabled={savingMeeting || !meetingTitle.trim()}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingMeeting ? (
                            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          ) : (
                            <Video className="w-4 h-4" />
                          )}
                          {savingMeeting ? "Creating…" : "Create Video Room"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── RECORDINGS ────────────────────────────────────────── */}
                {activeTab === "recordings" && (
                  <div className="space-y-4">
                    <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-900">Local-only recording</p>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          Actual video files download to the recorder&apos;s local computer. ResearchGram stores only metadata — file name, duration, recorder ID, and meeting reference.
                        </p>
                      </div>
                    </div>

                    {recordings.length === 0 ? (
                      <EmptyState
                        icon={MonitorPlay}
                        title="No recording metadata yet"
                        message="Join a meeting, start local recording, stop recording. The metadata will appear here."
                      />
                    ) : (
                      recordings.map((r) => (
                        <div key={r.id} className="bg-card rounded-2xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center flex-shrink-0">
                              <Play className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                  <h4 className="text-sm font-bold text-foreground">{r.title}</h4>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {formatDateTime(r.created_at)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatDuration(r.duration_seconds)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-1 break-all font-mono">
                                    {r.file_name}
                                  </p>
                                </div>
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded-full whitespace-nowrap">
                                  Local file only
                                </span>
                              </div>
                              {r.saved_location_note && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-3 leading-relaxed">
                                  {r.saved_location_note}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── UPDATES ───────────────────────────────────────────── */}
                {activeTab === "updates" && (
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                    {/* Updates timeline */}
                    <div className="space-y-3">
                      {updates.length === 0 ? (
                        <EmptyState
                          icon={Activity}
                          title="No updates yet"
                          message="Post progress notes, meeting decisions, research findings, or next-step plans."
                        />
                      ) : (
                        <div className="relative">
                          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border hidden sm:block" />
                          <div className="space-y-3">
                            {updates.map((u) => {
                              const author = members.find((m) => m.user_id === u.author_id);
                              const authorName = author ? getProfileName(author.profile) : "Researcher";
                              return (
                                <div key={u.id} className="flex items-start gap-4">
                                  <div className="w-12 h-12 rounded-full bg-card border-2 border-border flex items-center justify-center flex-shrink-0 relative z-10">
                                    <Activity className="w-5 h-5 text-primary" />
                                  </div>
                                  <div className="flex-1 bg-card rounded-2xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <Avatar
                                        name={authorName}
                                        picUrl={author?.profile?.profile_pic_url}
                                        size="sm"
                                      />
                                      <span className="text-xs font-bold text-foreground">{authorName}</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        · {formatDateTime(u.created_at)}
                                      </span>
                                      <span className="text-[10px] font-bold bg-accent text-primary border border-primary/15 px-1.5 py-0.5 rounded">
                                        {u.update_type}
                                      </span>
                                    </div>
                                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{u.body}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Post update form */}
                    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 h-fit space-y-3 lg:sticky lg:top-[76px]">
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Plus className="w-4 h-4 text-primary" /> Post Update
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Share progress notes, meeting decisions, findings, or next-step plans with the team.
                      </p>
                      <textarea
                        aria-label="Project update"
                        value={updateText}
                        onChange={(e) => setUpdateText(e.target.value)}
                        placeholder="What's the latest update on this project?"
                        rows={6}
                        className="w-full px-3 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all leading-relaxed"
                      />
                      <button
                        onClick={handleAddUpdate}
                        disabled={savingUpdate || !updateText.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {savingUpdate ? (
                          <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                          <Activity className="w-4 h-4" />
                        )}
                        {savingUpdate ? "Posting…" : "Post Update"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}