import { redirect } from 'next/navigation'

/**
 * Legacy "dynamic interview" flow (setup → dynamic → results) — retired
 * (audit CORE-017): it kept feedback only in the browser and its results page
 * promised a notification that never came. AI mock interviews replace it and
 * save every report (/dashboard/interviews lists them).
 */
export default function LegacyInterviewRedirect() {
  redirect('/dashboard/interviews/ai-mock/setup')
}
