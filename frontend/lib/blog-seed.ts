/**
 * Seed / enrich Newsroom posts. Original CodeSpectra copy.
 * Sister platforms (same org): Student Alumni, WeHive — linked, not scraped.
 */
import {
  blogPosts,
  estimateReadMinutes,
  newBlogId,
  nowIso,
  type BlogPostDoc,
} from '@/lib/db/blog-posts'
import { coverForPost } from '@/lib/blog-covers'

type SeedPost = Omit<BlogPostDoc, 'id' | 'created_at' | 'updated_at' | 'read_minutes'>

const SEED: SeedPost[] = [
  {
    slug: 'why-custom-ai-silicon-matters-for-builders',
    title: 'Why Custom AI Silicon Matters for Builders (Not Just Chip Vendors)',
    excerpt:
      'Model labs are hiring chip teams. Here is what that shift means if you write software, ship products, or are choosing what to learn next.',
    category: 'signals',
    tags: ['ai', 'hardware', 'careers'],
    author_name: 'CodeSpectra Editorial',
    author_role: 'Signals',
    status: 'published',
    published_at: '2026-08-14T10:00:00.000Z',
    created_by: 'seed',
    cover_image: '',
    body: `
<h2>The short version</h2>
<p>AI companies are no longer only buying GPUs. Some are designing silicon tuned to their models. That changes cost curves, latency, and which skills stay scarce.</p>
<h2>What changed</h2>
<p>For years the default career story was: learn Python, ship models, call cloud GPUs. That still works — but the bottleneck is shifting toward efficient inference and specialized hardware.</p>
<ul>
<li><strong>Software builders</strong> — expect more “know your FLOPs / batching / quantization” conversations in interviews.</li>
<li><strong>ECE / VLSI students</strong> — AI accelerators are a direct path into frontier labs and GCCs.</li>
<li><strong>Product teams</strong> — latency and cost per token become roadmap constraints, not infra trivia.</li>
</ul>
<h2>What to do this week</h2>
<ol>
<li>Pick one systems topic (caching, batching, or profiling) and ship a tiny demo.</li>
<li>If you are on the hardware path, map a 90-day roadmap: digital design → RTL basics → ML accelerators reading list.</li>
<li>Follow the Newsroom for the next Signal — we keep translating industry shifts into practice.</li>
</ol>
`,
  },
  {
    slug: 'introducing-codespectra-newsroom',
    title: 'Introducing the CodeSpectra Newsroom',
    excerpt:
      'A home for product updates, engineering notes, and career Signals — separate from email, searchable forever.',
    category: 'product',
    tags: ['product', 'newsroom'],
    author_name: 'CodeSpectra Team',
    author_role: 'Product',
    status: 'published',
    published_at: '2026-08-20T12:00:00.000Z',
    created_by: 'seed',
    cover_image: '',
    body: `
<p>Newsletters are great for push. Blogs are great for permanence.</p>
<p>The Newsroom is where we publish long-form updates you can share, bookmark, and find later — including career Signals with clear takeaways for developers.</p>
<p>Email campaigns can still go out; when they matter as evergreen content, we publish them here too.</p>
`,
  },
  {
    slug: 'hackathon-build-by-sunset-what-we-learned',
    title: 'Build by Sunset: What We Learned From a High-Velocity Hackathon',
    excerpt:
      '383+ students, 80+ projects, and hires out of a single campus sprint — notes for organizers and participants.',
    category: 'campus',
    tags: ['hackathon', 'community', 'student-alumni', 'wehive'],
    author_name: 'CodeSpectra Community',
    author_role: 'Campus',
    status: 'published',
    published_at: '2026-08-14T18:00:00.000Z',
    created_by: 'seed',
    cover_image: '',
    source_urls: [
      'https://studentalumni.ai/build-by-sunset',
      'https://studentalumni.ai/echo',
      'https://wehive.co.in/',
    ],
    body: `
<p><strong>Build by Sunset</strong> (Student Alumni × VNR VJIET) was a high-velocity campus hackathon in our sister ecosystem. The numbers that stuck: <strong>383+ students</strong>, <strong>80+ projects</strong>, and students hired from the floor.</p>
<p>We cover it here because CodeSpectra, <a href="https://studentalumni.ai/echo" rel="noopener noreferrer" target="_blank">Student Alumni Echo</a>, and <a href="https://wehive.co.in/" rel="noopener noreferrer" target="_blank">WeHive</a> share the same mission: get builders from campus to career with real practice, not slide decks.</p>
<h2>For participants</h2>
<ul>
<li>Ship a vertical slice before you polish UI.</li>
<li>Write the demo script early — judges only see what you show.</li>
<li>Treat mentors as unblockers, not co-authors.</li>
</ul>
<h2>For organizers</h2>
<ul>
<li>Publish judging rubrics before kickoff.</li>
<li>Keep mentor office hours short and rotating.</li>
<li>Capture outcomes (projects, hires, follow-ups) the same week — that is how Echo and WeHive stay useful after the event.</li>
</ul>
<h2>Keep going</h2>
<p>Recap and next steps live on <a href="https://studentalumni.ai/build-by-sunset" rel="noopener noreferrer" target="_blank">studentalumni.ai/build-by-sunset</a>. Community and opportunities continue on <a href="https://wehive.co.in/" rel="noopener noreferrer" target="_blank">wehive.co.in</a>.</p>
`,
  },
]

