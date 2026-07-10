import { redirect } from 'next/navigation'

export default function LlmRedirect() {
  redirect('/dashboard/admin/settings?section=llm')
}
