"use client";

import type { ComponentProps } from "react";
import AppNav from "@/components/AppNav";

type ActivePage = ComponentProps<typeof AppNav>["activePage"];

type SkeletonVariant =
  | "feed"
  | "profile"
  | "workspace"
  | "messages"
  | "requests"
  | "network"
  | "generic";

type ResearchGramSkeletonProps = {
  activePage: ActivePage;
  variant?: SkeletonVariant;
  title?: string;
};

function SkeletonBox({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />;
}

function SkeletonCircle({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`animate-pulse rounded-full bg-slate-200/80 ${className}`} />;
}

function PageHeaderSkeleton() {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-600 p-6 sm:p-8">
        <SkeletonBox className="h-6 w-40 bg-white/25" />
        <SkeletonBox className="mt-5 h-10 w-72 bg-white/25" />
        <SkeletonBox className="mt-4 h-4 w-full max-w-xl bg-white/20" />
        <SkeletonBox className="mt-2 h-4 w-full max-w-md bg-white/20" />
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-12 gap-6 px-4 py-6">
      <div className="col-span-12 hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3 lg:block">
        <SkeletonBox className="h-7 w-40" />
        <SkeletonBox className="mt-4 h-4 w-full" />
        <SkeletonBox className="mt-2 h-4 w-4/5" />
        <SkeletonBox className="mt-6 h-28 w-full rounded-3xl" />
        <SkeletonBox className="mt-4 h-12 w-full rounded-2xl" />
        <SkeletonBox className="mt-3 h-12 w-full rounded-2xl" />
      </div>

      <section className="col-span-12 space-y-5 lg:col-span-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <SkeletonCircle className="h-12 w-12" />
            <div className="flex-1">
              <SkeletonBox className="h-4 w-44" />
              <SkeletonBox className="mt-2 h-4 w-28" />
            </div>
          </div>
          <SkeletonBox className="mt-5 h-28 w-full rounded-3xl" />
          <div className="mt-4 flex gap-3">
            <SkeletonBox className="h-10 w-28 rounded-full" />
            <SkeletonBox className="h-10 w-28 rounded-full" />
            <SkeletonBox className="h-10 w-28 rounded-full" />
          </div>
        </div>

        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <SkeletonCircle className="h-12 w-12" />
              <div className="flex-1">
                <SkeletonBox className="h-4 w-44" />
                <SkeletonBox className="mt-2 h-3 w-28" />
              </div>
              <SkeletonBox className="h-8 w-20 rounded-full" />
            </div>

            <SkeletonBox className="mt-5 h-6 w-4/5" />
            <SkeletonBox className="mt-4 h-4 w-full" />
            <SkeletonBox className="mt-2 h-4 w-full" />
            <SkeletonBox className="mt-2 h-4 w-3/4" />

            <SkeletonBox className="mt-5 h-44 w-full rounded-3xl" />

            <div className="mt-5 flex gap-3">
              <SkeletonBox className="h-10 w-24 rounded-full" />
              <SkeletonBox className="h-10 w-24 rounded-full" />
              <SkeletonBox className="h-10 w-36 rounded-full" />
            </div>
          </div>
        ))}
      </section>

      <div className="col-span-12 hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3 lg:block">
        <SkeletonBox className="h-7 w-32" />
        {[1, 2, 3, 4, 5].map((item) => (
          <SkeletonBox key={item} className="mt-4 h-5 w-3/4 rounded-full" />
        ))}
      </div>
    </div>
  );
}