function withCover(doc: BlogPostDoc): BlogPostDoc {
  return {
    ...doc,
    cover_image: coverForPost({
      title: doc.title,
      category: doc.category,
      cover_image: doc.cover_image,
    }),
  }
}

function isGenericDisclaimer(note?: string | null): boolean {
  return !!note && /editorial synthesis|rewritten for codespectra/i.test(note)
}

/** Insert seeds if empty; otherwise backfill covers and campus copy for known slugs. */
export async function ensureBlogSeed(): Promise<void> {
  const col = await blogPosts()
  const count = await col.countDocuments({})
  const now = nowIso()

  if (count === 0) {
    const docs: BlogPostDoc[] = SEED.map((s) =>
      withCover({
        ...s,
        id: newBlogId(),
        read_minutes: estimateReadMinutes(s.body),
        created_at: s.published_at || now,
        updated_at: now,
        tags: s.tags || [],
      }),
    )
    await col.insertMany(docs)
    return
  }

  for (const s of SEED) {
    const existing = await col.findOne({ slug: s.slug })
    if (!existing) continue

    const $set: Partial<BlogPostDoc> = { updated_at: now }
    const $unset: Record<string, ''> = {}

    if (!existing.cover_image) {
      $set.cover_image = coverForPost({
        title: existing.title || s.title,
        category: existing.category || s.category,
      })
    }

    if (isGenericDisclaimer(existing.source_note) && !(existing.source_urls?.length)) {
      $unset.source_note = ''
    }

    if (s.slug === 'hackathon-build-by-sunset-what-we-learned') {
      if (!existing.source_urls?.length) $set.source_urls = s.source_urls
      if ((existing.body || '').length < 600) {
        $set.body = s.body
        $set.excerpt = s.excerpt
        $set.read_minutes = estimateReadMinutes(s.body)
        $set.title = s.title
      }
    }

    const ops: Record<string, unknown> = {}
    if (Object.keys($set).length > 1) ops.$set = $set
    if (Object.keys($unset).length) ops.$unset = $unset
    if (Object.keys(ops).length) {
      await col.updateOne({ id: existing.id }, ops)
    }
  }

  const bare = await col
    .find({
      status: 'published',
      $or: [{ cover_image: '' }, { cover_image: { $exists: false } }],
    })
    .toArray()

  for (const p of bare) {
    await col.updateOne(
      { id: p.id },
      {
        $set: {
          cover_image: coverForPost({ title: p.title, category: p.category }),
          updated_at: now,
        },
      },
    )
  }
}
