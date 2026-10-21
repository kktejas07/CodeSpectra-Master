/**
 * /dashboard/quizzes — retired. Company tests (/dashboard/company-tests and
 * the practice blocks on /companies/<slug>) replace the quizzes catalogue;
 * old links and bookmarks land there.
 */
import { permanentRedirect } from 'next/navigation'

export default function QuizzesRedirect(): never {
  permanentRedirect('/dashboard/company-tests')
}
