/**
 * Golden questions for the knowledge layer: what an admin would actually ask
 * the copilot, worded differently from the source titles, with the sources
 * that should come back.
 *
 *  - `fixture: 'real'`      content that ships with the product (seed problems,
 *                           docs/, FAQ, legal pages, admin help). Used offline AND
 *                           by the live evaluation when those sources are indexed.
 *  - `fixture: 'synthetic'` the two eval organisations in ./fixtures.ts (offline only).
 *  - `expect`               relevant sources (`type:source_id`). Success = any of them,
 *                           or all of them when `all` is set (multi-hop).
 *  - `forbid`               sources this caller must never see (ACL). An empty
 *                           `expect` makes it a pure ACL negative.
 */
import type { KnowledgeSourceType } from '@/lib/agent/contract'

export type EvalAs = 'superadmin' | 'tenant_a' | 'tenant_b'
export type EvalKind = 'paraphrase' | 'keyword' | 'multi_hop' | 'acl_negative'

export interface GoldenQuestion {
  id: string
  query: string
  as: EvalAs
  kind: EvalKind
  type: KnowledgeSourceType
  fixture: 'real' | 'synthetic'
  expect: string[]
  all?: boolean
  forbid?: string[]
  /** Search only these types, as the agent's search_knowledge tool would (dev_doc is never searched by default). */
  types?: KnowledgeSourceType[]
}

const P = (id: string) => `problem:${id}`
const D = (section: 'public' | 'user', slug: string) => `doc:docs:${section}/${slug}`
const PAGE = (id: string) => `doc:page:${id}`
const DEV = (pathNoExt: string) => `dev_doc:docs:int/${pathNoExt}`

type Q = Omit<GoldenQuestion, 'fixture' | 'as' | 'kind'> & Partial<Pick<GoldenQuestion, 'as' | 'kind'>>
const real = (q: Q): GoldenQuestion => ({ as: 'superadmin', kind: 'paraphrase', ...q, fixture: 'real' })
const synth = (q: Q): GoldenQuestion => ({ as: 'superadmin', kind: 'paraphrase', ...q, fixture: 'synthetic' })

