import { notFound } from 'next/navigation'
import { emailCampaigns } from '@/lib/db/email-campaigns'
import Link from 'next/link'
import DOMPurify from 'isomorphic-dompurify'

export const dynamic = 'force-dynamic'

export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const col = await emailCampaigns()
  const campaign = await col.findOne({ id })

  if (!campaign || campaign.status === 'draft') {
    notFound()
  }

  const safeBody = DOMPurify.sanitize(campaign.body || '')
  
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide">
              CODESPECTRA
            </span>
          </Link>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          {campaign.hero_image && (
            <div className="w-full relative h-64 sm:h-80 lg:h-96">
              <img 
                src={campaign.hero_image} 
                alt="Campaign Hero Image" 
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          <div className="p-6 sm:p-10">
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              {campaign.subject}
            </h1>
            
            {campaign.intro && (
              <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                {campaign.intro}
              </p>
            )}

            {safeBody && (
              <div 
                className="prose prose-zinc dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: safeBody }}
              />
            )}

            {campaign.cta_text && campaign.cta_url && (
              <div className="mt-10">
                <a 
                  href={campaign.cta_url}
                  className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 transition-colors"
                >
                  {campaign.cta_text}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
