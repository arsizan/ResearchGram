"use client";
type OnboardingUIProps = {
  loading: boolean;
  saving: boolean;
  email: string;
  completionScore: number;

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
  officeHours: string;
  mentorshipAvailable: boolean;

  setFullName: (value: string) => void;
  setDepartment: (value: string) => void;
  setUserRole: (value: string) => void;
  setAcademicLevel: (value: string) => void;
  setSkills: (value: string) => void;
  setInterests: (value: string) => void;
  setBio: (value: string) => void;
  setResearchArea: (value: string) => void;
  setExpertise: (value: string) => void;
  setBatch: (value: string) => void;
  setSession: (value: string) => void;
  setGraduationYear: (value: string) => void;
  setCurrentPosition: (value: string) => void;
  setCompanyOrInstitution: (value: string) => void;
  setOfficeHours: (value: string) => void;
  setMentorshipAvailable: (value: boolean) => void;

  handleSave: () => void;
};

function FieldLabel({
  children,
  htmlFor,
  required = false,
}: {
  children: string;
  /** id of the field this label names (RG-32). */
  htmlFor: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
      {children}
      {required && <span className="text-red-500" aria-hidden="true"> *</span>}
    </label>
  );
}

export default function OnboardingUI({
  loading,
  saving,
  email,
  completionScore,
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
  officeHours,
  mentorshipAvailable,
  setFullName,
  setDepartment,
  setUserRole,
  setAcademicLevel,
  setSkills,
  setInterests,
  setBio,
  setResearchArea,
  setExpertise,
  setBatch,
  setSession,
  setGraduationYear,
  setCurrentPosition,
  setCompanyOrInstitution,
  setOfficeHours,
  setMentorshipAvailable,
  handleSave,
}: OnboardingUIProps) {
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-lg text-gray-600">Loading profile setup...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-950">
                Complete your ResearchGram profile
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                This information helps ResearchGram suggest better researchers,
                alumni, mentors, collaborators, papers, and workspaces for you.
              </p>

              <p className="mt-2 text-xs text-gray-500">{email}</p>
            </div>

            <div className="rounded-3xl bg-blue-50 p-5 text-center">
              <p className="text-sm font-semibold text-blue-700">
                Profile Completion
              </p>

              <p className="mt-1 text-4xl font-bold text-blue-900">
                {completionScore}%
              </p>
            </div>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${completionScore}%` }}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">
                Basic Academic Information
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="onboarding-full-name" required>Full Name</FieldLabel>
                  <input
                    id="onboarding-full-name"
                    aria-required="true"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-department" required>Department</FieldLabel>
                  <input
                    id="onboarding-department"
                    aria-required="true"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Computer Science and Engineering"
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-user-role" required>User Type</FieldLabel>
                  <select
                    id="onboarding-user-role"
                    aria-required="true"
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="alumni">Alumni</option>
                  </select>
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-academic-level" required>Academic Level</FieldLabel>
                  <input
                    id="onboarding-academic-level"
                    aria-required="true"
                    value={academicLevel}
                    onChange={(e) => setAcademicLevel(e.target.value)}
                    placeholder="BSc, MSc, PhD, Lecturer, Professor..."
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                {userRole === "student" && (
                  <>
                    <div>
                      <FieldLabel htmlFor="onboarding-batch" required>Batch</FieldLabel>
                      <input
                        id="onboarding-batch"
                        aria-required="true"
                        value={batch}
                        onChange={(e) => setBatch(e.target.value)}
                        placeholder="Example: 15th Batch"
                        className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="onboarding-session" required>Session</FieldLabel>
                      <input
                        id="onboarding-session"
                        aria-required="true"
                        value={session}
                        onChange={(e) => setSession(e.target.value)}
                        placeholder="Example: 2020-21"
                        className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}

                {userRole === "alumni" && (
                  <>
                    <div>
                      <FieldLabel htmlFor="onboarding-graduation-year" required>Graduation Year</FieldLabel>
                      <input
                        id="onboarding-graduation-year"
                        aria-required="true"
                        value={graduationYear}
                        onChange={(e) => setGraduationYear(e.target.value)}
                        placeholder="Example: 2022"
                        type="number"
                        className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="onboarding-current-position" required>Current Position</FieldLabel>
                      <input
                        id="onboarding-current-position"
                        aria-required="true"
                        value={currentPosition}
                        onChange={(e) => setCurrentPosition(e.target.value)}
                        placeholder="Software Engineer, Researcher..."
                        className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}

                {(userRole === "alumni" || userRole === "faculty") && (
                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="onboarding-company-or-institution" required>
                      Company / Institution
                    </FieldLabel>
                    <input
                      id="onboarding-company-or-institution"
                      aria-required="true"
                      value={companyOrInstitution}
                      onChange={(e) =>
                        setCompanyOrInstitution(e.target.value)
                      }
                      placeholder="PUST, Google, University, Research Lab..."
                      className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">
                Research Profile
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <FieldLabel htmlFor="onboarding-skills" required>Skills</FieldLabel>
                  <input
                    id="onboarding-skills"
                    aria-required="true"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="Python, Machine Learning, React, Data Mining"
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-interests" required>Research Interests</FieldLabel>
                  <input
                    id="onboarding-interests"
                    aria-required="true"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="AI, NLP, IoT, Cybersecurity, Bioinformatics"
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-research-area">Research Area</FieldLabel>
                  <input
                    id="onboarding-research-area"
                    value={researchArea}
                    onChange={(e) => setResearchArea(e.target.value)}
                    placeholder="Artificial Intelligence and Natural Language Processing"
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-expertise">Expertise</FieldLabel>
                  <input
                    id="onboarding-expertise"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    placeholder="Deep Learning, LLMs, Data Analysis..."
                    className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="onboarding-bio">Bio</FieldLabel>
                  <textarea
                    id="onboarding-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write a short academic introduction..."
                    className="min-h-[130px] w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Mentorship settings" className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">
                Mentorship
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                This helps students find faculty, alumni, and senior researchers.
              </p>

              <label className="mt-5 flex items-center gap-3 rounded-2xl bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={mentorshipAvailable}
                  onChange={(e) => setMentorshipAvailable(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-semibold text-gray-800">
                  Available for mentorship
                </span>
              </label>

              <div className="mt-4">
                <FieldLabel htmlFor="onboarding-office-hours">Office Hours</FieldLabel>
                <input
                  id="onboarding-office-hours"
                  value={officeHours}
                  onChange={(e) => setOfficeHours(e.target.value)}
                  placeholder="Example: Friday 8 PM - 10 PM"
                  className="w-full rounded-2xl border border-gray-200 p-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="rounded-3xl bg-blue-600 p-6 text-white shadow-sm">
              <h2 className="text-xl font-bold">Why this matters</h2>

              <div className="mt-4 space-y-3 text-sm leading-6 text-blue-50">
                <p>• Better researcher suggestions</p>
                <p>• Better alumni recommendations</p>
                <p>• Better mentor matching</p>
                <p>• Better collaborator matching</p>
                <p>• More trustworthy profile</p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-2xl bg-gray-950 px-5 py-4 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save and Continue"}
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}