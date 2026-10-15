import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, { ContactLine, type LegalSection } from "@/components/legal/LegalDocument";
import { MINIMUM_AGE, OPERATOR_DETAILS, OPERATOR_NAME } from "@/lib/legal";

// Public and indexable: people read it before they sign up.
export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using ResearchGram: accounts, your content, what is not allowed, and how moderation works.",
};

const list = "list-disc space-y-1.5 pl-5";

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About ResearchGram",
    body: (
      <p>
        ResearchGram is a free, non-commercial academic network run by {OPERATOR_NAME}, {OPERATOR_DETAILS}. It lets
        researchers share their work, decide who reads their full papers, find collaborators and mentors, message each
        other and work together in workspaces.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul className={list}>
        <li>You must be {MINIMUM_AGE} years old or older.</li>
        <li>Give accurate information, and be honest in your profile about who you are and where you study or work.</li>
        <li>One person, one account. Do not share your account or create accounts for other people.</li>
        <li>
          Keep your password secret. You are responsible for what happens in your account. Tell us at once if you think
          someone else has used it.
        </li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <ul className={list}>
        <li>
          You keep the rights to what you post. You allow ResearchGram to store, copy and show it to the people you
          choose, only to run the service. This permission ends when your account is deleted, except for copies people
          made themselves, such as files they downloaded. To have a single post, comment or message removed before
          then, write to us.
        </li>
        <li>
          Only post what you have the right to share. Many publishers do not allow sharing the published version of a
          paper: check your publishing agreement, and upload it as &ldquo;Request required for full paper&rdquo; where
          needed. Files attached to posts (other than such restricted papers) can be opened by anyone who has their
          web address; see the Privacy Policy.
        </li>
        <li>
          If you believe something on ResearchGram infringes your rights, report it or write to us. We remove it when
          the claim is valid.
        </li>
      </ul>
    ),
  },
  {
    id: "not-allowed",
    title: "What is not allowed",
    body: (
      <ul className={list}>
        <li>Plagiarism, made-up or falsified data, or claiming authorship you do not have.</li>
        <li>Harassment, threats, hate speech, sexual or violent content, or anything illegal.</li>
        <li>Spam, advertising, or messages nobody asked for.</li>
        <li>
          Collecting other members&rsquo; information, including email addresses, by copying, scraping or automated
          tools, or creating accounts automatically.
        </li>
        <li>
          Sharing someone else&rsquo;s unpublished work, or a paper you received through an access request, without
          their permission.
        </li>
        <li>Pretending to be another person or organisation.</li>
        <li>
          Uploading malware, or trying to get around security, access rules or limits. If you find a security problem,
          tell us and do not use it.
        </li>
      </ul>
    ),
  },
  {
    id: "papers",
    title: "Paper access and collaboration",
    body: (
      <p>
        When an author approves your access request, you may read and use the paper for your own research and study.
        Do not pass it on without the author&rsquo;s permission. Collaboration requests, connections and workspaces are
        between members; ResearchGram is not a party to agreements members make with each other.
      </p>
    ),
  },
  {
    id: "moderation",
    title: "Reports and moderation",
    body: (
      <p>
        Use &ldquo;Report post&rdquo; to tell us about content that breaks these Terms. Admins may remove content and
        close accounts that break them. When a post is removed, its author is told why. Admin actions are recorded.
      </p>
    ),
  },
  {
    id: "assistant",
    title: "The research assistant",
    body: (
      <p>
        Its answers are written by an AI model from public information about published papers. They can be wrong or
        incomplete, so check the cited papers before relying on them. Questions go to Google&rsquo;s free AI service,
        which may keep and read them: do not type personal, confidential or unpublished work into the assistant. Journal figures shown with papers are open metrics from OpenAlex, not Clarivate&rsquo;s Journal
        Impact Factor.
      </p>
    ),
  },
  {
    id: "others",
    title: "Other services",
    body: (
      <p>
        Some features use outside services: Google (Gemini, for the research assistant), ORCID, OpenAlex, Semantic
        Scholar, Jitsi Meet and Cloudflare. Their own terms apply when you use them. See the <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2 hover:no-underline">Privacy Policy</Link> for
        what each one receives.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability",
    body: (
      <p>
        ResearchGram is provided free and &ldquo;as is&rdquo;. We work to keep it running and your data safe, but we
        cannot promise it will always be available or free of errors, and features may change. Keep your own copies of
        important work.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <p>
        As far as the law allows, we are not responsible for indirect losses, lost data or lost opportunities caused by
        using ResearchGram. Nothing in these Terms takes away rights you have under the law that cannot be taken away.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Ending your account",
    body: (
      <p>
        You can delete your account at any time: Profile → Delete my account. We may close an account that breaks these
        Terms. If ResearchGram itself closes, we will give notice where we can, so you can download your data first.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        If we change these Terms in a way that matters, we change the date at the top and ask you to accept the new
        version before you continue.
      </p>
    ),
  },
  {
    id: "law",
    title: "Law",
    body: <p>These Terms are governed by the laws of Bangladesh.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these Terms: <ContactLine />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro={
        <p>
          These Terms are the agreement between you and ResearchGram. By creating an account, or by accepting them when
          asked, you agree to them and to the{" "}
          <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2 hover:no-underline">
            Privacy Policy
          </Link>
          .
        </p>
      }
      sections={sections}
      otherPage={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
