/**
 * Seed demo Newsroom posts when empty. Original CodeSpectra copy (not scraped).
 */
import {
  blogPosts,
  estimateReadMinutes,
  newBlogId,
  nowIso,
  type BlogPostDoc,
} from '@/lib/db/blog-posts'

const SEED: Omit<BlogPostDoc, 'id' | 'created_at' | 'updated_at' | 'read_minutes'>[] = [
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
    source_note: 'Editorial synthesis of public industry reporting — rewritten for CodeSpectra readers.',
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
<h2>How we cover this at CodeSpectra</h2>
<p>Our <em>Signals</em> posts rewrite industry news into actionable takeaways for learners and hiring teams — skills to practice, projects to ship, and what to ignore.</p>
<h2>What to do this week</h2>
<ol>
<li>Pick one systems topic (caching, batching, or profiling) and ship a tiny demo.</li>
<li>If you are on the hardware path, map a 90-day roadmap: digital design → RTL basics → ML accelerators reading list.</li>
<li>Follow our Newsroom for the next Signal — we will keep translating headlines into practice.</li>
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
<p>The Newsroom is where we publish long-form updates you can share, bookmark, and find later — including rewritten industry Signals with clear takeaways for developers.</p>
<p>Email campaigns can still go out; when they matter as evergreen content, we publish them here too.</p>
`,
  },
  {
    slug: 'hackathon-build-by-sunset-what-we-learned',
    title: 'Build by Sunset: What We Learned From a High-Velocity Hackathon',
    excerpt:
      'Short timelines force clearer problem framing. Notes from the floor for organizers and participants.',
    category: 'campus',
    tags: ['hackathon', 'community'],
    author_name: 'CodeSpectra Community',
    author_role: 'Campus',
    status: 'published',
    published_at: '2026-08-14T18:00:00.000Z',
    created_by: 'seed',
    cover_image: '',
    body: `
<p>Build by Sunset rewarded teams that scoped ruthlessly: one user, one painful moment, one demo path.</p>
<h2>For participants</h2>
<ul>
<li>Ship a vertical slice before you polish UI.</li>
<li>Write the demo script early — judges only see what you show.</li>
</ul>
<h2>For organizers</h2>
<ul>
<li>Publish judging rubrics before kickoff.</li>
<li>Keep mentor office hours short and rotating.</li>
</ul>
`,
  },
]

export async function ensureBlogSeed(): Promise<void> {
  const col = await blogPosts()
  const count = await col.countDocuments({})
  if (count > 0) return
  const now = nowIso()
  const docs: BlogPostDoc[] = SEED.map((s) => ({
    ...s,
    id: newBlogId(),
    read_minutes: estimateReadMinutes(s.body),
    created_at: s.published_at || now,
    updated_at: now,
    tags: s.tags || [],
  }))
  await col.insertMany(docs)
}