export const GOLDEN_QUESTIONS: GoldenQuestion[] = [
  // ── Problems (seed + bulk seed) ──────────────────────────────────────────
  real({ id: 'pr-01', type: 'problem', query: 'find the positions of two numbers in a list that add up to a given value', expect: [P('p_two_sum')] }),
  real({ id: 'pr-02', type: 'problem', query: 'print Fizz for multiples of three and Buzz for multiples of five', expect: [P('p_fizzbuzz')] }),
  real({ id: 'pr-03', type: 'problem', query: 'check if a word reads the same backwards', expect: [P('p_palindrome'), P('p_valid_palindrome')] }),
  real({ id: 'pr-04', type: 'problem', query: 'how many different ways can you get to the top going up one or two steps at a time', expect: [P('p_climbing_stairs')] }),
  real({ id: 'pr-05', type: 'problem', query: 'biggest total of a contiguous slice of an integer array', expect: [P('p_max_subarray')] }),
  real({ id: 'pr-06', type: 'problem', query: 'best profit from buying a stock on one day and selling it on a later day', expect: [P('p_best_time_to_buy_sell')] }),
  real({ id: 'pr-07', type: 'problem', query: 'fewest coins needed to make up an amount of money', expect: [P('p_coin_change')] }),
  real({ id: 'pr-08', type: 'problem', query: 'count separate pieces of land surrounded by water in a 2D map', expect: [P('p_number_of_islands')] }),
  real({ id: 'pr-09', type: 'problem', query: 'can a student finish every class given prerequisite pairs, detect a cycle', expect: [P('p_course_schedule')] }),
  real({ id: 'pr-10', type: 'problem', query: 'combine ranges that overlap into one', expect: [P('p_merge_intervals')] }),
  real({ id: 'pr-11', type: 'problem', query: 'design a fixed-capacity cache that throws out the item used longest ago', expect: [P('p_lru_cache')] }),
  real({ id: 'pr-12', type: 'problem', query: 'how much rain gets held between bars of different heights', expect: [P('p_trapping_rain_water')] }),
  real({ id: 'pr-13', type: 'problem', query: 'shortest piece of one string containing all letters of another', expect: [P('p_minimum_window_substring')] }),
  real({ id: 'pr-14', type: 'problem', query: 'minutes until all fresh fruit in a grid goes bad', expect: [P('p_rotting_oranges')] }),
  real({ id: 'pr-15', type: 'problem', query: 'verify a tree keeps smaller keys on the left and larger keys on the right', expect: [P('p_validate_bst')] }),
  real({ id: 'pr-16', type: 'problem', query: 'make a deep copy of an undirected graph with neighbor lists', expect: [P('p_clone_graph')] }),
  real({ id: 'pr-17', type: 'problem', query: 'how many prime numbers are smaller than n', expect: [P('p_count_primes')] }),
  real({ id: 'pr-18', type: 'problem', query: 'push every 0 to the end of the array without changing the order of other values', expect: [P('p_move_zeroes')] }),
  real({ id: 'pr-19', type: 'problem', query: 'does a singly linked list loop back on itself', expect: [P('p_linked_list_cycle')] }),
  real({ id: 'pr-20', type: 'problem', query: 'keep track of the middle value as numbers stream in', expect: [P('p_median_finder')] }),
  real({ id: 'pr-21', type: 'problem', query: 'maximum money taken from a row of homes when neighbours cannot both be hit', expect: [P('p_house_robber')] }),
  real({ id: 'pr-22', type: 'problem', query: 'number of ways to turn a string of digits back into letters A to Z', expect: [P('p_decode_ways')] }),
  real({ id: 'pr-23', type: 'problem', kind: 'keyword', query: 'Kth Largest Element in an Array', expect: [P('p_kth_largest_element')] }),
  real({ id: 'pr-24', type: 'problem', kind: 'keyword', query: 'Serialize and Deserialize Binary Tree', expect: [P('p_serialize_deserialize_binary_tree')] }),
  real({ id: 'pr-25', type: 'problem', kind: 'multi_hop', all: true, query: 'hash map problems for a screening: pair sum to target and grouping anagrams', expect: [P('p_two_sum'), P('p_group_anagrams')] }),

  // ── Docs, FAQ, legal, admin help ─────────────────────────────────────────
  real({ id: 'dc-01', type: 'doc', query: 'how many code scans per day does the free tier include', expect: [D('public', 'pricing')] }),
  real({ id: 'dc-02', type: 'doc', query: 'what is the global request cap per minute on the REST API', expect: [D('public', 'api-overview'), D('user', 'api-keys-guide')] }),
  real({ id: 'dc-03', type: 'doc', query: 'stop alerts from coming in overnight', expect: [D('user', 'notifications-guide')] }),
  real({ id: 'dc-04', type: 'doc', query: 'github sends 403 when delivering to our webhook', expect: [D('user', 'webhooks-guide')] }),
  real({ id: 'dc-05', type: 'doc', query: 'let an employer confirm my certificate is genuine', expect: [D('user', 'certifications-guide')] }),
  real({ id: 'dc-06', type: 'doc', query: 'minimum browser versions needed', expect: [D('public', 'getting-started')] }),
  real({ id: 'dc-07', type: 'doc', query: 'which sandbox runs the code candidates submit', expect: [D('user', 'problems-guide')] }),
  real({ id: 'dc-08', type: 'doc', query: 'selfie and ID photo check before a live interview', expect: [D('user', 'interviews-guide')] }),
  real({ id: 'dc-09', type: 'doc', query: 'post scan results into a Slack channel', expect: [D('user', 'integrations-guide')] }),
  real({ id: 'dc-10', type: 'doc', query: 'which currencies can invoices be billed in', expect: [D('user', 'billing-guide')] }),
  real({ id: 'dc-11', type: 'doc', query: 'add a teammate to our organisation by email', expect: [D('user', 'organization-guide')] }),
  real({ id: 'dc-12', type: 'doc', query: 'what gets recorded in the audit trail', expect: [D('user', 'admin-guide')] }),
  real({ id: 'dc-13', type: 'doc', query: 'shortcut to open the command palette', expect: [D('user', 'dashboard-guide')] }),
  real({ id: 'dc-14', type: 'doc', query: 'how many points are easy medium and hard questions worth', expect: [PAGE('faq')] }),
  real({ id: 'dc-15', type: 'doc', query: 'what does the proctoring watch for during a test', expect: [PAGE('faq'), PAGE('terms'), 'doc:guide:admin-proctor'] }), // the proctor dashboard guide lists what is flagged
  real({ id: 'dc-16', type: 'doc', query: 'how long are assessment submissions kept', expect: [PAGE('privacy')] }),
  real({ id: 'dc-17', type: 'doc', query: 'do you respect DNT browser signals', expect: [PAGE('cookies')] }),
  real({ id: 'dc-18', type: 'doc', query: 'minimum age to use the service', expect: [PAGE('privacy')] }),
  real({ id: 'dc-19', type: 'doc', query: 'how are legal disputes settled, arbitration', expect: [PAGE('terms')] }),
  real({ id: 'dc-20', type: 'doc', query: 'can our company sign in with Okta', expect: [PAGE('faq'), D('public', 'faq')] }),
  real({ id: 'dc-21', type: 'doc', query: 'is COBOL one of the languages', expect: [D('public', 'supported-languages')] }),
  real({ id: 'dc-22', type: 'doc', query: 'known bugs in the first alpha', expect: [D('public', 'release-notes')] }),
  real({ id: 'dc-23', type: 'doc', query: 'where do I turn features on per plan and set usage limits', expect: [PAGE('admin-help'), D('user', 'admin-guide')] }),
  real({ id: 'dc-24', type: 'doc', query: 'how do participants earn experience points on the leaderboard', expect: [D('user', 'participant-handbook')] }),
  real({ id: 'dc-25', type: 'doc', query: 'is our code used to train AI models', expect: [D('public', 'faq')] }),
  real({ id: 'dc-26', type: 'doc', query: 'where to configure edge caching and redirect rules', expect: [PAGE('admin-help')] }),
  real({ id: 'dc-31', type: 'doc', query: 'how do I report a security vulnerability I found', expect: [PAGE('security')] }),
  real({ id: 'dc-32', type: 'doc', query: 'is anyone rejected automatically because of a proctoring flag', expect: [PAGE('security')] }),
  // RAG-002: guides for the newer modules.
  real({ id: 'dc-33', type: 'doc', query: 'what happens when a candidate reaches the background verification stage', expect: [D('user', 'background-checks-guide')] }),
  real({ id: 'dc-34', type: 'doc', query: 'how do sellers get paid out from the store', expect: [D('user', 'marketplace-guide')] }),
  real({ id: 'dc-35', type: 'doc', query: 'install an automation template and rerun a failed run', expect: [D('user', 'workflows-guide')] }),
  real({ id: 'dc-36', type: 'doc', query: 'how is the copilot charged and what is a bundle of drafts', expect: [D('user', 'admin-copilot-guide')] }),
  real({ id: 'dc-37', type: 'doc', query: 'stage SLA days and match score for applicants', expect: [D('user', 'hiring-pipeline-guide')] }),
  // RAG-023: guides 23-35 (newer features).
  real({ id: 'dc-38', type: 'doc', query: 'how does my weekly study schedule decide what to practise next', expect: [D('user', 'study-plans-guide')] }),
  real({ id: 'dc-39', type: 'doc', query: 'is the company exam pattern official and does it use negative marking', expect: [D('user', 'company-tests-guide')] }),
  real({ id: 'dc-40', type: 'doc', query: 'placement officer bulk invite students from a spreadsheet and check batch readiness', expect: [D('user', 'campus-placements-guide')] }),
  real({ id: 'dc-41', type: 'doc', query: 'how do I get verified to sell one to one mentoring sessions', expect: [D('user', 'mentors-guide')] }),
  real({ id: 'dc-42', type: 'doc', query: 'stop the daily practice questions on WhatsApp', expect: [D('user', 'whatsapp-practice-guide')] }),
  real({ id: 'dc-43', type: 'doc', query: 'what does my parent see in the weekly progress report', expect: [D('user', 'guardian-reports-guide')] }),
  real({ id: 'dc-44', type: 'doc', query: 'draft captions for our LinkedIn and Instagram posts without auto posting', expect: [D('user', 'social-studio-guide')] }),
  real({ id: 'dc-45', type: 'doc', query: 'the model timed out during my prompt-a-thon run, did I lose a run', expect: [D('user', 'hosted-contests-guide')] }),
  real({ id: 'dc-46', type: 'doc', query: 'invigilator control room add time pause or terminate a candidate', expect: [D('user', 'live-drives-guide'), 'doc:guide:live-drive-control'] }), // the in-app guide answers it too
  real({ id: 'dc-47', type: 'doc', query: 'why is a news article marked facts need checking', expect: [D('user', 'tech-news-guide')] }),
  real({ id: 'dc-48', type: 'doc', query: 'forum moderator ban a member who posts spam', expect: [D('user', 'community-guide'), 'doc:guide:community-moderation'] }), // the in-app guide answers it too
  real({ id: 'dc-49', type: 'doc', query: 'enrol in a live batch course with sessions assignments and a completion certificate', expect: [D('user', 'cohort-courses-guide'), 'doc:guide:cohorts'] }), // the in-app guide answers it too
  real({ id: 'dc-27', type: 'doc', kind: 'multi_hop', all: true, query: 'set the github webhook secret, then check deliveries in the audit logs', expect: [D('user', 'webhooks-guide'), D('user', 'admin-guide')] }),
  real({ id: 'dc-28', type: 'doc', kind: 'multi_hop', all: true, query: 'Pro plan scan limits and how to upgrade from the billing page', expect: [D('public', 'pricing'), D('user', 'billing-guide')] }),
  real({ id: 'dc-29', type: 'doc', as: 'tenant_b', query: 'do you honour do not track', expect: [PAGE('cookies')] }),
  real({ id: 'dc-30', type: 'doc', as: 'tenant_a', query: 'refund policy for subscriptions', expect: [PAGE('faq'), PAGE('terms')] }),

  // ── Organisation data (synthetic tenants) ────────────────────────────────
  synth({ id: 'tn-01', type: 'test', as: 'tenant_a', query: 'pass mark and time limit for our Node backend screening', expect: ['test:acme-t-backend'] }),
  synth({ id: 'tn-02', type: 'test', as: 'tenant_a', query: 'which section asks candidates to design a retry-safe payments endpoint', expect: ['test:acme-t-backend'] }),
  synth({ id: 'tn-03', type: 'test', as: 'tenant_a', query: 'browser end-to-end testing assessment with Playwright', expect: ['test:acme-t-qa'] }),
  synth({ id: 'tn-04', type: 'test_result_summary', as: 'tenant_a', query: 'how did people do on the backend screening, average score and pass rate', expect: ['test_result_summary:acme-t-backend'] }),
  synth({ id: 'tn-05', type: 'attempt_summary', as: 'tenant_a', query: "Priya's score and tab switching on the backend test", expect: ['attempt_summary:acme-t-backend:u-priya'] }),
  synth({ id: 'tn-06', type: 'attempt_summary', as: 'tenant_a', query: 'which backend candidate needs a manual identity review', expect: ['attempt_summary:acme-t-backend:u-arjun'] }),
  synth({ id: 'tn-07', type: 'resume', as: 'tenant_a', query: 'candidates who ran services on Kubernetes at a payments company', expect: ['resume:acme:u-priya'] }),
  synth({ id: 'tn-08', type: 'resume', as: 'tenant_a', query: 'React Native mobile developer CV', expect: ['resume:acme:u-arjun'] }),
  synth({ id: 'tn-09', type: 'hackathon', as: 'tenant_a', query: 'judging weights for our fintech weekend', expect: ['hackathon:acme-h-fintech'] }),
  synth({ id: 'tn-10', type: 'hackathon', as: 'tenant_a', query: 'sponsor prize for building on UPI', expect: ['hackathon:acme-h-fintech'] }),
  synth({ id: 'tn-11', type: 'upload', as: 'tenant_a', query: 'what does our backend rubric say about code quality', expect: ['upload:acme-rubric-backend'] }),
  synth({ id: 'tn-12', type: 'upload', as: 'tenant_a', query: 'must-have requirements in the senior payments engineer job description', expect: ['upload:acme-jd-payments'] }),
  synth({ id: 'tn-13', type: 'resume', as: 'tenant_a', kind: 'multi_hop', all: true, query: "compare Priya Raman's résumé with the payments JD requirements", expect: ['resume:acme:u-priya', 'upload:acme-jd-payments'] }),
  synth({ id: 'tn-14', type: 'test_result_summary', as: 'tenant_a', kind: 'multi_hop', all: true, query: 'backend screening results and the interview scorecard we use to decide', expect: ['test_result_summary:acme-t-backend', 'upload:acme-rubric-backend'] }),
  synth({ id: 'tn-15', type: 'test', as: 'tenant_b', query: 'window functions part of the analyst assessment', expect: ['test:globex-t-data'] }),
  synth({ id: 'tn-16', type: 'upload', as: 'tenant_b', query: 'how long do we keep candidate data after a decision', expect: ['upload:globex-policy-retention'] }),
  synth({ id: 'tn-17', type: 'attempt_summary', as: 'tenant_b', query: "Mei's result on the SQL and Python test", expect: ['attempt_summary:globex-t-data:u-mei'] }),
  synth({ id: 'tn-18', type: 'resume', as: 'tenant_b', query: 'analysts with Tableau dashboard experience', expect: ['resume:globex:u-mei'] }),
  synth({ id: 'tn-19', type: 'hackathon', as: 'tenant_b', query: 'how much does sustainability count in our hackathon judging', expect: ['hackathon:globex-h-green'] }),
  synth({ id: 'tn-20', type: 'test_result_summary', as: 'tenant_b', query: 'pass rate on the data analyst assessment', expect: ['test_result_summary:globex-t-data'] }),
  synth({ id: 'tn-21', type: 'resume', as: 'tenant_b', query: 'Sam Patel résumé', expect: ['resume:globex:u-sam'], forbid: ['resume:acme:u-sam', 'attempt_summary:acme-t-backend:u-sam'] }),
  synth({ id: 'tn-22', type: 'resume', as: 'tenant_a', query: 'Sam Patel Airflow and Spark experience', expect: ['resume:acme:u-sam'], forbid: ['resume:globex:u-sam', 'attempt_summary:globex-t-data:u-sam'] }),
  synth({ id: 'pl-01', type: 'course', query: 'beginner lesson on inner and outer joins', expect: ['course:c-sql-basics'] }),
  synth({ id: 'pl-02', type: 'course', as: 'tenant_a', query: 'intro SQL course for new analysts', expect: ['course:c-sql-basics'] }),
  synth({ id: 'pl-03', type: 'codeathon', query: 'prize money for the monsoon coding contest', expect: ['codeathon:cd-monsoon'] }),
  synth({ id: 'pl-04', type: 'question', query: 'question bank item on eventual consistency', expect: ['question:qb-consistency'] }),
  synth({ id: 'pl-05', type: 'hackathon', query: 'draft winter hackathon about developer tools', expect: ['hackathon:plat-h-winter'] }),
  synth({ id: 'pl-06', type: 'upload', query: 'how platform staff should write interview feedback', expect: ['upload:plat-up-handbook'] }),
  synth({ id: 'pl-07', type: 'upload', query: 'globex data analyst job requirements', expect: ['upload:globex-jd-analyst'] }),
  synth({ id: 'pl-08', type: 'test', query: 'aptitude round for campus drives', expect: ['test:plat-t-aptitude'] }),

  // ── Hiring pipeline (RAG-001): jobs + applicants, staff only ─────────────
  synth({ id: 'hr-01', type: 'ats_job', as: 'tenant_a', query: 'what observability tools does our SRE opening ask for', expect: ['ats_job:acme-job-sre'] }),
  synth({ id: 'hr-02', type: 'ats_job', as: 'tenant_b', query: 'requirements for the electricity demand forecasting ML role', expect: ['ats_job:globex-job-ml'] }),
  synth({ id: 'hr-03', type: 'ats_application', as: 'tenant_a', query: 'which applicants have Terraform and Prometheus experience', expect: ['ats_application:app-ravi'] }),
  synth({ id: 'hr-04', type: 'ats_application', as: 'tenant_b', query: 'candidate who forecasts grid load with gradient boosting', expect: ['ats_application:app-tom'] }),
  synth({ id: 'hr-05', type: 'ats_application', as: 'tenant_a', kind: 'multi_hop', all: true, query: 'compare Ravi Kumar with the site reliability engineer job requirements', expect: ['ats_application:app-ravi', 'ats_job:acme-job-sre'] }),
  synth({ id: 'hr-06', type: 'ats_job', kind: 'keyword', query: 'Machine learning engineer demand forecasting', expect: ['ats_job:globex-job-ml'] }),
  synth({ id: 'acl-12', type: 'ats_application', as: 'tenant_b', kind: 'acl_negative', query: 'SRE applicants with Terraform Prometheus Kubernetes', expect: [], forbid: ['ats_application:app-ravi', 'ats_job:acme-job-sre'] }),
  // ── In-app page guides (lib/rag/sources/guide.ts) ──
  real({ id: 'gd-01', type: 'doc', query: 'confirm or reject the stage changes the pipeline suggested for applicants', expect: ['doc:guide:hiring-approvals'] }),
  real({ id: 'gd-02', type: 'doc', query: 'which consent notice do we show for background verification in India versus the US', expect: ['doc:guide:hiring-bgv'] }),
  real({ id: 'gd-03', type: 'doc', query: 'screen applicants over WhatsApp or a phone call only during outreach hours', expect: ['doc:guide:hiring-screening'] }),
  real({ id: 'gd-04', type: 'doc', query: 'an outside client approving shortlisted candidates for their roles', expect: ['doc:guide:hiring-client-portal'] }),
  real({ id: 'gd-05', type: 'doc', query: 'give a candidate extra time or pause their test during a live drive', expect: ['doc:guide:live-drive-control'] }),
  real({ id: 'gd-06', type: 'doc', query: 'mentor marking the oldest ungraded cohort submissions with a rubric', expect: ['doc:guide:cohort-grading'] }),
  // ── Implementation docs (dev_doc: admins only, searched when asked for) ──
  real({ id: 'dv-01', type: 'dev_doc', types: ['dev_doc'], query: 'where do the knowledge chunk vectors live and how would we move them to postgres', expect: [DEV('devops/09-RAG-Vector-Store')] }),
  real({ id: 'dv-02', type: 'dev_doc', types: ['dev_doc'], as: 'tenant_a', query: 'which fields does the stored user account record have', expect: [DEV('database/02-Data-Dictionary')] }),
  real({ id: 'dv-03', type: 'dev_doc', types: ['dev_doc'], as: 'tenant_a', query: 'how does a chat message become the final prompt sent to the model', expect: [DEV('ai/02-Prompt-Pipeline')] }),
  real({ id: 'dv-04', type: 'dev_doc', types: ['dev_doc'], query: 'which LLM handles which job and how is it picked', expect: [DEV('ai/03-Model-Selection')] }),
  real({ id: 'dv-05', type: 'dev_doc', types: ['dev_doc'], as: 'tenant_a', query: 'how do the web app and the python service talk to each other', expect: [DEV('architecture/01-High-Level-Architecture')] }),
  real({ id: 'acl-16', type: 'dev_doc', types: ['dev_doc'], as: 'tenant_a', kind: 'acl_negative', query: 'threat model for authentication bypass and spoofing', expect: [], forbid: [DEV('security/01-Threat-Model')] }),
  synth({ id: 'acl-13', type: 'ats_application', as: 'tenant_a', kind: 'acl_negative', query: 'Nina Rossi Vue Nuxt frontend applicant', expect: [], forbid: ['ats_application:app-nina'] }),
  synth({ id: 'acl-14', type: 'resume', as: 'tenant_a', kind: 'acl_negative', query: 'Lena Rust embedded firmware battery management', expect: [], forbid: ['resume:acme:u-lena'] }),
  synth({ id: 'acl-15', type: 'ats_job', as: 'tenant_a', kind: 'acl_negative', query: 'LightGBM MLflow demand forecasting machine learning job', expect: [], forbid: ['ats_job:globex-job-ml', 'ats_application:app-tom'] }),

  // ── ACL negatives: must return nothing from these sources ────────────────
  // ── Marketplace products + events feed (public catalogue) ───────────────
  synth({ id: 'mk-01', type: 'marketplace_product', as: 'tenant_a', query: 'is there a printed book on replication and partitioning I can buy', expect: ['marketplace_product:mp-sysdesign-book'] }),
  synth({ id: 'mk-02', type: 'marketplace_product', query: 'book a practice coding interview with feedback', expect: ['marketplace_product:mp-mock-interview'] }),
  synth({ id: 'mk-03', type: 'marketplace_product', as: 'tenant_b', query: 'CV layouts that applicant tracking systems can read', expect: ['marketplace_product:mp-resume-pack'] }),
  synth({ id: 'mk-04', type: 'marketplace_product', as: 'tenant_b', kind: 'acl_negative', query: 'Kubernetes operators helm video course', expect: [], forbid: ['marketplace_product:mp-draft-course'] }),
  synth({ id: 'mk-05', type: 'marketplace_product', as: 'tenant_a', kind: 'acl_negative', query: 'rubber duck mug for debugging', expect: [], forbid: ['marketplace_product:mp-suspended-mug'] }),
  synth({ id: 'ev-01', type: 'external_event', as: 'tenant_a', query: 'online hackathon about carbon and clean energy with big prizes', expect: ['external_event:ef_climate'] }),
  synth({ id: 'ev-02', type: 'external_event', query: 'security CTF happening in Bangalore', expect: ['external_event:ef_blr_ctf'] }),
  synth({ id: 'ev-03', type: 'external_event', as: 'tenant_b', query: 'rated competitive programming contest this week', expect: ['external_event:ef_weekly_round'] }),
  synth({ id: 'ev-04', type: 'external_event', as: 'tenant_a', kind: 'acl_negative', query: 'crypto airdrop buildathon', expect: [], forbid: ['external_event:ef_hidden_spam'] }),
  // ── Tech news + daily digests (public) ──────────────────────────────────
  synth({ id: 'nw-01', type: 'news', as: 'tenant_a', query: 'latest AI news about open model weights you can run on a laptop', expect: ['news:np_open_weights', 'digest:dg_2026-10-20'] }),
  synth({ id: 'nw-02', type: 'news', query: 'kubernetes release notes about sidecar containers going stable', expect: ['news:np_k8s_release'] }),
  synth({ id: 'nw-03', type: 'news', as: 'tenant_b', kind: 'acl_negative', query: 'quantum laptop chip rumour', expect: [], forbid: ['news:np_draft_leak'] }),
  synth({ id: 'dg-01', type: 'digest', query: 'which hackathons and CTFs are open for registration this week according to the daily digest', expect: ['digest:dg_2026-10-20', 'external_event:ef_climate', 'external_event:ef_blr_ctf'] }),
  synth({ id: 'dg-02', type: 'digest', as: 'tenant_a', kind: 'keyword', query: 'daily digest 2026-10-20 picks', expect: ['digest:dg_2026-10-20'] }),
  synth({ id: 'dg-03', type: 'digest', as: 'tenant_a', kind: 'acl_negative', query: 'moonbase robotics buildathon', expect: [], forbid: ['digest:dg_2026-10-19'] }),
  synth({ id: 'acl-01', type: 'hackathon', as: 'tenant_a', kind: 'acl_negative', query: 'Globex green energy hackathon sustainability judging', expect: [], forbid: ['hackathon:globex-h-green'] }),
  synth({ id: 'acl-02', type: 'upload', as: 'tenant_a', kind: 'acl_negative', query: 'candidate data retention policy 180 days', expect: [], forbid: ['upload:globex-policy-retention'] }),
  synth({ id: 'acl-03', type: 'attempt_summary', as: 'tenant_b', kind: 'acl_negative', query: 'Priya Raman score integrity flags Kubernetes', expect: [], forbid: ['attempt_summary:acme-t-backend:u-priya', 'resume:acme:u-priya'] }),
  synth({ id: 'acl-04', type: 'upload', as: 'tenant_b', kind: 'acl_negative', query: 'senior backend engineer payments job description', expect: [], forbid: ['upload:acme-jd-payments'] }),
  synth({ id: 'acl-05', type: 'question', as: 'tenant_a', kind: 'acl_negative', query: 'eventual consistency question bank answer', expect: [], forbid: ['question:qb-consistency', 'question:qb-binary-search'] }),
  synth({ id: 'acl-06', type: 'hackathon', as: 'tenant_a', kind: 'acl_negative', query: 'platform winter hackathon draft', expect: [], forbid: ['hackathon:plat-h-winter'] }),
  synth({ id: 'acl-07', type: 'upload', as: 'tenant_b', kind: 'acl_negative', query: 'interviewer handbook calibration feedback', expect: [], forbid: ['upload:plat-up-handbook'] }),
  synth({ id: 'acl-08', type: 'test', as: 'tenant_a', kind: 'acl_negative', query: 'campus hiring aptitude test', expect: [], forbid: ['test:plat-t-aptitude', 'test_result_summary:plat-t-aptitude'] }),
  synth({ id: 'acl-09', type: 'resume', as: 'tenant_a', kind: 'acl_negative', query: 'Omar Haddad Power BI analyst', expect: [], forbid: ['resume:globex:u-omar', 'attempt_summary:globex-t-data:u-omar'] }),
  synth({ id: 'acl-10', type: 'test', as: 'tenant_b', kind: 'acl_negative', query: 'Node.js backend screening API design section', expect: [], forbid: ['test:acme-t-backend', 'test_result_summary:acme-t-backend'] }),
  real({ id: 'acl-11', type: 'doc', as: 'tenant_a', kind: 'acl_negative', query: 'configure CDN edge caching and redirect rules', expect: [], forbid: [PAGE('admin-help')] }),
  // RAG-022: hosted contests.
  synth({ id: 'ct-01', type: 'contest', query: 'contest where you write a prompt and it is scored against hidden inputs during the festival', expect: ['contest:ct-prompt-diwali'] }),
  synth({ id: 'ct-02', type: 'contest', as: 'tenant_a', query: 'our security onboarding capture the flag for new hires', expect: ['contest:acme-ct-ctf'] }),
  synth({ id: 'ct-03', type: 'contest', as: 'tenant_b', kind: 'acl_negative', query: 'Acme internal CTF cookie forgery weak RSA', expect: [], forbid: ['contest:acme-ct-ctf'] }),
  synth({ id: 'ct-04', type: 'contest', as: 'tenant_a', kind: 'acl_negative', query: 'winter code golf shortest python draft', expect: [], forbid: ['contest:ct-golf-draft'] }),
]
