import type { Metadata } from "next";
import LegalDocument, { ContactLine, type LegalSection } from "@/components/legal/LegalDocument";
import { MINIMUM_AGE, OPERATOR_DETAILS, OPERATOR_NAME } from "@/lib/legal";

// Public and indexable: people read it before they sign up.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What ResearchGram collects, why, who can see it, where it is stored, and your choices.",
};

const list = "list-disc space-y-1.5 pl-5";

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who runs ResearchGram",
    body: (
      <p>
        ResearchGram is a free, non-commercial project run by {OPERATOR_NAME}, {OPERATOR_DETAILS} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). We decide how your data is used and are responsible for it. You can reach us at <ContactLine />.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <ul className={list}>
          <li>
            <strong>Account:</strong> your email address and password. The password is kept by our sign-in provider
            (Supabase) only as a one-way hash; nobody can read it.
          </li>
          <li>
            <strong>Profile:</strong> what you add, such as your name, photo and cover image, department, role, academic
            level, batch and session, position, institution, skills, interests, research area, expertise, bio, links
            (ORCID, Google Scholar, ResearchGate, website) and whether you offer mentorship. If you verify your ORCID
            iD, we store the iD and your research numbers (publications, citations, h-index) from OpenAlex.
          </li>
          <li>
            <strong>What you share and do:</strong> posts, papers and other files, comments, saved and hidden posts,
            reports, requests (collaboration, connection, paper access), connections, workspace content (tasks,
            milestones, updates, files, meetings, recordings) and messages, with their attachments and voice messages.
          </li>
          <li>
            <strong>Search activity:</strong> the searches you make and the profiles you open, used for suggestions.
          </li>
          <li>
            <strong>Consent:</strong> which version of the Terms and this policy you accepted, and when, and that you
            confirmed you are {MINIMUM_AGE} or older.
          </li>
          <li>
            <strong>Technical data:</strong> sign-in cookies; the IP address and browser of each sign-in, kept by our
            sign-in system; error reports (the error message and technical details, the page address without the part
            after &ldquo;?&rdquo;, your browser&rsquo;s user-agent text and whether someone was signed in, but no account;
            email addresses and ids in them are blanked out); and server logs our hosting providers keep, which include
            IP addresses.
          </li>
        </ul>
        <p>We do not use advertising or analytics trackers.</p>
      </>
    ),
  },
  {
    id: "why",
    title: "Why we use it",
    body: (
      <>
        <ul className={list}>
          <li>To run ResearchGram: your account, your profile and posts for the people you choose, messages, notifications and workspaces.</li>
          <li>To suggest researchers and collaborators, from your profile, your posts and your recent searches.</li>
          <li>To keep ResearchGram safe: the bot check at sign-up and login, limits on repeated actions, reports and moderation, and a record of admin actions.</li>
          <li>To find and fix errors.</li>
        </ul>
        <p>
          We rely on your consent, which you give when you create your account and can withdraw by deleting it. We never
          sell your data and never use it for advertising.
        </p>
      </>
    ),
  },
  {
    id: "who-sees",
    title: "Who can see your data",
    body: (
      <ul className={list}>
        <li>
          <strong>Signed-in members</strong> can see your profile, including your email address, and your posts except
          private ones. For a post set to &ldquo;abstract only&rdquo;, they see its title, abstract and attached files,
          but not its full text, which only you and the people whose access request you approve can read. A full paper
          you upload as &ldquo;Request required for full paper&rdquo; or &ldquo;Private full paper&rdquo; can be opened
          only by you and, when a request is required, by the people whose request you approve. Private posts are
          visible only to you.
        </li>
        <li>
          <strong>Anyone with the link:</strong> profile photos, cover images and the files attached to posts (except
          the restricted full papers above) are stored at web addresses that anyone who has the address can open, even
          without an account and even for a private post. The addresses are long and hard to guess, but once shared
          they are not secret. Pictures you replace stay stored until you delete your account.
        </li>
        <li>
          <strong>Chats and workspaces:</strong> messages and files in a chat are visible to the people in that chat;
          workspace content to the workspace members.
        </li>
        <li>
          <strong>Admins</strong> see reported posts, the record of admin actions and the error reports in the admin
          console, which does not show messages. To review reports, admins can open the files of any post, restricted
          papers included. The operator can also reach the database to run and repair ResearchGram, and only does so
          when needed.
        </li>
        <li><strong>Service providers</strong> that run parts of ResearchGram for us (next section).</li>
        <li><strong>Authorities</strong>, when the law requires it.</li>
      </ul>
    ),
  },
  {
    id: "providers",
    title: "Service providers and where data is stored",
    body: (
      <>
        <p>
          Our database, sign-in and file storage are at <strong>Supabase</strong>, on servers in Mumbai, India. The
          website runs on <strong>Vercel</strong>, with its server code in Mumbai and pages delivered from servers around
          the world. Other services get only what they need:
        </p>
        <ul className={list}>
          <li><strong>Cloudflare Turnstile:</strong> the bot check on sign-up, login and password reset. It receives information about your browser and device.</li>
          <li>
            <strong>Google (Gemini):</strong> when you use the research assistant, your question and public information
            about matching papers are sent to Google&rsquo;s AI model to write the answer. We use Google&rsquo;s free
            service, so Google may keep questions and answers, use them to improve its products, and people at Google
            may read them. Do not type personal or confidential information into the assistant.
          </li>
          <li>
            <strong>OpenAlex:</strong> search words from the research assistant and Discover, and your verified ORCID
            iD when you update your research numbers. <strong>Semantic Scholar:</strong> the identifiers (DOIs) of the
            papers found.
          </li>
          <li><strong>ORCID:</strong> when you choose &ldquo;Verify with ORCID&rdquo;, you sign in on orcid.org and ORCID tells us your iD.</li>
          <li><strong>Jitsi Meet (meet.jit.si):</strong> video meetings in workspaces. When you join one, your audio and video pass through Jitsi&rsquo;s servers.</li>
        </ul>
        <p>
          Some of these providers are outside Bangladesh, in India, the United States and other countries. Until 31
          October 2026, a copy of the data made before ResearchGram moved to Mumbai is also kept at Supabase in Sydney,
          Australia; it is then deleted.
        </p>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep data",
    body: (
      <ul className={list}>
        <li>
          <strong>Your account and content:</strong> until you delete your account. Posts, comments and messages cannot
          yet be deleted one by one; write to us and we will remove one for you.
        </li>
        <li>
          <strong>When you delete your account,</strong> your profile, posts, comments, the messages you sent, your
          chats, workspaces you own, requests and connections are deleted at once, and your files are removed from
          storage. Where you were listed as a co-author on someone else&rsquo;s post, your name stays there without a
          link to your account; so do tasks and milestones you created in other people&rsquo;s workspaces. Copies in our
          backups are gone within about 30 days.
        </li>
        <li>
          <strong>When someone else deletes their account,</strong> your chats with them are deleted too; files you
          sent in them are removed from storage within about a month.
        </li>
        <li>
          <strong>Record of actions</strong> (account deletions, data downloads, ORCID verifications, paper-access
          decisions and admin actions, with the account ids involved): kept for up to two years, to look into abuse.
        </li>
        <li><strong>Error reports:</strong> deleted 30 days after the error was last seen.</li>
        <li><strong>Logs at our providers:</strong> for the time those providers keep them.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: (
      <>
        <ul className={list}>
          <li>
            <strong>See and copy your data:</strong> Profile → Download my data gives you your account details and what
            you added or did here, in one file, with a list of your stored files. Write to us for anything else.
          </li>
          <li><strong>Correct it:</strong> edit your profile at any time.</li>
          <li>
            <strong>Delete it:</strong> Profile → Delete my account. This cannot be undone. To have a single post,
            comment or message removed, write to us.
          </li>
          <li><strong>Withdraw your consent:</strong> deleting your account withdraws it. You can also write to us.</li>
          <li>
            <strong>Ask or complain:</strong> write to <ContactLine />. You can also complain to the data protection
            authority set up under Bangladesh&rsquo;s Personal Data Protection Act, 2026.
          </li>
        </ul>
        <p>We aim to answer within 30 days.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and browser storage",
    body: (
      <p>
        We use only what ResearchGram needs to work: cookies that keep you signed in, and browser storage that keeps
        your current research assistant conversation (until you close the tab) and remembers an ORCID sign-in in
        progress. Cloudflare&rsquo;s bot check may store information in your browser to tell people from bots, Vercel&rsquo;s
        firewall may set a cookie after a security check, and the Jitsi meeting window keeps its own settings in your
        browser. There are no advertising or tracking cookies.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Connections are encrypted (HTTPS). Rules in the database decide who may read each row. Restricted papers, chat
        files and workspace files are kept in private storage and opened through short-lived links; other pictures
        and post files are public at their web addresses, as described above. Passwords are hashed, and secret keys
        for outside services never reach your browser. No system is perfectly
        secure: if a breach affects your data, we will tell you, and the authorities where the law requires it.
      </p>
    ),
  },
  {
    id: "age",
    title: "Age",
    body: (
      <p>
        ResearchGram is for people aged {MINIMUM_AGE} or older. If we learn that someone under {MINIMUM_AGE} has an
        account, we delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change this policy in a way that matters, we change the date at the top and ask you to accept the new
        version the next time you use ResearchGram.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about your data or this policy: <ContactLine />.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro={
        <p>
          ResearchGram is an academic network where researchers share their work, find collaborators and talk to each
          other. This policy explains what we collect, why, who can see it, and the choices you have.
        </p>
      }
      sections={sections}
      otherPage={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
