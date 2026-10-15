"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { asUploadBody, uploadProblem } from "@/lib/uploadRules";
import WorkspaceUI, {
  type Profile,
  type Workspace,
  type WorkspaceFile,
  type WorkspaceMeeting,
  type WorkspaceMember,
  type WorkspaceMilestone,
  type WorkspaceRecording,
  type WorkspaceTask,
  type WorkspaceUpdate,
  type WorkspaceType,
  type WorkspaceTab,
} from "./UI";
import { logDev } from "@/lib/log";
import { confirmAction, friendlyError, notify } from "@/lib/feedback";
import { newId } from "@/lib/ids";

// Workspace files go to a private bucket, readable only by workspace members
// through short-lived signed links (audit RG-05). Path: {workspaceId}/{userId}/{file}.
// Files uploaded before this change stay in the public content-files bucket
// under workspace/..., and keep the public link stored with them.
const WORKSPACE_FILES_BUCKET = "workspace-files";
const LEGACY_PUBLIC_PREFIX = "workspace/";
const SIGNED_URL_SECONDS = 60 * 60;

const PROFILE_FIELDS = "id, email, full_name, department, profile_pic_url, skills, interests";

async function withSignedUrls(files: WorkspaceFile[]) {
  const privatePaths = files
    .map((file) => file.storage_path)
    .filter((path) => path && !path.startsWith(LEGACY_PUBLIC_PREFIX));

  if (privatePaths.length === 0) return files;

  // One request signs every file (audit RG-31).
  const { data, error } = await supabase.storage
    .from(WORKSPACE_FILES_BUCKET)
    .createSignedUrls(privatePaths, SIGNED_URL_SECONDS);

  if (error) {
    logDev("WORKSPACE FILE SIGNED URL ERROR:", error);
    return files;
  }

  const urlByPath = new Map<string, string>();
  for (const item of data || []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }

  return files.map((file) =>
    urlByPath.has(file.storage_path)
      ? { ...file, file_url: urlByPath.get(file.storage_path) ?? null }
      : file,
  );
}

function getFileExt(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "bin";
}

function getFileCategory(file: File) {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "paper";
  if (
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return "dataset";
  }

  if (
    name.endsWith(".py") ||
    name.endsWith(".js") ||
    name.endsWith(".ts") ||
    name.endsWith(".java") ||
    name.endsWith(".cpp") ||
    name.endsWith(".c")
  ) {
    return "code";
  }

  return "research_file";
}

// A meeting room nobody can guess (audit RG-22). The database makes its own
// random name anyway; this is only what the browser sends.
function randomRoomName() {
  return `ResearchGram-${newId().replace(/-/g, "")}`;
}

