import { Suspense } from "react";
import OnboardingClient from "./OnboardingClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Set up your profile");

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-100">
          <p className="text-lg text-gray-600">Loading onboarding...</p>
        </main>
      }
    >
      <OnboardingClient />
    </Suspense>
  );
}