function CardsGridSkeleton() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:px-6 lg:pb-8">
      <PageHeaderSkeleton />

      <div className="mt-5 flex flex-col gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <SkeletonBox className="h-12 w-full rounded-2xl sm:max-w-xl" />
        <SkeletonBox className="h-12 w-full rounded-2xl sm:w-56" />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div
            key={item}
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <SkeletonCircle className="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <SkeletonBox className="h-5 w-44" />
                <SkeletonBox className="mt-2 h-4 w-32" />
                <SkeletonBox className="mt-3 h-3 w-28" />
              </div>
            </div>

            <SkeletonBox className="mt-5 h-4 w-full" />
            <SkeletonBox className="mt-2 h-4 w-full" />
            <SkeletonBox className="mt-2 h-4 w-2/3" />

            <div className="mt-5 flex flex-wrap gap-2">
              <SkeletonBox className="h-8 w-20 rounded-full" />
              <SkeletonBox className="h-8 w-24 rounded-full" />
              <SkeletonBox className="h-8 w-16 rounded-full" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
              <SkeletonBox className="h-11 rounded-2xl" />
              <SkeletonBox className="h-11 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RequestsSkeleton() {
  return (
    <section className="mx-auto max-w-[800px] px-4 py-6 pb-24 lg:px-6 lg:pb-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <SkeletonBox className="h-8 w-36" />
          <SkeletonBox className="mt-3 h-4 w-72" />
        </div>
        <SkeletonBox className="h-8 w-24 rounded-full" />
      </div>

      <SkeletonBox className="mb-4 h-12 w-72 rounded-2xl" />

      <div className="mb-5 flex gap-2 overflow-hidden">
        <SkeletonBox className="h-10 w-20 rounded-full" />
        <SkeletonBox className="h-10 w-28 rounded-full" />
        <SkeletonBox className="h-10 w-28 rounded-full" />
        <SkeletonBox className="h-10 w-36 rounded-full" />
      </div>

      <div className="space-y-3">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <SkeletonCircle className="h-12 w-12" />
              <div className="flex-1">
                <div className="flex gap-2">
                  <SkeletonBox className="h-5 w-28 rounded-full" />
                  <SkeletonBox className="h-5 w-20 rounded-full" />
                </div>
                <SkeletonBox className="mt-4 h-5 w-64" />
                <SkeletonBox className="mt-3 h-4 w-40" />
                <SkeletonBox className="mt-4 h-4 w-full" />
                <SkeletonBox className="mt-2 h-4 w-3/4" />

                <div className="mt-4 flex gap-2">
                  <SkeletonBox className="h-10 w-24 rounded-xl" />
                  <SkeletonBox className="h-10 w-24 rounded-xl" />
                  <SkeletonBox className="h-10 w-28 rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MessagesSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px]" style={{ height: "calc(100vh - 64px)" }}>
      <div className="flex h-full overflow-hidden">
        <div className="flex w-full flex-col border-r border-slate-200 bg-white lg:w-[340px]">
          <div className="border-b border-slate-200 p-4">
            <SkeletonBox className="h-7 w-32" />
            <SkeletonBox className="mt-4 h-10 w-full rounded-2xl" />
            <SkeletonBox className="mt-3 h-10 w-full rounded-2xl" />
          </div>

          <div className="flex-1 space-y-1 p-2">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl p-3">
                <SkeletonCircle className="h-11 w-11" />
                <div className="flex-1">
                  <SkeletonBox className="h-4 w-36" />
                  <SkeletonBox className="mt-2 h-3 w-52" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="hidden flex-1 flex-col bg-slate-50 lg:flex">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <SkeletonCircle className="h-12 w-12" />
              <div>
                <SkeletonBox className="h-5 w-48" />
                <SkeletonBox className="mt-2 h-3 w-64" />
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 p-5">
            <SkeletonBox className="h-10 w-40 rounded-3xl" />
            <SkeletonBox className="ml-auto h-16 w-72 rounded-3xl" />
            <SkeletonBox className="h-20 w-80 rounded-3xl" />
            <SkeletonBox className="ml-auto h-14 w-64 rounded-3xl" />
            <SkeletonBox className="h-16 w-72 rounded-3xl" />
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <SkeletonBox className="h-12 w-full rounded-2xl" />
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:px-6 lg:pb-8">
      <PageHeaderSkeleton />

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4">
          <SkeletonBox className="h-6 w-44" />
          <SkeletonBox className="mt-4 h-12 w-full rounded-2xl" />
          {[1, 2, 3, 4].map((item) => (
            <SkeletonBox key={item} className="mt-3 h-20 w-full rounded-2xl" />
          ))}
        </div>

        <section className="space-y-5 lg:col-span-8">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <SkeletonBox className="h-8 w-64" />
            <SkeletonBox className="mt-3 h-4 w-full" />
            <SkeletonBox className="mt-2 h-4 w-3/4" />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <SkeletonBox className="h-24 rounded-3xl" />
              <SkeletonBox className="h-24 rounded-3xl" />
              <SkeletonBox className="h-24 rounded-3xl" />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <SkeletonBox key={item} className="h-44 rounded-[2rem]" />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-6 lg:pb-8">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="h-40 bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-600" />

        <div className="-mt-12 px-6 pb-6">
          <SkeletonCircle className="h-24 w-24 ring-4 ring-white" />
          <SkeletonBox className="mt-5 h-8 w-64" />
          <SkeletonBox className="mt-3 h-4 w-96 max-w-full" />
          <div className="mt-5 flex flex-wrap gap-2">
            <SkeletonBox className="h-9 w-24 rounded-full" />
            <SkeletonBox className="h-9 w-32 rounded-full" />
            <SkeletonBox className="h-9 w-28 rounded-full" />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SkeletonBox className="h-48 rounded-[2rem]" />
          <SkeletonBox className="h-64 rounded-[2rem]" />
        </div>

        <div className="space-y-5">
          <SkeletonBox className="h-48 rounded-[2rem]" />
          <SkeletonBox className="h-48 rounded-[2rem]" />
        </div>
      </div>
    </section>
  );
}

function GenericSkeleton() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-6 lg:pb-8">
      <PageHeaderSkeleton />
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <SkeletonBox key={item} className="h-56 rounded-[2rem]" />
        ))}
      </div>
    </section>
  );
}

export default function ResearchGramSkeleton({
  activePage,
  variant = "generic",
}: ResearchGramSkeletonProps) {
  return (
    <main className="min-h-screen bg-slate-50" aria-busy="true">
      <AppNav activePage={activePage} />

      {/* The grey shapes mean nothing to a screen reader; this does (RG-32). */}
      <p role="status" className="sr-only">
        Loading…
      </p>

      {variant === "feed" && <FeedSkeleton />}
      {variant === "network" && <CardsGridSkeleton />}
      {variant === "requests" && <RequestsSkeleton />}
      {variant === "messages" && <MessagesSkeleton />}
      {variant === "workspace" && <WorkspaceSkeleton />}
      {variant === "profile" && <ProfileSkeleton />}
      {variant === "generic" && <GenericSkeleton />}
    </main>
  );
}