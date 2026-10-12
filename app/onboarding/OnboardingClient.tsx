"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import OnboardingUI from "./UI";
import { logDev } from "@/lib/log";
import { friendlyError, notify } from "@/lib/feedback";

function cleanNextPath(value: string | null) {
  if (!value) return "/feed";
  if (!value.startsWith("/")) return "/feed";
  if (value.startsWith("//")) return "/feed";
  if (value.startsWith("/auth")) return "/feed";
  return value;
}

function calculateCompletionScore(values: {
  fullName: string;
  department: string;
  userRole: string;
  academicLevel: string;
  skills: string;
  interests: string;
  bio: string;
  researchArea: string;
  expertise: string;
  batch: string;
  session: string;
  graduationYear: string;
  currentPosition: string;
  companyOrInstitution: string;
}) {
  const checks = [
    values.fullName.trim(),
    values.department.trim(),
    values.userRole.trim(),
    values.academicLevel.trim(),
    values.skills.trim(),
    values.interests.trim(),
    values.bio.trim(),
    values.researchArea.trim(),
    values.expertise.trim(),
  ];

  if (values.userRole === "student") {
    checks.push(values.batch.trim(), values.session.trim());
  }

  if (values.userRole === "alumni") {
    checks.push(
      values.graduationYear.trim(),
      values.currentPosition.trim(),
      values.companyOrInstitution.trim(),
    );
  }

  if (values.userRole === "faculty") {
    checks.push(values.companyOrInstitution.trim());
  }

  const completed = checks.filter(Boolean).length;

  return Math.round((completed / checks.length) * 100);
}

