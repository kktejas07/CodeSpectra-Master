"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { safeRedirect } from "@/lib/safe-redirect";
import { Github } from "@/components/ui/brand-icons";
import { useAuth } from "@/lib/auth-context";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { DeviceShowcase } from "@/components/visuals";
import { cn } from "@/lib/utils";
import {
  AuthShell,
  AuthHeading,
  AsideNote,
  Divider,
  Field,
  FormError,
  GoogleIcon,
  PasswordField,
  PrimaryButton,
  SecondaryButton,
  Select,
} from "@/components/auth/auth-shell";

type UserType = "School Student" | "College Student" | "Fresher" | "Professional" | "";

const USER_TYPES: { value: Exclude<UserType, "">; label: string; desc: string }[] = [
  { value: "School Student", label: "School student", desc: "Learning to code" },
  { value: "College Student", label: "College student", desc: "Preparing for placements" },
  { value: "Fresher", label: "Recent graduate", desc: "Looking for a first job" },
  { value: "Professional", label: "Working professional", desc: "Upskilling or changing roles" },
];

const DOMAINS = ["Engineering", "Management", "Arts & Science", "Medicine", "Law", "Other"];
const ORG_TYPES = ["Engineering College", "University", "Business School", "School", "Company", "Others"];
const MIN_PASSWORD = 8;

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect") || searchParams.get("redirectTo"));
  const refCode = searchParams.get("ref");

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — account
  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");

  // Step 2 — profile (all optional)
  const [userType, setUserType] = useState<UserType>("");
  const [classGrade, setClassGrade] = useState("");
  const [domain, setDomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [currentJobRole, setCurrentJobRole] = useState("");
  const [experience, setExperience] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [organisationType, setOrganisationType] = useState("");
  const [mobile, setMobile] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const { signUpWithEmail, signInWithGoogle, signInWithGithub } = useAuth();

  useEffect(() => {
    if (refCode) localStorage.setItem("referral_code", refCode);
  }, [refCode]);

  async function applyReferral() {
    const code = localStorage.getItem("referral_code");
    if (!code) return;
    try {
      await fetch("/api/referral/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {
      /* best effort */
    }
    localStorage.removeItem("referral_code");
  }

  function continueToProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address, like you@example.com.");
    if (password.length < MIN_PASSWORD) return setError(`Your password needs at least ${MIN_PASSWORD} characters.`);
    setStep(2);
    window.scrollTo({ top: 0 });
  }

  async function createAccount(skipProfile: boolean) {
    setError(null);
    setLoading(true);
    try {
      const extendedData: Record<string, string> = skipProfile
        ? {}
        : {
            mobile,
            userType,
            domain: domain === "Other" ? customDomain : domain,
            experience,
            classGrade,
            graduationYear,
            currentJobRole,
            organisationName,
            organisationType,
          };
      // Forward the assessment invite token so invited bulk candidates skip
      // the IP throttle. It usually rides nested inside ?redirect=/assessment/..?inviteToken=..
      let inviteToken: string | undefined;
      try {
        inviteToken =
          searchParams.get("inviteToken") ||
          new URLSearchParams((searchParams.get("redirect") || "").split("?")[1] || "").get("inviteToken") ||
          undefined;
      } catch {
        inviteToken = searchParams.get("inviteToken") || undefined;
      }
      await signUpWithEmail(
        email.trim().toLowerCase(),
        password,
        name.trim(),
        extendedData,
        turnstileToken || undefined,
        inviteToken ? { inviteToken } : undefined,
      );
      await applyReferral();
      router.push(`/auth/enroll-face?redirect=${encodeURIComponent(redirectTo)}`);
      router.refresh();
    } catch (err: unknown) {
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
      const msg = err instanceof Error ? err.message : "Your account couldn’t be created. Try again.";
      setError(msg);
      // Account-level problems (e.g. email already registered) are fixed on step 1.
      if (/email|password/i.test(msg)) setStep(1);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setError(null);
    setLoading(true);
    try {
      await (provider === "google" ? signInWithGoogle() : signInWithGithub());
      await applyReferral();
      router.push(`/auth/enroll-face?redirect=${encodeURIComponent(redirectTo)}`);
      router.refresh();
    } catch (err: unknown) {
      const label = provider === "google" ? "Google" : "GitHub";
      setError(err instanceof Error ? err.message : `${label} sign-up didn’t complete. Try again, or use your email.`);
    } finally {
      setLoading(false);
    }
  }

  const loginHref = `/auth/login${email || redirectTo !== "/dashboard" ? "?" : ""}${new URLSearchParams({
    ...(email ? { email } : {}),
    ...(redirectTo !== "/dashboard" ? { redirect: redirectTo } : {}),
  }).toString()}`;

  const showDomain = userType === "College Student" || userType === "Fresher" || userType === "Professional";
  const thisYear = new Date().getFullYear();

  return (
    <AuthShell
      aside={
        <div className="space-y-8">
          <DeviceShowcase variant="results" compact className="mx-0 max-w-[520px]" />
          <p className="cs-display max-w-[18ch] text-4xl">Practise, get assessed, get shortlisted.</p>
          <div className="space-y-6">
            <AsideNote title="Invited to an assessment?">
              Create your account with the email address the invite was sent to, so your test is waiting when you
              sign in.
            </AsideNote>
            <AsideNote title="Hiring, or running campus placements?">
              <>
                Accounts here are for individuals.{" "}
                <Link href="/contact" className="font-semibold text-cs-accent-text underline underline-offset-4">
                  Book a pilot
                </Link>{" "}
                and we’ll set up a workspace for your team.
              </>
            </AsideNote>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-sm font-medium text-cs-ink-soft" aria-live="polite">
        Step {step} of 2
      </p>

      {step === 1 ? (
        <>
          <AuthHeading title="Create your account">
            Already have one?{" "}
            <Link href={loginHref} className="font-semibold text-cs-accent-text underline decoration-2 underline-offset-4">
              Sign in
            </Link>
          </AuthHeading>

          {error && <FormError>{error}</FormError>}

          <form onSubmit={continueToProfile} className="space-y-5" noValidate>
            <Field
              id="name"
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />
            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              hint={`At least ${MIN_PASSWORD} characters.`}
            />
            <PrimaryButton type="submit">Continue</PrimaryButton>
          </form>

          <Divider>or sign up with</Divider>

          <div className="grid grid-cols-2 gap-3">
            <SecondaryButton onClick={() => handleOAuth("google")} disabled={loading}>
              <GoogleIcon />
              Google
            </SecondaryButton>
            <SecondaryButton onClick={() => handleOAuth("github")} disabled={loading}>
              <Github className="h-5 w-5" />
              GitHub
            </SecondaryButton>
          </div>

          <p className="mt-10 text-sm text-cs-ink-soft">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="underline hover:text-cs-ink">terms</Link> and{" "}
            <Link href="/privacy" className="underline hover:text-cs-ink">privacy policy</Link>.
          </p>
        </>
      ) : (
        <>
          <AuthHeading title="About you">
            Optional. It helps us suggest the right practice and assessments.
          </AuthHeading>

          {error && <FormError>{error}</FormError>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createAccount(false);
            }}
            className="space-y-7"
          >
            <fieldset>
              <legend className="mb-3 text-[15px] font-medium">Which describes you best?</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {USER_TYPES.map((t) => {
                  const selected = userType === t.value;
                  return (
                    <label
                      key={t.value}
                      className={cn(
                        "relative cursor-pointer rounded-md border bg-cs-sheet px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cs-accent-text",
                        selected ? "border-cs-accent ring-1 ring-cs-accent" : "border-cs-grid hover:border-cs-ink-soft",
                      )}
                    >
                      <input
                        type="radio"
                        name="userType"
                        value={t.value}
                        checked={selected}
                        onChange={() => setUserType(t.value)}
                        className="sr-only"
                      />
                      <span className="block font-semibold">{t.label}</span>
                      <span className="mt-0.5 block text-sm text-cs-ink-soft">{t.desc}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {userType === "School Student" && (
              <div>
                <label htmlFor="grade" className="mb-1.5 block text-[15px] font-medium">Class</label>
                <Select id="grade" value={classGrade} onChange={(e) => setClassGrade(e.target.value)}>
                  <option value="">Select your class</option>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => (
                    <option key={g} value={g}>Class {g}</option>
                  ))}
                </Select>
              </div>
            )}

            {showDomain && (
              <fieldset>
                <legend className="mb-3 text-[15px] font-medium">Field of study or work</legend>
                <div className="flex flex-wrap gap-2">
                  {DOMAINS.map((d) => (
                    <button
                      type="button"
                      key={d}
                      aria-pressed={domain === d}
                      onClick={() => setDomain(d)}
                      className={cn(
                        "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                        domain === d ? "border-cs-ink bg-cs-ink text-cs-paper" : "border-cs-grid bg-cs-sheet hover:border-cs-ink-soft",
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {domain === "Other" && (
                  <div className="mt-3">
                    <Field id="customDomain" label="Your field" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} />
                  </div>
                )}
              </fieldset>
            )}

            {(userType === "College Student" || userType === "Fresher") && (
              <div>
                <label htmlFor="gradYear" className="mb-1.5 block text-[15px] font-medium">Graduation year</label>
                <Select id="gradYear" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)}>
                  <option value="">Select a year</option>
                  {Array.from({ length: 10 }, (_, i) => thisYear - 3 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              </div>
            )}

            {userType === "Professional" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="role" label="Current role" placeholder="e.g. Design engineer" value={currentJobRole} onChange={(e) => setCurrentJobRole(e.target.value)} autoComplete="organization-title" />
                <div>
                  <label htmlFor="experience" className="mb-1.5 block text-[15px] font-medium">Experience</label>
                  <Select id="experience" value={experience} onChange={(e) => setExperience(e.target.value)}>
                    <option value="">Select</option>
                    {["0-1 years", "1-3 years", "3-5 years", "5-10 years", "10+ years"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            {showDomain && (
              <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
                <Field
                  id="org"
                  label={userType === "Professional" ? "Company" : "College or university"}
                  value={organisationName}
                  onChange={(e) => setOrganisationName(e.target.value)}
                  autoComplete="organization"
                />
                <div>
                  <label htmlFor="orgType" className="mb-1.5 block text-[15px] font-medium">Type</label>
                  <Select id="orgType" value={organisationType} onChange={(e) => setOrganisationType(e.target.value)}>
                    <option value="">Select</option>
                    {ORG_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            <Field
              id="mobile"
              label="Mobile number"
              optional
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
            />

            <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} resetKey={turnstileResetKey} />

            <div className="space-y-3">
              <PrimaryButton type="submit" loading={loading}>
                Create account
              </PrimaryButton>
              <SecondaryButton onClick={() => createAccount(true)} disabled={loading}>
                Skip and create account
              </SecondaryButton>
            </div>
          </form>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(1);
            }}
            className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-cs-accent-text hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to account details
          </button>
        </>
      )}
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
