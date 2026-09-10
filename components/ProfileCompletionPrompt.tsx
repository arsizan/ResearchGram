// "use client";

// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import { supabase } from "@/lib/supabase";

// type ProfileStatus = {
//   onboarding_completed: boolean | null;
//   profile_completion_score: number | null;
//   user_role: string | null;
// };

// export default function ProfileCompletionPrompt() {
//   const router = useRouter();

//   const [loading, setLoading] = useState(true);
//   const [status, setStatus] = useState<ProfileStatus | null>(null);

//   useEffect(() => {
//     const loadStatus = async () => {
//       const { data: authData } = await supabase.auth.getUser();

//       if (!authData.user) {
//         setLoading(false);
//         return;
//       }

//       const { data, error } = await supabase
//         .from("profiles")
//         .select("onboarding_completed, profile_completion_score, user_role")
//         .eq("id", authData.user.id)
//         .maybeSingle();

//       if (error) {
//         console.log("PROFILE COMPLETION PROMPT ERROR:", error);
//       }

//       setStatus(data as ProfileStatus | null);
//       setLoading(false);
//     };

//     loadStatus();
//   }, []);

//   if (loading || !status) return null;

//   const score = status.profile_completion_score || 0;
//   const shouldShow =
//     !status.onboarding_completed || score < 70 || !status.user_role;

//   if (!shouldShow) return null;

//   return (
//     <div className="fixed bottom-5 right-5 z-[80] w-[340px] rounded-3xl border border-blue-100 bg-white p-5 shadow-2xl">
//       <div className="flex items-start gap-3">
//         <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
//           🎓
//         </div>

//         <div>
//           <h2 className="font-bold text-gray-950">Complete your profile</h2>

//           <p className="mt-1 text-sm leading-6 text-gray-500">
//             Add your role, academic level, skills, interests, and alumni
//             information to get better suggestions.
//           </p>
//         </div>
//       </div>

//       <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
//         <div
//           className="h-full rounded-full bg-blue-600"
//           style={{ width: `${score}%` }}
//         />
//       </div>

//       <p className="mt-2 text-xs font-semibold text-gray-500">
//         Current completion: {score}%
//       </p>

//       <button
//         onClick={() => router.push("/onboarding?next=/profile")}
//         className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
//       >
//         Update Profile
//       </button>
//     </div>
//   );
// }
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileStatus = {
  onboarding_completed: boolean | null;
  profile_completion_score: number | null;
  user_role: string | null;
};

export default function ProfileCompletionPrompt() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ProfileStatus | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed, profile_completion_score, user_role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (error) {
        console.log("PROFILE COMPLETION PROMPT ERROR:", error);
      }

      setStatus(data as ProfileStatus | null);
      setLoading(false);
    };

    loadStatus();
  }, []);

  if (loading || !status) return null;

  const score = status.profile_completion_score || 0;
  const shouldShow =
    !status.onboarding_completed || score < 70 || !status.user_role;

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-24 right-5 z-[80] w-[340px] rounded-3xl border border-blue-100 bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
          🎓
        </div>

        <div>
          <h2 className="font-bold text-gray-950">Complete your profile</h2>

          <p className="mt-1 text-sm leading-6 text-gray-500">
            Add your role, academic level, skills, interests, and alumni
            information to get better suggestions.
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${score}%` }}
        />
      </div>

      <p className="mt-2 text-xs font-semibold text-gray-500">
        Current completion: {score}%
      </p>

      <button
        onClick={() => router.push("/onboarding?next=/profile")}
        className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Update Profile
      </button>
    </div>
  );
}