export default function OnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = cleanNextPath(searchParams.get("next"));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [userRole, setUserRole] = useState("student");
  const [academicLevel, setAcademicLevel] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [bio, setBio] = useState("");
  const [researchArea, setResearchArea] = useState("");
  const [expertise, setExpertise] = useState("");

  const [batch, setBatch] = useState("");
  const [session, setSession] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [currentPosition, setCurrentPosition] = useState("");
  const [companyOrInstitution, setCompanyOrInstitution] = useState("");

  const [officeHours, setOfficeHours] = useState("");
  const [mentorshipAvailable, setMentorshipAvailable] = useState(false);

  const completionScore = useMemo(
    () =>
      calculateCompletionScore({
        fullName,
        department,
        userRole,
        academicLevel,
        skills,
        interests,
        bio,
        researchArea,
        expertise,
        batch,
        session,
        graduationYear,
        currentPosition,
        companyOrInstitution,
      }),
    [
      fullName,
      department,
      userRole,
      academicLevel,
      skills,
      interests,
      bio,
      researchArea,
      expertise,
      batch,
      session,
      graduationYear,
      currentPosition,
      companyOrInstitution,
    ],
  );

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

      const activeUserId = authUser.id;

      setUserId(activeUserId);
      setEmail(authUser.email || "");

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select(
          "full_name, email, department, skills, interests, bio, user_role, academic_level, batch, session, graduation_year, current_position, company_or_institution, research_area, expertise, office_hours, mentorship_available",
        )
        .eq("id", activeUserId)
        .maybeSingle();

      if (error) {
        logDev("LOAD ONBOARDING PROFILE ERROR:", error);
      }

      if (cancelled) return;

      if (profileData) {
        setFullName(profileData.full_name || "");
        setDepartment(profileData.department || "");
        setSkills(profileData.skills || "");
        setInterests(profileData.interests || "");
        setBio(profileData.bio || "");
        setUserRole(profileData.user_role || "student");
        setAcademicLevel(profileData.academic_level || "");
        setBatch(profileData.batch || "");
        setSession(profileData.session || "");
        setGraduationYear(
          profileData.graduation_year
            ? String(profileData.graduation_year)
            : "",
        );
        setCurrentPosition(profileData.current_position || "");
        setCompanyOrInstitution(profileData.company_or_institution || "");
        setResearchArea(profileData.research_area || "");
        setExpertise(profileData.expertise || "");
        setOfficeHours(profileData.office_hours || "");
        setMentorshipAvailable(Boolean(profileData.mentorship_available));
      }
    } catch (error) {
      if (isAuthLockError(error)) {
        logDev("ONBOARDING AUTH LOCK ERROR:", error);
        return;
      }

      logDev("ONBOARDING LOAD ERROR:", error);
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

  const validateForm = () => {
    if (!fullName.trim()) return "Full name is required.";
    if (!department.trim()) return "Department is required.";
    if (!userRole.trim()) return "User role is required.";
    if (!academicLevel.trim()) return "Academic level is required.";
    if (!skills.trim()) return "Skills are required.";
    if (!interests.trim()) return "Research interests are required.";

    if (userRole === "student") {
      if (!batch.trim()) return "Batch is required for students.";
      if (!session.trim()) return "Session is required for students.";
    }

    if (userRole === "alumni") {
      if (!graduationYear.trim()) return "Graduation year is required for alumni.";
      if (!currentPosition.trim()) return "Current position is required for alumni.";
      if (!companyOrInstitution.trim()) {
        return "Company or institution is required for alumni.";
      }
    }

    if (userRole === "faculty" && !companyOrInstitution.trim()) {
      return "Institution is required for faculty.";
    }

    // The database stores a whole number; say which field is wrong instead of
    // a general "not valid" message from the save.
    if (graduationYear.trim()) {
      const year = Number(graduationYear.trim());
      const latest = new Date().getFullYear() + 10;
      if (!Number.isInteger(year) || year < 1950 || year > latest) {
        return `Graduation year must be a year between 1950 and ${latest}, for example 2022.`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();

    if (validationError) {
      notify(validationError, "error");
      return;
    }

    setSaving(true);

    const score = completionScore;
    const now = new Date().toISOString();

    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName.trim(),
        department: department.trim(),
        skills: skills.trim(),
        interests: interests.trim(),
        bio: bio.trim() || null,
        user_role: userRole,
        academic_level: academicLevel.trim(),
        batch: batch.trim() || null,
        session: session.trim() || null,
        graduation_year: graduationYear.trim()
          ? Number(graduationYear.trim())
          : null,
        current_position: currentPosition.trim() || null,
        company_or_institution: companyOrInstitution.trim() || null,
        research_area: researchArea.trim() || null,
        expertise: expertise.trim() || skills.trim(),
        office_hours: officeHours.trim() || null,
        mentorship_available: mentorshipAvailable,
        onboarding_completed: true,
        profile_completion_score: score,
        profile_completed_at: score >= 70 ? now : null,
        updated_at: now,
      },
      {
        onConflict: "id",
      },
    );

    if (error) {
      logDev("SAVE ONBOARDING ERROR:", error);
      notify(friendlyError(error, "Could not save your profile."), "error");
      setSaving(false);
      return;
    }

    router.push(nextPath);
  };

  return (
    <OnboardingUI
      loading={loading}
      saving={saving}
      email={email}
      completionScore={completionScore}
      fullName={fullName}
      department={department}
      userRole={userRole}
      academicLevel={academicLevel}
      skills={skills}
      interests={interests}
      bio={bio}
      researchArea={researchArea}
      expertise={expertise}
      batch={batch}
      session={session}
      graduationYear={graduationYear}
      currentPosition={currentPosition}
      companyOrInstitution={companyOrInstitution}
      officeHours={officeHours}
      mentorshipAvailable={mentorshipAvailable}
      setFullName={setFullName}
      setDepartment={setDepartment}
      setUserRole={setUserRole}
      setAcademicLevel={setAcademicLevel}
      setSkills={setSkills}
      setInterests={setInterests}
      setBio={setBio}
      setResearchArea={setResearchArea}
      setExpertise={setExpertise}
      setBatch={setBatch}
      setSession={setSession}
      setGraduationYear={setGraduationYear}
      setCurrentPosition={setCurrentPosition}
      setCompanyOrInstitution={setCompanyOrInstitution}
      setOfficeHours={setOfficeHours}
      setMentorshipAvailable={setMentorshipAvailable}
      handleSave={handleSave}
    />
  );
}