export default function WorkspaceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /workspace?workspaceId=… (from Messages) opens that workspace once (audit RG-11).
  const requestedWorkspaceIdRef = useRef(searchParams.get("workspaceId") || "");

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");

  // The workspace whose details are on screen. A reply that arrives after
  // another workspace was opened is ignored, so it cannot show the wrong data.
  const shownWorkspaceIdRef = useRef("");
  const isShown = (workspaceId: string) => shownWorkspaceIdRef.current === workspaceId;

  // A full reload of the details only counts if no newer reload has started,
  // and if nothing was added or changed on screen while it was on its way;
  // otherwise it would replace a task, milestone or update just added with an
  // older list. In that case it simply loads again.
  const detailsLoadRef = useRef(0);
  const detailsChangeRef = useRef(0);
  const noteLocalChange = () => {
    detailsChangeRef.current += 1;
  };

  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [milestones, setMilestones] = useState<WorkspaceMilestone[]>([]);
  const [meetings, setMeetings] = useState<WorkspaceMeeting[]>([]);
  const [recordings, setRecordings] = useState<WorkspaceRecording[]>([]);
  const [updates, setUpdates] = useState<WorkspaceUpdate[]>([]);

  const [collaboratorOptions, setCollaboratorOptions] = useState<Profile[]>([]);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState("");

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);

  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>("personal");
  const [workspaceTitle, setWorkspaceTitle] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceResearchArea, setWorkspaceResearchArea] = useState("");
  const [workspaceDueDate, setWorkspaceDueDate] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState("");

  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState("");

  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingStart, setMeetingStart] = useState("");
  const [activeMeeting, setActiveMeeting] = useState<WorkspaceMeeting | null>(
    null,
  );

  const [updateText, setUpdateText] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ||
      null,
    [workspaces, selectedWorkspaceId],
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "completed").length,
    [tasks],
  );

  const progress = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((completedTasks / tasks.length) * 100);
  }, [tasks.length, completedTasks]);

  const statusCounts = useMemo(() => {
    return {
      todo: tasks.filter((task) => task.status === "todo").length,
      in_progress: tasks.filter((task) => task.status === "in_progress").length,
      review: tasks.filter((task) => task.status === "review").length,
      completed: tasks.filter((task) => task.status === "completed").length,
    };
  }, [tasks]);

  // The team, and the people who could be added (connections and accepted
  // requests). Reloaded on its own after a member change (audit RG-31).
  const loadTeamAndCollaborators = async (workspaceId: string) => {
    let activeUserId = userId;

    if (!activeUserId) {
      try {
        const authUser = await getCurrentUserSafe();

        if (!authUser) {
          router.push("/auth/login");
          return;
        }

        activeUserId = authUser.id;
        setUserId(authUser.id);
      } catch (error) {
        if (isAuthLockError(error)) {
          logDev("WORKSPACE TEAM AUTH LOCK ERROR:", error);
          return;
        }

        logDev("WORKSPACE TEAM AUTH ERROR:", error);
        return;
      }
    }

    if (!activeUserId) return;

    const [memberResult, connectionResult, researchResult, profileRequestResult] =
      await Promise.all([
        supabase
          .from("workspace_members")
          .select("id, workspace_id, user_id, role, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true }),
        supabase
          .from("user_connections")
          .select("user_one_id, user_two_id")
          .or(`user_one_id.eq.${activeUserId},user_two_id.eq.${activeUserId}`),
        supabase
          .from("research_requests")
          .select("requester_id, receiver_id, status")
          .eq("status", "accepted")
          .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`),
        supabase
          .from("profile_requests")
          .select("requester_id, receiver_id, status")
          .eq("status", "accepted")
          .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`),
      ]);

    if (!isShown(workspaceId)) return;

    if (memberResult.error) {
      logDev("LOAD WORKSPACE MEMBERS ERROR:", memberResult.error);
      setMembers([]);
      return;
    }

    const safeMemberRows = (memberResult.data || []) as WorkspaceMember[];
    const memberIds = safeMemberRows.map((member) => member.user_id);
    const memberIdSet = new Set(memberIds);

    const candidateIds = new Set<string>();

    const addCandidatePair = (
      firstUserId: string | null | undefined,
      secondUserId: string | null | undefined,
    ) => {
      if (!firstUserId || !secondUserId) return;

      const otherUserId =
        firstUserId === activeUserId
          ? secondUserId
          : secondUserId === activeUserId
            ? firstUserId
            : null;

      if (!otherUserId) return;
      if (otherUserId === activeUserId) return;
      if (memberIdSet.has(otherUserId)) return;

      candidateIds.add(otherUserId);
    };

    ((connectionResult.data || []) as { user_one_id: string; user_two_id: string }[]).forEach((connection) => {
      addCandidatePair(connection.user_one_id, connection.user_two_id);
    });

    ((researchResult.data || []) as { requester_id: string; receiver_id: string }[]).forEach((request) => {
      addCandidatePair(request.requester_id, request.receiver_id);
    });

    ((profileRequestResult.data || []) as { requester_id: string; receiver_id: string }[]).forEach((request) => {
      addCandidatePair(request.requester_id, request.receiver_id);
    });

    const candidateIdList = Array.from(candidateIds);

    // Member and candidate profiles in one request.
    const profileIds = Array.from(new Set([...memberIds, ...candidateIdList]));
    let profileMap: Record<string, Profile> = {};
    let profileError: unknown = null;

    if (profileIds.length > 0) {
      const { data: profileRows, error } = await supabase
        .from("profiles")
        .select(PROFILE_FIELDS)
        .in("id", profileIds);

      profileError = error;
      if (error) logDev("LOAD WORKSPACE PROFILES ERROR:", error);

      profileMap = ((profileRows || []) as Profile[]).reduce(
        (acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        },
        {} as Record<string, Profile>,
      );
    }

    if (!isShown(workspaceId)) return;

    setMembers(
      safeMemberRows.map((member) => ({
        ...member,
        profile: profileMap[member.user_id] || null,
      })),
    );

    setCollaboratorOptions(
      profileError
        ? []
        : candidateIdList
            .map((id) => profileMap[id])
            .filter((profile): profile is Profile => Boolean(profile)),
    );
    setSelectedCollaboratorId("");
  };

  const loadWorkspaceFiles = async (workspaceId: string) => {
    const { data, error } = await supabase
      .from("workspace_files")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      logDev("LOAD FILES ERROR:", error);
      return;
    }

    const files = await withSignedUrls((data || []) as WorkspaceFile[]);
    if (isShown(workspaceId)) setWorkspaceFiles(files);
  };

  const loadWorkspaceRecordings = async (workspaceId: string) => {
    const { data, error } = await supabase
      .from("workspace_recordings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      logDev("LOAD RECORDINGS ERROR:", error);
      return;
    }

    if (isShown(workspaceId)) setRecordings((data || []) as WorkspaceRecording[]);
  };

  // Everything for one workspace: used when a workspace is opened. Single
  // changes update the list they changed instead (audit RG-31).
  const loadWorkspaceDetails = async (workspaceId: string): Promise<void> => {
    shownWorkspaceIdRef.current = workspaceId;
    const load = ++detailsLoadRef.current;
    const changesAtStart = detailsChangeRef.current;

    const [
      taskResult,
      fileResult,
      milestoneResult,
      meetingResult,
      recordingResult,
      updateResult,
    ] = await Promise.all([
      supabase
        .from("workspace_tasks")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),

      supabase
        .from("workspace_files")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),

      supabase
        .from("workspace_milestones")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),

      supabase
        .from("workspace_meetings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),

      supabase
        .from("workspace_recordings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),

      supabase
        .from("workspace_updates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
    ]);

    if (taskResult.error) logDev("LOAD TASKS ERROR:", taskResult.error);
    if (fileResult.error) logDev("LOAD FILES ERROR:", fileResult.error);
    if (milestoneResult.error)
      logDev("LOAD MILESTONES ERROR:", milestoneResult.error);
    if (meetingResult.error)
      logDev("LOAD MEETINGS ERROR:", meetingResult.error);
    if (recordingResult.error)
      logDev("LOAD RECORDINGS ERROR:", recordingResult.error);
    if (updateResult.error)
      logDev("LOAD UPDATES ERROR:", updateResult.error);

    const signedFiles = await withSignedUrls((fileResult.data || []) as WorkspaceFile[]);

    if (!isShown(workspaceId) || load !== detailsLoadRef.current) return;

    if (changesAtStart !== detailsChangeRef.current) {
      await loadWorkspaceDetails(workspaceId);
      return;
    }

    setTasks((taskResult.data || []) as WorkspaceTask[]);
    setWorkspaceFiles(signedFiles);
    setMilestones((milestoneResult.data || []) as WorkspaceMilestone[]);
    setMeetings((meetingResult.data || []) as WorkspaceMeeting[]);
    setRecordings((recordingResult.data || []) as WorkspaceRecording[]);
    setUpdates((updateResult.data || []) as WorkspaceUpdate[]);

    await loadTeamAndCollaborators(workspaceId);
  };

  const loadWorkspaces = async () => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logDev("LOAD WORKSPACES ERROR:", error);
      notify(friendlyError(error, "Could not load your workspaces."), "error");
      setWorkspaces([]);
      return;
    }

    const safeWorkspaces = (data || []) as Workspace[];
    setWorkspaces(safeWorkspaces);

    if (safeWorkspaces.length > 0) {
      const requested = requestedWorkspaceIdRef.current;
      requestedWorkspaceIdRef.current = "";

      const nextSelected =
        requested && safeWorkspaces.some((workspace) => workspace.id === requested)
          ? requested
          : selectedWorkspaceId &&
              safeWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)
            ? selectedWorkspaceId
            : safeWorkspaces[0].id;

      setSelectedWorkspaceId(nextSelected);
      await loadWorkspaceDetails(nextSelected);
    } else {
      shownWorkspaceIdRef.current = "";
      setSelectedWorkspaceId("");
      setTasks([]);
      setWorkspaceFiles([]);
      setMembers([]);
      setMilestones([]);
      setMeetings([]);
      setRecordings([]);
      setUpdates([]);
      setCollaboratorOptions([]);
      setSelectedCollaboratorId("");
    }
  };

  const loadWorkspacesOnMount = useEffectEvent(() => loadWorkspaces());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const authUser = await getCurrentUserSafe();

        if (!authUser) {
          router.push("/auth/login");
          return;
        }

        if (cancelled) return;

        setUserId(authUser.id);

        await loadWorkspacesOnMount();
      } catch (error) {
        if (isAuthLockError(error)) {
          logDev("WORKSPACE AUTH LOCK ERROR:", error);
          return;
        }

        logDev("WORKSPACE LOAD ERROR:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSelectWorkspace = async (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setActiveTab("overview");
    setActiveMeeting(null);
    await loadWorkspaceDetails(workspaceId);
  };

  // The workspace, its owner membership and (for a shared one) its group chat
  // are created together by the database (audit RG-20).
  const handleCreateWorkspace = async () => {
    if (!userId) {
      notify("You must be logged in.", "error");
      return;
    }

    if (!workspaceTitle.trim()) {
      notify("Add a workspace title.", "info");
      return;
    }

    setCreatingWorkspace(true);

    try {
      const { data: newWorkspaceId, error } = await supabase.rpc("create_workspace", {
        p_title: workspaceTitle.trim(),
        p_description: workspaceDescription.trim() || null,
        p_research_area: workspaceResearchArea.trim() || null,
        p_due_date: workspaceDueDate || null,
        p_workspace_type: workspaceType,
      });

      if (error || !newWorkspaceId) {
        logDev("CREATE WORKSPACE ERROR:", error);
        notify(friendlyError(error, "Could not create workspace."), "error");
        return;
      }

      setWorkspaceTitle("");
      setWorkspaceDescription("");
      setWorkspaceResearchArea("");
      setWorkspaceDueDate("");
      setWorkspaceType("personal");

      // Open the new workspace (one list load, one details load).
      requestedWorkspaceIdRef.current = String(newWorkspaceId);
      setActiveTab("overview");
      setActiveMeeting(null);
      await loadWorkspaces();
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleConvertToShared = async () => {
    if (!selectedWorkspace) return;

    const confirmed = await confirmAction({
      title: "Make this workspace shared?",
      message: "You can then add collaborators, and a group chat is created for the team.",
      confirmLabel: "Make shared",
    });

    if (!confirmed) return;

    const workspaceId = selectedWorkspace.id;

    const { error } = await supabase.rpc("make_workspace_shared", {
      p_workspace_id: workspaceId,
    });

    if (error) {
      logDev("CONVERT WORKSPACE ERROR:", error);
      notify(friendlyError(error, "Could not convert the workspace."), "error");
      return;
    }

    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, workspace_type: "shared", updated_at: new Date().toISOString() }
          : workspace,
      ),
    );
    notify("The workspace is shared now. Its group chat is in Messages.", "success");
  };

  // Membership and the group chat change together (audit RG-20).
  const handleAddWorkspaceMember = async () => {
    if (!selectedWorkspaceId || !selectedWorkspace) {
      notify("Select a workspace first.", "info");
      return;
    }

    if (selectedWorkspace.workspace_type !== "shared") {
      notify("Convert this personal workspace to shared first.", "info");
      return;
    }

    const memberIdToAdd = selectedCollaboratorId.trim();

    if (!memberIdToAdd) {
      notify("Please select a collaborator first.", "info");
      return;
    }

    const selectedProfile = collaboratorOptions.find(
      (profile) => profile.id === memberIdToAdd,
    );

    if (!selectedProfile) {
      notify("Selected collaborator was not found. Please select again.", "error");
      setSelectedCollaboratorId("");
      return;
    }

    const confirmAdd = await confirmAction({
      title: "Add collaborator?",
      message: `Add ${
        selectedProfile.full_name ||
        selectedProfile.email ||
        "this collaborator"
      } to this workspace?`,
      confirmLabel: "Add",
    });

    if (!confirmAdd) return;

    const workspaceId = selectedWorkspaceId;
    setAddingMember(true);

    try {
      const { error } = await supabase.rpc("add_workspace_member", {
        p_workspace_id: workspaceId,
        p_user_id: memberIdToAdd,
      });

      if (error) {
        logDev("ADD WORKSPACE MEMBER ERROR:", error);
        notify(friendlyError(error, "Could not add the member."), "error");
        return;
      }

      setSelectedCollaboratorId("");
      await loadTeamAndCollaborators(workspaceId);
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveWorkspaceMember = async (member: WorkspaceMember) => {
    if (!selectedWorkspaceId) return;

    if (member.role === "owner") {
      notify("Workspace owner cannot be removed.", "error");
      return;
    }

    const confirmRemove = await confirmAction({
      title: "Remove member?",
      message: `Remove ${
        member.profile?.full_name || member.profile?.email || "this member"
      } from this workspace?`,
      confirmLabel: "Remove",
      tone: "danger",
    });

    if (!confirmRemove) return;

    const workspaceId = selectedWorkspaceId;

    const { error } = await supabase.rpc("remove_workspace_member", {
      p_member_id: member.id,
    });

    if (error) {
      logDev("REMOVE WORKSPACE MEMBER ERROR:", error);
      notify(friendlyError(error, "Could not remove the member."), "error");
      return;
    }

    await loadTeamAndCollaborators(workspaceId);
  };

  const handleAddTask = async () => {
    if (!selectedWorkspaceId) {
      notify("Create or select a workspace first.", "info");
      return;
    }

    if (!taskTitle.trim()) {
      notify("Add a task title.", "info");
      return;
    }

    const workspaceId = selectedWorkspaceId;
    setAddingTask(true);

    try {
      const { data, error } = await supabase
        .from("workspace_tasks")
        .insert({
          workspace_id: workspaceId,
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          status: "todo",
          priority: taskPriority,
          due_date: taskDueDate || null,
          assigned_to: taskAssignedTo || null,
          created_by: userId,
        })
        .select("*")
        .single();

      if (error || !data) {
        logDev("ADD TASK ERROR:", error);
        notify(friendlyError(error, "Could not add the task."), "error");
        return;
      }

      setTaskTitle("");
      setTaskDescription("");
      setTaskPriority("medium");
      setTaskDueDate("");
      setTaskAssignedTo("");

      if (isShown(workspaceId)) {
        noteLocalChange();
        setTasks((current) => [data as WorkspaceTask, ...current]);
      }
    } finally {
      setAddingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, nextStatus: string) => {
    const { data, error } = await supabase
      .from("workspace_tasks")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .select("*")
      .single();

    if (error || !data) {
      logDev("UPDATE TASK ERROR:", error);
      notify(friendlyError(error, "Could not update the task."), "error");
      return;
    }

    noteLocalChange();
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? (data as WorkspaceTask) : task)),
    );
  };

  const handleUploadFiles = async () => {
    if (!selectedWorkspaceId) {
      notify("Select a workspace first.", "info");
      return;
    }

    if (selectedFiles.length === 0) {
      notify("Choose at least one file.", "info");
      return;
    }

    const fileProblem = selectedFiles.map((file) => uploadProblem(file)).find(Boolean);
    if (fileProblem) {
      notify(fileProblem, "error");
      return;
    }

    const workspaceId = selectedWorkspaceId;
    setUploadingFile(true);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const ext = getFileExt(file.name);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${workspaceId}/${userId}/${Date.now()}-${i}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(WORKSPACE_FILES_BUCKET)
          .upload(storagePath, asUploadBody(file), {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          logDev("WORKSPACE FILE UPLOAD ERROR:", uploadError);
          notify(friendlyError(uploadError, "Could not upload the file."), "error");
          return;
        }

        // No permanent link is stored for private files; one is signed on load.
        const { error: insertError } = await supabase
          .from("workspace_files")
          .insert({
            workspace_id: workspaceId,
            uploaded_by: userId,
            file_url: null,
            storage_path: storagePath,
            original_name: file.name,
            mime_type: file.type || null,
            file_ext: ext,
            file_size: file.size,
            file_category: getFileCategory(file),
          });

        if (insertError) {
          logDev("WORKSPACE FILE INSERT ERROR:", insertError);
          notify(friendlyError(insertError, "Could not save the file."), "error");
          // The upload has no entry: remove it again instead of leaving it behind.
          await supabase.storage.from(WORKSPACE_FILES_BUCKET).remove([storagePath]);
          return;
        }
      }

      setSelectedFiles([]);
    } finally {
      // Show what was saved, also when a later file failed.
      noteLocalChange();
      await loadWorkspaceFiles(workspaceId);
      setUploadingFile(false);
    }
  };

  const handleAddMilestone = async () => {
    if (!selectedWorkspaceId) {
      notify("Select a workspace first.", "info");
      return;
    }

    if (!milestoneTitle.trim()) {
      notify("Add a milestone title.", "info");
      return;
    }

    const workspaceId = selectedWorkspaceId;
    setSavingMilestone(true);

    try {
      const { data, error } = await supabase
        .from("workspace_milestones")
        .insert({
          workspace_id: workspaceId,
          created_by: userId,
          title: milestoneTitle.trim(),
          description: milestoneDescription.trim() || null,
          due_date: milestoneDueDate || null,
          status: "planned",
        })
        .select("*")
        .single();

      if (error || !data) {
        logDev("ADD MILESTONE ERROR:", error);
        notify(friendlyError(error, "Could not add the milestone."), "error");
        return;
      }

      setMilestoneTitle("");
      setMilestoneDescription("");
      setMilestoneDueDate("");

      if (isShown(workspaceId)) {
        noteLocalChange();
        setMilestones((current) => [data as WorkspaceMilestone, ...current]);
      }
    } finally {
      setSavingMilestone(false);
    }
  };

  const handleUpdateMilestoneStatus = async (
    milestoneId: string,
    nextStatus: string,
  ) => {
    const { data, error } = await supabase
      .from("workspace_milestones")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", milestoneId)
      .select("*")
      .single();

    if (error || !data) {
      logDev("UPDATE MILESTONE ERROR:", error);
      notify(friendlyError(error, "Could not update the milestone."), "error");
      return;
    }

    noteLocalChange();
    setMilestones((current) =>
      current.map((milestone) =>
        milestone.id === milestoneId ? (data as WorkspaceMilestone) : milestone,
      ),
    );
  };

  const handleCreateMeeting = async () => {
    if (!selectedWorkspaceId) {
      notify("Select a workspace first.", "info");
      return;
    }

    if (!userId) {
      notify("You must be logged in.", "error");
      return;
    }

    if (!meetingTitle.trim()) {
      notify("Add a meeting title.", "info");
      return;
    }

    const workspaceId = selectedWorkspaceId;
    setSavingMeeting(true);

    try {
      const roomName = randomRoomName();

      // The saved row carries the room the database chose.
      const { data: createdMeeting, error } = await supabase
        .from("workspace_meetings")
        .insert({
          workspace_id: workspaceId,
          created_by: userId,
          title: meetingTitle.trim(),
          provider: "jitsi",
          room_name: roomName,
          meeting_url: `https://meet.jit.si/${roomName}`,
          starts_at: meetingStart ? new Date(meetingStart).toISOString() : null,
        })
        .select("*")
        .single();

      if (error || !createdMeeting) {
        logDev("CREATE MEETING ERROR:", error);
        notify(friendlyError(error, "Could not create the meeting."), "error");
        return;
      }

      setMeetingTitle("");
      setMeetingStart("");

      if (isShown(workspaceId)) {
        noteLocalChange();
        setMeetings((prev) => [createdMeeting as WorkspaceMeeting, ...prev]);
        setActiveMeeting(createdMeeting as WorkspaceMeeting);
        setActiveTab("meetings");
      }
    } catch (error) {
      logDev("CREATE MEETING UNKNOWN ERROR:", error);
      notify(friendlyError(error, "Could not create the meeting."), "error");
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleAddUpdate = async () => {
    if (!selectedWorkspaceId) {
      notify("Select a workspace first.", "info");
      return;
    }

    if (!updateText.trim()) {
      notify("Write an update first.", "info");
      return;
    }

    const workspaceId = selectedWorkspaceId;
    setSavingUpdate(true);

    try {
      const { data, error } = await supabase
        .from("workspace_updates")
        .insert({
          workspace_id: workspaceId,
          author_id: userId,
          update_type: "note",
          body: updateText.trim(),
        })
        .select("*")
        .single();

      if (error || !data) {
        logDev("ADD UPDATE ERROR:", error);
        notify(friendlyError(error, "Could not post the update."), "error");
        return;
      }

      setUpdateText("");

      if (isShown(workspaceId)) {
        noteLocalChange();
        setUpdates((current) => [data as WorkspaceUpdate, ...current]);
      }
    } finally {
      setSavingUpdate(false);
    }
  };

  return (
    <WorkspaceUI
      loading={loading}
      userId={userId}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      workspaces={workspaces}
      selectedWorkspaceId={selectedWorkspaceId}
      selectedWorkspace={selectedWorkspace}
      tasks={tasks}
      workspaceFiles={workspaceFiles}
      members={members}
      milestones={milestones}
      meetings={meetings}
      recordings={recordings}
      updates={updates}
      collaboratorOptions={collaboratorOptions}
      selectedCollaboratorId={selectedCollaboratorId}
      creatingWorkspace={creatingWorkspace}
      addingTask={addingTask}
      uploadingFile={uploadingFile}
      addingMember={addingMember}
      savingMilestone={savingMilestone}
      savingMeeting={savingMeeting}
      savingUpdate={savingUpdate}
      workspaceType={workspaceType}
      workspaceTitle={workspaceTitle}
      workspaceDescription={workspaceDescription}
      workspaceResearchArea={workspaceResearchArea}
      workspaceDueDate={workspaceDueDate}
      taskTitle={taskTitle}
      taskDescription={taskDescription}
      taskPriority={taskPriority}
      taskDueDate={taskDueDate}
      taskAssignedTo={taskAssignedTo}
      milestoneTitle={milestoneTitle}
      milestoneDescription={milestoneDescription}
      milestoneDueDate={milestoneDueDate}
      meetingTitle={meetingTitle}
      meetingStart={meetingStart}
      activeMeeting={activeMeeting}
      updateText={updateText}
      selectedFiles={selectedFiles}
      progress={progress}
      statusCounts={statusCounts}
      setWorkspaceType={setWorkspaceType}
      setWorkspaceTitle={setWorkspaceTitle}
      setWorkspaceDescription={setWorkspaceDescription}
      setWorkspaceResearchArea={setWorkspaceResearchArea}
      setWorkspaceDueDate={setWorkspaceDueDate}
      setTaskTitle={setTaskTitle}
      setTaskDescription={setTaskDescription}
      setTaskPriority={setTaskPriority}
      setTaskDueDate={setTaskDueDate}
      setTaskAssignedTo={setTaskAssignedTo}
      setMilestoneTitle={setMilestoneTitle}
      setMilestoneDescription={setMilestoneDescription}
      setMilestoneDueDate={setMilestoneDueDate}
      setMeetingTitle={setMeetingTitle}
      setMeetingStart={setMeetingStart}
      setActiveMeeting={setActiveMeeting}
      setUpdateText={setUpdateText}
      setSelectedFiles={setSelectedFiles}
      setSelectedCollaboratorId={setSelectedCollaboratorId}
      handleSelectWorkspace={handleSelectWorkspace}
      handleCreateWorkspace={handleCreateWorkspace}
      handleConvertToShared={handleConvertToShared}
      handleAddWorkspaceMember={handleAddWorkspaceMember}
      handleRemoveWorkspaceMember={handleRemoveWorkspaceMember}
      handleAddTask={handleAddTask}
      handleUpdateTaskStatus={handleUpdateTaskStatus}
      handleUploadFiles={handleUploadFiles}
      handleAddMilestone={handleAddMilestone}
      handleUpdateMilestoneStatus={handleUpdateMilestoneStatus}
      handleCreateMeeting={handleCreateMeeting}
      handleAddUpdate={handleAddUpdate}
      // A recording was saved: only the recordings list changes.
      handleReloadCurrentWorkspace={() =>
        selectedWorkspaceId
          ? (noteLocalChange(), loadWorkspaceRecordings(selectedWorkspaceId))
          : null
      }
    />
  );
}
