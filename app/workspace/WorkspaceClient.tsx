"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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

const BUCKET_NAME = "content-files";

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
        console.log("WORKSPACE TEAM AUTH LOCK ERROR:", error);
        return;
      }

      console.log("WORKSPACE TEAM AUTH ERROR:", error);
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
    console.log("LOAD WORKSPACE MEMBERS ERROR:", memberError);
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
      console.log("LOAD MEMBER PROFILES ERROR:", memberProfileError);
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

  (connectionRows || []).forEach((connection: any) => {
    addCandidatePair(connection.user_one_id, connection.user_two_id);
  });

  const { data: acceptedResearchRows } = await supabase
    .from("research_requests")
    .select("requester_id, receiver_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`);

  (acceptedResearchRows || []).forEach((request: any) => {
    addCandidatePair(request.requester_id, request.receiver_id);
  });

  const { data: acceptedProfileRows } = await supabase
    .from("profile_requests")
    .select("requester_id, receiver_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`);

  (acceptedProfileRows || []).forEach((request: any) => {
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
    console.log("LOAD COLLABORATOR OPTIONS ERROR:", candidateProfileError);
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

    if (taskResult.error) console.log("LOAD TASKS ERROR:", taskResult.error);
    if (fileResult.error) console.log("LOAD FILES ERROR:", fileResult.error);
    if (milestoneResult.error)
      console.log("LOAD MILESTONES ERROR:", milestoneResult.error);
    if (meetingResult.error)
      console.log("LOAD MEETINGS ERROR:", meetingResult.error);
    if (recordingResult.error)
      console.log("LOAD RECORDINGS ERROR:", recordingResult.error);
    if (updateResult.error)
      console.log("LOAD UPDATES ERROR:", updateResult.error);

    setTasks((taskResult.data || []) as WorkspaceTask[]);
    setWorkspaceFiles((fileResult.data || []) as WorkspaceFile[]);
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
      console.log("LOAD WORKSPACES ERROR:", error);
      alert(error.message);
      setWorkspaces([]);
      return;
    }

    const safeWorkspaces = (data || []) as Workspace[];
    setWorkspaces(safeWorkspaces);

    if (safeWorkspaces.length > 0) {
      const nextSelected =
        selectedWorkspaceId &&
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

useEffect(() => {
  let cancelled = false;

  const load = async () => {
    setLoading(true);

    try {
      const authUser = await getCurrentUserSafe();

      if (!authUser) {
        router.push("/auth/login");
        return;
      }

      if (cancelled) return;

      setUserId(authUser.id);

      await loadWorkspaces();
    } catch (error) {
      if (isAuthLockError(error)) {
        console.log("WORKSPACE AUTH LOCK ERROR:", error);
        return;
      }

      console.log("WORKSPACE LOAD ERROR:", error);
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
    console.log("CHECK WORKSPACE GROUP CONVERSATION ERROR:", existingError);
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
    console.log("CREATE WORKSPACE GROUP CONVERSATION ERROR:", error);
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
    console.log("FIND WORKSPACE GROUP CONVERSATION ERROR:", error);
    return;
  }

  if (!conversation?.id) {
    console.log("No workspace group conversation found for:", workspaceId);
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
    console.log("ADD USER TO WORKSPACE GROUP CHAT ERROR:", memberError);
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
    console.log("FIND WORKSPACE GROUP CONVERSATION ERROR:", error);
    return;
  }

  if (!conversation?.id) return;

  const { error: removeError } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversation.id)
    .eq("user_id", userIdToRemove);

  if (removeError) {
    console.log("REMOVE USER FROM WORKSPACE GROUP CHAT ERROR:", removeError);
  }
};

  const handleCreateWorkspace = async () => {
    if (!userId) {
      alert("You must be logged in.");
      return;
    }

    if (!workspaceTitle.trim()) {
      alert("Add a workspace title.");
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
      console.log("CREATE WORKSPACE ERROR:", workspaceError);
      alert(workspaceError?.message || "Could not create workspace.");
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
      console.log("CREATE WORKSPACE MEMBER ERROR:", memberError);
      alert(
        `Workspace created, but owner member row failed: ${memberError.message}`,
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

    const confirmed = window.confirm(
      "Convert this personal workspace into a shared workspace?",
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("workspaces")
      .update({
        workspace_type: "shared",
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedWorkspace.id);

    if (error) {
      console.log("CONVERT WORKSPACE ERROR:", error);
      alert(error.message);
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
      alert("Select a workspace first.");
      return;
    }

    if (selectedWorkspace.workspace_type !== "shared") {
      alert("Convert this personal workspace to shared first.");
      return;
    }

    const memberIdToAdd = selectedCollaboratorId.trim();

    if (!memberIdToAdd) {
      alert("Please select a collaborator first.");
      return;
    }

    const selectedProfile = collaboratorOptions.find(
      (profile) => profile.id === memberIdToAdd,
    );

    if (!selectedProfile) {
      alert("Selected collaborator was not found. Please select again.");
      setSelectedCollaboratorId("");
      return;
    }

    const confirmAdd = window.confirm(
      `Add ${
        selectedProfile.full_name ||
        selectedProfile.email ||
        "this collaborator"
      } to this workspace?`,
    );

    if (!confirmAdd) return;

    setAddingMember(true);

    const { error } = await supabase.from("workspace_members").insert({
      workspace_id: selectedWorkspaceId,
      user_id: memberIdToAdd,
      role: "member",
    });

    if (error) {
      console.log("ADD WORKSPACE MEMBER ERROR:", error);
      alert(error.message);
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
      alert("Workspace owner cannot be removed.");
      return;
    }

    const confirmRemove = window.confirm(
      `Remove ${
        member.profile?.full_name || member.profile?.email || "this member"
      } from this workspace?`,
    );

    if (!confirmRemove) return;

    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("id", member.id);

    if (error) {
      console.log("REMOVE WORKSPACE MEMBER ERROR:", error);
      alert(error.message);
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
      alert("Create or select a workspace first.");
      return;
    }

    if (!taskTitle.trim()) {
      alert("Add a task title.");
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
      console.log("ADD TASK ERROR:", error);
      alert(error.message);
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
      console.log("UPDATE TASK ERROR:", error);
      alert(error.message);
      return;
    }

    if (selectedWorkspaceId) {
      await loadWorkspaceDetails(selectedWorkspaceId);
    }
  };

  const handleUploadFiles = async () => {
    if (!selectedWorkspaceId) {
      alert("Select a workspace first.");
      return;
    }

    if (selectedFiles.length === 0) {
      alert("Choose at least one file.");
      return;
    }

    setUploadingFile(true);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const ext = getFileExt(file.name);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `workspace/${userId}/${selectedWorkspaceId}/${Date.now()}-${i}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.log("WORKSPACE FILE UPLOAD ERROR:", uploadError);
        alert(uploadError.message);
        setUploadingFile(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      const { error: insertError } = await supabase
        .from("workspace_files")
        .insert({
          workspace_id: selectedWorkspaceId,
          uploaded_by: userId,
          file_url: publicData.publicUrl,
          storage_path: storagePath,
          original_name: file.name,
          mime_type: file.type || null,
          file_ext: ext,
          file_size: file.size,
          file_category: getFileCategory(file),
        });

      if (insertError) {
        console.log("WORKSPACE FILE INSERT ERROR:", insertError);
        alert(insertError.message);
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
      alert("Select a workspace first.");
      return;
    }

    if (!milestoneTitle.trim()) {
      alert("Add a milestone title.");
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
      console.log("ADD MILESTONE ERROR:", error);
      alert(error.message);
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
      console.log("UPDATE MILESTONE ERROR:", error);
      alert(error.message);
      return;
    }

    if (selectedWorkspaceId) {
      await loadWorkspaceDetails(selectedWorkspaceId);
    }
  };

  const handleCreateMeeting = async () => {
    if (!selectedWorkspaceId) {
      alert("Select a workspace first.");
      return;
    }

    if (!userId) {
      alert("You must be logged in.");
      return;
    }

    if (!meetingTitle.trim()) {
      alert("Add a meeting title.");
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
        console.log("CREATE MEETING ERROR:", error);
        alert(error.message);
        return;
      }

      setMeetingTitle("");
      setMeetingStart("");

      setMeetings((prev) => [createdMeeting as WorkspaceMeeting, ...prev]);
      setActiveMeeting(createdMeeting as WorkspaceMeeting);
      setActiveTab("meetings");
    } catch (error) {
      console.log("CREATE MEETING UNKNOWN ERROR:", error);
      alert("Could not create meeting. Check browser console for details.");
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleAddUpdate = async () => {
    if (!selectedWorkspaceId) {
      alert("Select a workspace first.");
      return;
    }

    if (!updateText.trim()) {
      alert("Write an update first.");
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
      console.log("ADD UPDATE ERROR:", error);
      alert(error.message);
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
