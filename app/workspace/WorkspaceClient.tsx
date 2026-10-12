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

// Workspace files go to a private bucket, readable only by workspace members
// through short-lived signed links (audit RG-05). Path: {workspaceId}/{userId}/{file}.
// Files uploaded before this change stay in the public content-files bucket
// under workspace/..., and keep the public link stored with them.
const WORKSPACE_FILES_BUCKET = "workspace-files";
const LEGACY_PUBLIC_PREFIX = "workspace/";
const SIGNED_URL_SECONDS = 60 * 60;

async function withSignedUrls(files: WorkspaceFile[]) {
  const privatePaths = files
    .map((file) => file.storage_path)
    .filter((path) => path && !path.startsWith(LEGACY_PUBLIC_PREFIX));

  if (privatePaths.length === 0) return files;

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

  const { data: memberRows, error: memberError } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (memberError) {
    logDev("LOAD WORKSPACE MEMBERS ERROR:", memberError);
    setMembers([]);
    return;
  }

  const safeMemberRows = (memberRows || []) as WorkspaceMember[];
  const memberIds = safeMemberRows.map((member) => member.user_id);
  const memberIdSet = new Set(memberIds);

  let profileMap: Record<string, Profile> = {};

  if (memberIds.length > 0) {
    const { data: memberProfiles, error: memberProfileError } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, department, profile_pic_url, skills, interests",
      )
      .in("id", memberIds);

    if (memberProfileError) {
      logDev("LOAD MEMBER PROFILES ERROR:", memberProfileError);
    }

    profileMap = (memberProfiles || []).reduce(
      (acc, profile) => {
        acc[profile.id] = profile as Profile;
        return acc;
      },
      {} as Record<string, Profile>,
    );
  }

  const normalizedMembers: WorkspaceMember[] = safeMemberRows.map((member) => ({
    ...member,
    profile: profileMap[member.user_id] || null,
  }));

  setMembers(normalizedMembers);

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

  const { data: connectionRows } = await supabase
    .from("user_connections")
    .select("user_one_id, user_two_id")
    .or(`user_one_id.eq.${activeUserId},user_two_id.eq.${activeUserId}`);

  ((connectionRows || []) as { user_one_id: string; user_two_id: string }[]).forEach((connection) => {
    addCandidatePair(connection.user_one_id, connection.user_two_id);
  });

  const { data: acceptedResearchRows } = await supabase
    .from("research_requests")
    .select("requester_id, receiver_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`);

  ((acceptedResearchRows || []) as { requester_id: string; receiver_id: string }[]).forEach((request) => {
    addCandidatePair(request.requester_id, request.receiver_id);
  });

  const { data: acceptedProfileRows } = await supabase
    .from("profile_requests")
    .select("requester_id, receiver_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`);

  ((acceptedProfileRows || []) as { requester_id: string; receiver_id: string }[]).forEach((request) => {
    addCandidatePair(request.requester_id, request.receiver_id);
  });

  const candidateIdList = Array.from(candidateIds);

  if (candidateIdList.length === 0) {
    setCollaboratorOptions([]);
    setSelectedCollaboratorId("");
    return;
  }

  const { data: candidateProfiles, error: candidateProfileError } =
    await supabase
      .from("profiles")
      .select(
        "id, email, full_name, department, profile_pic_url, skills, interests",
      )
      .in("id", candidateIdList);

  if (candidateProfileError) {
    logDev("LOAD COLLABORATOR OPTIONS ERROR:", candidateProfileError);
    setCollaboratorOptions([]);
    setSelectedCollaboratorId("");
    return;
  }

  setCollaboratorOptions((candidateProfiles || []) as Profile[]);
  setSelectedCollaboratorId("");
};

  const loadWorkspaceDetails = async (workspaceId: string) => {
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

    setTasks((taskResult.data || []) as WorkspaceTask[]);
    setWorkspaceFiles(
      await withSignedUrls((fileResult.data || []) as WorkspaceFile[]),
    );
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

const ensureWorkspaceGroupConversation = async (
  workspaceId: string,
  title: string,
  ownerId: string,
) => {
  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("conversation_type", "workspace_group")
    .maybeSingle();

  if (existingError) {
    logDev("CHECK WORKSPACE GROUP CONVERSATION ERROR:", existingError);
    return null;
  }

  if (existing?.id) {
    await supabase.from("conversation_members").upsert(
      {
        conversation_id: existing.id,
        user_id: ownerId,
        role: "owner",
        last_read_at: new Date().toISOString(),
      },
      {
        onConflict: "conversation_id,user_id",
      },
    );

    return existing.id as string;
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      participant_one_id: ownerId,
      participant_two_id: ownerId,
      conversation_type: "workspace_group",
      title: `Workspace: ${title}`,
      workspace_id: workspaceId,
      created_by: ownerId,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !conversation) {
    logDev("CREATE WORKSPACE GROUP CONVERSATION ERROR:", error);
    return null;
  }

  await supabase.from("conversation_members").upsert(
    {
      conversation_id: conversation.id,
      user_id: ownerId,
      role: "owner",
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: "conversation_id,user_id",
    },
  );

  return conversation.id as string;
};

 const addUserToWorkspaceGroupConversation = async (
  workspaceId: string,
  userIdToAdd: string,
  role = "member",
) => {
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("conversation_type", "workspace_group")
    .maybeSingle();

  if (error) {
    logDev("FIND WORKSPACE GROUP CONVERSATION ERROR:", error);
    return;
  }

  if (!conversation?.id) {
    logDev("No workspace group conversation found for:", workspaceId);
    return;
  }

  const { error: memberError } = await supabase
    .from("conversation_members")
    .upsert(
      {
        conversation_id: conversation.id,
        user_id: userIdToAdd,
        role,
        last_read_at: new Date().toISOString(),
      },
      {
        onConflict: "conversation_id,user_id",
      },
    );

  if (memberError) {
    logDev("ADD USER TO WORKSPACE GROUP CHAT ERROR:", memberError);
  }
};

  const removeUserFromWorkspaceGroupConversation = async (
  workspaceId: string,
  userIdToRemove: string,
) => {
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("conversation_type", "workspace_group")
    .maybeSingle();

  if (error) {
    logDev("FIND WORKSPACE GROUP CONVERSATION ERROR:", error);
    return;
  }

  if (!conversation?.id) return;

  const { error: removeError } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversation.id)
    .eq("user_id", userIdToRemove);

  if (removeError) {
    logDev("REMOVE USER FROM WORKSPACE GROUP CHAT ERROR:", removeError);
  }
};

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

    const { data: workspaceData, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({
        owner_id: userId,
        title: workspaceTitle.trim(),
        description: workspaceDescription.trim() || null,
        research_area: workspaceResearchArea.trim() || null,
        due_date: workspaceDueDate || null,
        workspace_type: workspaceType,
        status: "active",
      })
      .select("id")
      .single();

    if (workspaceError || !workspaceData) {
      logDev("CREATE WORKSPACE ERROR:", workspaceError);
      notify(friendlyError(workspaceError, "Could not create workspace."), "error");
      setCreatingWorkspace(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: workspaceData.id,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      logDev("CREATE WORKSPACE MEMBER ERROR:", memberError);
      notify(
        "The workspace was created, but you could not be added as its owner. Reload the page before creating it again, so it is not made twice.",
        "error",
      );
    }
    // If the new workspace is shared, automatically create workspace group chat.
    if (workspaceType === "shared") {
      await ensureWorkspaceGroupConversation(
        workspaceData.id,
        workspaceTitle.trim(),
        userId,
      );
    }
    setWorkspaceTitle("");
    setWorkspaceDescription("");
    setWorkspaceResearchArea("");
    setWorkspaceDueDate("");
    setWorkspaceType("personal");

    await loadWorkspaces();
    setSelectedWorkspaceId(workspaceData.id);
    await loadWorkspaceDetails(workspaceData.id);

    setCreatingWorkspace(false);
  };

  const handleConvertToShared = async () => {
    if (!selectedWorkspace) return;

    const confirmed = await confirmAction({
      title: "Make this workspace shared?",
      message: "You can then add collaborators, and a group chat is created for the team.",
      confirmLabel: "Make shared",
    });

    if (!confirmed) return;

    const { error } = await supabase
      .from("workspaces")
      .update({
        workspace_type: "shared",
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedWorkspace.id);

    if (error) {
      logDev("CONVERT WORKSPACE ERROR:", error);
      notify(friendlyError(error, "Could not convert the workspace."), "error");
      return;
    }

     await ensureWorkspaceGroupConversation(
      selectedWorkspace.id,
      selectedWorkspace.title,
      userId,
    );
    await loadWorkspaces();
  };

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

    setAddingMember(true);

    const { error } = await supabase.from("workspace_members").insert({
      workspace_id: selectedWorkspaceId,
      user_id: memberIdToAdd,
      role: "member",
    });

    if (error) {
      logDev("ADD WORKSPACE MEMBER ERROR:", error);
      notify(friendlyError(error, "Could not add the member."), "error");
      setAddingMember(false);
      return;
    }
    await addUserToWorkspaceGroupConversation(
  selectedWorkspaceId,
  memberIdToAdd,
  "member",
);

    setSelectedCollaboratorId("");
    await loadWorkspaceDetails(selectedWorkspaceId);
    setAddingMember(false);
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

    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("id", member.id);

    if (error) {
      logDev("REMOVE WORKSPACE MEMBER ERROR:", error);
      notify(friendlyError(error, "Could not remove the member."), "error");
      return;
    }

await removeUserFromWorkspaceGroupConversation(
  selectedWorkspaceId,
  member.user_id,
);

    await loadWorkspaceDetails(selectedWorkspaceId);
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

    setAddingTask(true);

    const { error } = await supabase.from("workspace_tasks").insert({
      workspace_id: selectedWorkspaceId,
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      status: "todo",
      priority: taskPriority,
      due_date: taskDueDate || null,
      assigned_to: taskAssignedTo || null,
      created_by: userId,
    });

    if (error) {
      logDev("ADD TASK ERROR:", error);
      notify(friendlyError(error, "Could not add the task."), "error");
      setAddingTask(false);
      return;
    }

    setTaskTitle("");
    setTaskDescription("");
    setTaskPriority("medium");
    setTaskDueDate("");
    setTaskAssignedTo("");

    await loadWorkspaceDetails(selectedWorkspaceId);
    setAddingTask(false);
  };

  const handleUpdateTaskStatus = async (taskId: string, nextStatus: string) => {
    const { error } = await supabase
      .from("workspace_tasks")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      logDev("UPDATE TASK ERROR:", error);
      notify(friendlyError(error, "Could not update the task."), "error");
      return;
    }

    if (selectedWorkspaceId) {
      await loadWorkspaceDetails(selectedWorkspaceId);
    }
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

    setUploadingFile(true);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const ext = getFileExt(file.name);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${selectedWorkspaceId}/${userId}/${Date.now()}-${i}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(WORKSPACE_FILES_BUCKET)
        .upload(storagePath, asUploadBody(file), {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        logDev("WORKSPACE FILE UPLOAD ERROR:", uploadError);
        notify(friendlyError(uploadError, "Could not upload the file."), "error");
        setUploadingFile(false);
        return;
      }

      // No permanent link is stored for private files; one is signed on load.
      const { error: insertError } = await supabase
        .from("workspace_files")
        .insert({
          workspace_id: selectedWorkspaceId,
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
        setUploadingFile(false);
        return;
      }
    }

    setSelectedFiles([]);
    await loadWorkspaceDetails(selectedWorkspaceId);
    setUploadingFile(false);
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

    setSavingMilestone(true);

    const { error } = await supabase.from("workspace_milestones").insert({
      workspace_id: selectedWorkspaceId,
      created_by: userId,
      title: milestoneTitle.trim(),
      description: milestoneDescription.trim() || null,
      due_date: milestoneDueDate || null,
      status: "planned",
    });

    if (error) {
      logDev("ADD MILESTONE ERROR:", error);
      notify(friendlyError(error, "Could not add the milestone."), "error");
      setSavingMilestone(false);
      return;
    }

    setMilestoneTitle("");
    setMilestoneDescription("");
    setMilestoneDueDate("");

    await loadWorkspaceDetails(selectedWorkspaceId);
    setSavingMilestone(false);
  };

  const handleUpdateMilestoneStatus = async (
    milestoneId: string,
    nextStatus: string,
  ) => {
    const { error } = await supabase
      .from("workspace_milestones")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", milestoneId);

    if (error) {
      logDev("UPDATE MILESTONE ERROR:", error);
      notify(friendlyError(error, "Could not update the milestone."), "error");
      return;
    }

    if (selectedWorkspaceId) {
      await loadWorkspaceDetails(selectedWorkspaceId);
    }
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

    setSavingMeeting(true);

    try {
      const roomName =
        `researchgram-${selectedWorkspaceId}-${Date.now()}`.replace(
          /[^a-zA-Z0-9]/g,
          "",
        );

      const meetingUrl = `https://meet.jit.si/${roomName}`;

      const { data: createdMeeting, error } = await supabase
        .from("workspace_meetings")
        .insert({
          workspace_id: selectedWorkspaceId,
          created_by: userId,
          title: meetingTitle.trim(),
          provider: "jitsi",
          room_name: roomName,
          meeting_url: meetingUrl,
          starts_at: meetingStart ? new Date(meetingStart).toISOString() : null,
        })
        .select("*")
        .single();

      if (error) {
        logDev("CREATE MEETING ERROR:", error);
        notify(friendlyError(error, "Could not create the meeting."), "error");
        return;
      }

      setMeetingTitle("");
      setMeetingStart("");

      setMeetings((prev) => [createdMeeting as WorkspaceMeeting, ...prev]);
      setActiveMeeting(createdMeeting as WorkspaceMeeting);
      setActiveTab("meetings");
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

    setSavingUpdate(true);

    const { error } = await supabase.from("workspace_updates").insert({
      workspace_id: selectedWorkspaceId,
      author_id: userId,
      update_type: "note",
      body: updateText.trim(),
    });

    if (error) {
      logDev("ADD UPDATE ERROR:", error);
      notify(friendlyError(error, "Could not post the update."), "error");
      setSavingUpdate(false);
      return;
    }

    setUpdateText("");

    await loadWorkspaceDetails(selectedWorkspaceId);
    setSavingUpdate(false);
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
      handleReloadCurrentWorkspace={() =>
        selectedWorkspaceId ? loadWorkspaceDetails(selectedWorkspaceId) : null
      }
    />
  );
}
