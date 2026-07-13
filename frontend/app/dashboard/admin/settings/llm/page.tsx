import { redirect } from 'next/navigation'

export default function LlmRedirect() {
  redirect('/dashboard/admin/llm-settings')
}
