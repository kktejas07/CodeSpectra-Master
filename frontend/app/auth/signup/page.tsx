"use client";
import { csrfFetch } from '@/lib/csrf-fetch'

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { safeRedirect } from "@/lib/safe-redirect";
import { inAppPricingHref, isValidPlanId, parseInterval } from "@/lib/billing-plan-mode";
import { Github } from "@/components/ui/brand-icons";
import { useAuth } from "@/lib/auth-context";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { DeviceShowcase } from "@/components/visuals";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/catalog";
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

// Stored values stay English (profile data); only the labels are translated.
const USER_TYPES: { value: Exclude<UserType, "">; label: MessageKey; desc: MessageKey }[] = [
  { value: "School Student", label: "auth.typeSchool", desc: "auth.typeSchoolDesc" },
  { value: "College Student", label: "auth.typeCollege", desc: "auth.typeCollegeDesc" },
  { value: "Fresher", label: "auth.typeFresher", desc: "auth.typeFresherDesc" },
  { value: "Professional", label: "auth.typeProfessional", desc: "auth.typeProfessionalDesc" },
];

const DOMAINS: { value: string; label: MessageKey }[] = [
  { value: "Engineering", label: "auth.domainEngineering" },
  { value: "Management", label: "auth.domainManagement" },
  { value: "Arts & Science", label: "auth.domainArtsScience" },
  { value: "Medicine", label: "auth.domainMedicine" },
  { value: "Law", label: "auth.domainLaw" },
  { value: "Other", label: "auth.domainOther" },
];
const ORG_TYPES: { value: string; label: MessageKey }[] = [
  { value: "Engineering College", label: "auth.orgEngineeringCollege" },
  { value: "University", label: "auth.orgUniversity" },
  { value: "Business School", label: "auth.orgBusinessSchool" },
  { value: "School", label: "auth.orgSchool" },
  { value: "Company", label: "auth.orgCompany" },
  { value: "Others", label: "auth.orgOthers" },
];
const EXPERIENCE: { value: string; label: MessageKey }[] = [
  { value: "0-1 years", label: "auth.exp01" },
  { value: "1-3 years", label: "auth.exp13" },
  { value: "3-5 years", label: "auth.exp35" },
  { value: "5-10 years", label: "auth.exp510" },
  { value: "10+ years", label: "auth.exp10plus" },
];
const MIN_PASSWORD = 8;

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A plan picked on the public pricing page (?plan=pro&interval=year) lands on
  // the in-app pricing page with that plan preselected after signup.
  const pickedPlan = searchParams.get("plan");
  const redirectTo = safeRedirect(
    searchParams.get("redirect") ||
      searchParams.get("redirectTo") ||
      (isValidPlanId(pickedPlan) ? inAppPricingHref(pickedPlan, parseInterval(searchParams.get("interval"))) : null),
  );
  const refCode = searchParams.get("ref");
  const { t, rich } = useT();

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
      await csrfFetch("/api/referral/apply", {
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
    if (!name.trim()) return setError(t("auth.enterFullName"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t("auth.enterValidEmail"));
    if (password.length < MIN_PASSWORD) return setError(t("auth.passwordTooShort", { min: MIN_PASSWORD }));
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
      // The referral code rides with the sign-up so it survives email verification (CORE-005).
      const storedRef = (() => { try { return localStorage.getItem("referral_code") } catch { return null } })();
      if (storedRef) extendedData.referral_code = storedRef;
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
      if ((err as { code?: string } | null)?.code === "verification_required") {
        try { localStorage.removeItem("referral_code") } catch { /* recorded server-side */ }
        router.push(`/auth/login?${new URLSearchParams({ verify_sent: "1", email: email.trim().toLowerCase() }).toString()}`);
        return;
      }
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
      const msg = err instanceof Error ? err.message : t("auth.createFailed");
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
      setError(err instanceof Error ? err.message : t("auth.oauthSignupIncomplete", { provider: label }));
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
          <p className="cs-display max-w-[18ch] text-4xl">{t("auth.signupAsideHeadline")}</p>
          <div className="space-y-6">
            <AsideNote title={t("auth.asideInvitedTitle")}>
              {t("auth.asideInvitedBody")}
            </AsideNote>
            <AsideNote title={t("auth.asideHiringTitle")}>
              {rich("auth.asideHiringBody", {
                pilot: (
                  <Link href="/contact" className="font-semibold text-cs-accent-text underline underline-offset-4">
                    {t("auth.bookPilot")}
                  </Link>
                ),
              })}
            </AsideNote>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-sm font-medium text-cs-ink-soft" aria-live="polite">
        {t("auth.stepOf", { step, total: 2 })}
      </p>

      {step === 1 ? (
        <>
          <AuthHeading title={t("auth.createYourAccount")}>
            {t("auth.alreadyHaveOne")}{" "}
            <Link href={loginHref} className="font-semibold text-cs-accent-text underline decoration-2 underline-offset-4">
              {t("auth.signIn")}
            </Link>
          </AuthHeading>

          {error && <FormError>{error}</FormError>}

          <form onSubmit={continueToProfile} className="space-y-5" noValidate>
            <Field
              id="name"
              label={t("auth.fullName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />
            <Field
              id="email"
              label={t("auth.email")}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <PasswordField
              id="password"
              label={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              hint={t("auth.passwordHint", { min: MIN_PASSWORD })}
            />
            <PrimaryButton type="submit">{t("common.continue")}</PrimaryButton>
          </form>

          <Divider>{t("auth.orSignUpWith")}</Divider>

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
            {rich("auth.agreeSignUp", {
              terms: <Link href="/terms" className="underline hover:text-cs-ink">{t("auth.terms")}</Link>,
              privacy: <Link href="/privacy" className="underline hover:text-cs-ink">{t("auth.privacyPolicy")}</Link>,
            })}
          </p>
        </>
      ) : (
        <>
          <AuthHeading title={t("auth.aboutYou")}>
            {t("auth.aboutYouHint")}
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
              <legend className="mb-3 text-[15px] font-medium">{t("auth.whichDescribesYou")}</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {USER_TYPES.map((ut) => {
                  const selected = userType === ut.value;
                  return (
                    <label
                      key={ut.value}
                      className={cn(
                        "relative cursor-pointer rounded-md border bg-cs-sheet px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cs-accent-text",
                        selected ? "border-cs-accent ring-1 ring-cs-accent" : "border-cs-grid hover:border-cs-ink-soft",
                      )}
                    >
                      <input
                        type="radio"
                        name="userType"
                        value={ut.value}
                        checked={selected}
                        onChange={() => setUserType(ut.value)}
                        className="sr-only"
                      />
                      <span className="block font-semibold">{t(ut.label)}</span>
                      <span className="mt-0.5 block text-sm text-cs-ink-soft">{t(ut.desc)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {userType === "School Student" && (
              <div>
                <label htmlFor="grade" className="mb-1.5 block text-[15px] font-medium">{t("auth.classLabel")}</label>
                <Select id="grade" value={classGrade} onChange={(e) => setClassGrade(e.target.value)}>
                  <option value="">{t("auth.selectClass")}</option>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => (
                    <option key={g} value={g}>{t("auth.classN", { n: g })}</option>
                  ))}
                </Select>
              </div>
            )}

            {showDomain && (
              <fieldset>
                <legend className="mb-3 text-[15px] font-medium">{t("auth.fieldOfStudy")}</legend>
                <div className="flex flex-wrap gap-2">
                  {DOMAINS.map(({ value: d, label }) => (
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
                      {t(label)}
                    </button>
                  ))}
                </div>
                {domain === "Other" && (
                  <div className="mt-3">
                    <Field id="customDomain" label={t("auth.yourField")} value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} />
                  </div>
                )}
              </fieldset>
            )}

            {(userType === "College Student" || userType === "Fresher") && (
              <div>
                <label htmlFor="gradYear" className="mb-1.5 block text-[15px] font-medium">{t("auth.graduationYear")}</label>
                <Select id="gradYear" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)}>
                  <option value="">{t("auth.selectYear")}</option>
                  {Array.from({ length: 10 }, (_, i) => thisYear - 3 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              </div>
            )}

            {userType === "Professional" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="role" label={t("auth.currentRole")} placeholder={t("auth.currentRolePlaceholder")} value={currentJobRole} onChange={(e) => setCurrentJobRole(e.target.value)} autoComplete="organization-title" />
                <div>
                  <label htmlFor="experience" className="mb-1.5 block text-[15px] font-medium">{t("auth.experience")}</label>
                  <Select id="experience" value={experience} onChange={(e) => setExperience(e.target.value)}>
                    <option value="">{t("common.select")}</option>
                    {EXPERIENCE.map((x) => (
                      <option key={x.value} value={x.value}>{t(x.label)}</option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            {showDomain && (
              <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
                <Field
                  id="org"
                  label={userType === "Professional" ? t("auth.company") : t("auth.collegeOrUniversity")}
                  value={organisationName}
                  onChange={(e) => setOrganisationName(e.target.value)}
                  autoComplete="organization"
                />
                <div>
                  <label htmlFor="orgType" className="mb-1.5 block text-[15px] font-medium">{t("auth.orgTypeLabel")}</label>
                  <Select id="orgType" value={organisationType} onChange={(e) => setOrganisationType(e.target.value)}>
                    <option value="">{t("common.select")}</option>
                    {ORG_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{t(o.label)}</option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            <Field
              id="mobile"
              label={t("auth.mobileNumber")}
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
                {t("auth.createAccountButton")}
              </PrimaryButton>
              <SecondaryButton onClick={() => createAccount(true)} disabled={loading}>
                {t("auth.skipAndCreate")}
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
            {t("auth.backToAccountDetails")}
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
