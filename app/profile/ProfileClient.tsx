"use client";

import { useEffect, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import { uploadProblem } from "@/lib/uploadRules";
import ProfileUI from "./UI";

const PROFILE_BUCKET = "profile-avatars";

export default function ProfileClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [bio, setBio] = useState("");
  const [orcidId, setOrcidId] = useState("");
const [googleScholarUrl, setGoogleScholarUrl] = useState("");
const [researchGateUrl, setResearchGateUrl] = useState("");
const [personalWebsiteUrl, setPersonalWebsiteUrl] = useState("");

const [externalPublicationCount, setExternalPublicationCount] = useState(0);
const [externalCitationCount, setExternalCitationCount] = useState(0);
const [externalHIndex, setExternalHIndex] = useState(0);
const [externalMetricsSyncedAt, setExternalMetricsSyncedAt] = useState("");
const [syncingMetrics, setSyncingMetrics] = useState(false);

  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [coverPhotoUrl, setCoverPhotoUrl] = useState("");
  const [previewProfileUrl, setPreviewProfileUrl] = useState("");
  const [previewCoverUrl, setPreviewCoverUrl] = useState("");

  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [coverPhotoFile, setCoverPhotoFile] = useState<File | null>(null);

function cleanOrcidId(value: string) {
  return value
    .trim()
    .replace("https://orcid.org/", "")
    .replace("http://orcid.org/", "");
}

function isValidOrcidId(value: string) {
  if (!value.trim()) return true;

  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(cleanOrcidId(value));
}



 useEffect(() => {
  let cancelled = false;

  const loadProfile = async () => {
    setLoading(true);

    try {
      const authUser = await getCurrentUserSafe();

      if (!authUser) {
        router.push("/auth/login");
        return;
      }

      if (cancelled) return;

      setUserId(authUser.id);
      setEmail(authUser.email ?? "");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (profileError) {
        logDev("LOAD PROFILE ERROR:", profileError);
      }

      if (cancelled) return;

if (profileData) {
  setName(profileData.full_name ?? "");
  setDept(profileData.department ?? "");
  setSkills(profileData.skills ?? "");
  setInterests(profileData.interests ?? "");
  setBio(profileData.bio ?? "");
  setProfilePicUrl(profileData.profile_pic_url ?? "");
  setCoverPhotoUrl(profileData.cover_photo_url ?? "");

  setOrcidId(profileData.orcid_id ?? "");
  setGoogleScholarUrl(profileData.google_scholar_url ?? "");
  setResearchGateUrl(profileData.researchgate_url ?? "");
  setPersonalWebsiteUrl(profileData.personal_website_url ?? "");

  setExternalPublicationCount(profileData.external_publication_count ?? 0);
  setExternalCitationCount(profileData.external_citation_count ?? 0);
  setExternalHIndex(profileData.external_h_index ?? 0);
  setExternalMetricsSyncedAt(profileData.external_metrics_synced_at ?? "");
}
    } catch (error) {
      if (isAuthLockError(error)) {
        logDev("PROFILE AUTH LOCK ERROR:", error);
        return;
      }

      logDev("PROFILE LOAD ERROR:", error);
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  loadProfile();

  return () => {
    cancelled = true;
  };
}, [router]);

  const handleProfilePicSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setProfilePicFile(file);

    const reader = new FileReader();

    reader.onload = (event) => {
      setPreviewProfileUrl(event.target?.result as string);
    };

    reader.readAsDataURL(file);
  };

  const handleCoverPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setCoverPhotoFile(file);

    const reader = new FileReader();

    reader.onload = (event) => {
      setPreviewCoverUrl(event.target?.result as string);
    };

    reader.readAsDataURL(file);
  };

  // Returns null when the file is not allowed (the reason is shown to the user).
  const uploadFile = async (file: File, folder: string, fileName: string) => {
    const problem = uploadProblem(file, { imagesOnly: true });
    if (problem) {
      notify(problem, "error");
      return null;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${folder}/${fileName}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from(PROFILE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleUploadProfilePic = async () => {
    if (!profilePicFile || !userId) return;

    setUploading(true);

    try {
      const url = await uploadFile(
        profilePicFile,
        userId,
        `profile-${Date.now()}`,
      );

      if (!url) return;

      setProfilePicUrl(url);
      setProfilePicFile(null);
      setPreviewProfileUrl("");

      const { error } = await supabase
        .from("profiles")
        .update({
          profile_pic_url: url,
        })
        .eq("id", userId);

      if (error) throw error;

      notify("Profile picture updated!", "success");
    } catch (error) {
      logDev("UPLOAD PROFILE PICTURE ERROR:", error);
      notify(friendlyError(error, "Could not update the profile picture."), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCover = async () => {
    if (!coverPhotoFile || !userId) return;

    setUploading(true);

    try {
      const url = await uploadFile(
        coverPhotoFile,
        userId,
        `cover-${Date.now()}`,
      );

      if (!url) return;

      setCoverPhotoUrl(url);
      setCoverPhotoFile(null);
      setPreviewCoverUrl("");

      const { error } = await supabase
        .from("profiles")
        .update({
          cover_photo_url: url,
        })
        .eq("id", userId);

      if (error) throw error;

      notify("Cover photo updated!", "success");
    } catch (error) {
      logDev("UPLOAD COVER PHOTO ERROR:", error);
      notify(friendlyError(error, "Could not update the cover photo."), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) {
      notify("Log in to save your profile.", "error");
      return;
    }
    if (!isValidOrcidId(orcidId)) {
  notify("Invalid ORCID iD. Example format: 0000-0002-1825-0097", "error");
  return;
}

    setSaving(true);

    try {
    const { error } = await supabase.from("profiles").upsert({
  id: userId,
  email,
  full_name: name,
  department: dept,
  skills,
  interests,
  bio,
  orcid_id: cleanOrcidId(orcidId) || null,
  google_scholar_url: googleScholarUrl.trim() || null,
  researchgate_url: researchGateUrl.trim() || null,
  personal_website_url: personalWebsiteUrl.trim() || null,
  updated_at: new Date().toISOString(),
});

      if (error) throw error;

      notify("Profile saved!", "success");
      setEditMode(false);
    } catch (error) {
      logDev("SAVE PROFILE ERROR:", error);
      notify(friendlyError(error, "Could not save your profile."), "error");
    } finally {
      setSaving(false);
    }
  };
  const handleSyncExternalMetrics = async () => {
    if (!userId) {
      notify("Log in to sync research metrics.", "error");
      return;
    }

    const cleanId = cleanOrcidId(orcidId);

    if (!cleanId) {
      notify("Add your ORCID iD first.", "info");
      return;
    }

    if (!isValidOrcidId(cleanId)) {
      notify("Invalid ORCID iD. Example format: 0000-0002-1825-0097", "error");
      return;
    }

    setSyncingMetrics(true);

    try {
      // The database asks OpenAlex and saves the numbers itself, so nobody can
      // type in their own citation count or h-index (audit RG-09).
      const { data, error } = await supabase.rpc("sync_my_research_metrics", {
        orcid: cleanId,
      });

      if (error) {
        logDev("SYNC EXTERNAL METRICS ERROR:", error);
        notify(friendlyError(error, "Could not sync research metrics."), "error");
        return;
      }

      const synced = ((data || []) as {
        orcid_id: string | null;
        publication_count: number | null;
        citation_count: number | null;
        h_index: number | null;
        synced_at: string | null;
      }[])[0];

      if (!synced) {
        notify("Could not sync research metrics.", "error");
        return;
      }

      setOrcidId(synced.orcid_id || cleanId);
      setExternalPublicationCount(synced.publication_count ?? 0);
      setExternalCitationCount(synced.citation_count ?? 0);
      setExternalHIndex(synced.h_index ?? 0);
      setExternalMetricsSyncedAt(synced.synced_at ?? "");

      notify("Research metrics synced successfully.", "success");
    } catch (error) {
      logDev("SYNC EXTERNAL METRICS ERROR:", error);
      notify(friendlyError(error, "Could not sync research metrics."), "error");
    } finally {
      setSyncingMetrics(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <ProfileUI
      loading={loading}
      saving={saving}
      uploading={uploading}
      editMode={editMode}
      email={email}
      name={name}
      dept={dept}
      skills={skills}
      interests={interests}
      bio={bio}
      orcidId={orcidId}
googleScholarUrl={googleScholarUrl}
researchGateUrl={researchGateUrl}
personalWebsiteUrl={personalWebsiteUrl}
externalPublicationCount={externalPublicationCount}
externalCitationCount={externalCitationCount}
externalHIndex={externalHIndex}
externalMetricsSyncedAt={externalMetricsSyncedAt}
syncingMetrics={syncingMetrics}
handleSyncExternalMetrics={handleSyncExternalMetrics}
setOrcidId={setOrcidId}
setGoogleScholarUrl={setGoogleScholarUrl}
setResearchGateUrl={setResearchGateUrl}
setPersonalWebsiteUrl={setPersonalWebsiteUrl}
      profilePicUrl={profilePicUrl}
      coverPhotoUrl={coverPhotoUrl}
      previewProfileUrl={previewProfileUrl}
      previewCoverUrl={previewCoverUrl}
      profilePicFile={profilePicFile}
      coverPhotoFile={coverPhotoFile}
      setEditMode={setEditMode}
      setName={setName}
      setDept={setDept}
      setSkills={setSkills}
      setInterests={setInterests}
      setBio={setBio}
      handleProfilePicSelect={handleProfilePicSelect}
      handleCoverPhotoSelect={handleCoverPhotoSelect}
      handleUploadProfilePic={handleUploadProfilePic}
      handleUploadCover={handleUploadCover}
      handleSave={handleSave}
      handleLogout={handleLogout}
    />
  );
}