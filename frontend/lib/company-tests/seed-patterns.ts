/**
 * Starting patterns for `company_exam_patterns`, inserted once when the
 * collection has no row for an id (an admin's edits are never overwritten).
 *
 * These are plausible summaries of commonly reported public patterns, NOT
 * official data. Every seed is `verified: false`; an admin checks it against
 * the company's own page, fixes it and marks it verified. Companies change
 * their tests often — counts, timings and cut-offs here are illustrative.
 */
import type { PatternInput } from './types'

const VERIFY = 'Seeded from commonly reported public patterns. Not official — check the company\'s current test before relying on it.'

const S = (
  name: string, questionCount: number, timeMinutes: number,
  questionTypes: string[], categories: string[],
): PatternInput['sections'][number] => ({ name, questionCount, timeMinutes, questionTypes: questionTypes as never, categories })

const OBJ = ['mcq', 'numeric']
const MCQ = ['mcq']
const CODE = ['coding']

function seed(p: Omit<PatternInput, 'verified' | 'active' | 'notes'> & { notes?: string }): PatternInput {
  return { ...p, notes: p.notes ? `${p.notes} ${VERIFY}` : VERIFY, verified: false, active: true }
}

export const SEED_PATTERNS: PatternInput[] = [
  // ── Mass recruiters (India campus hiring) ──
  seed({
    id: 'tcs-nqt', companySlug: 'tcs', companyName: 'TCS', examName: 'TCS NQT',
    sections: [
      S('Numerical ability', 20, 25, OBJ, ['quant']),
      S('Verbal ability', 25, 25, MCQ, ['verbal']),
      S('Reasoning ability', 20, 25, MCQ, ['logical']),
      S('Advanced quantitative and reasoning', 15, 25, OBJ, ['quant', 'logical']),
      S('Advanced coding', 2, 90, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 60, sourceUrl: 'https://www.tcs.com/careers',
    notes: 'Foundation sections first, then the advanced part for Digital/Prime roles.',
  }),
  seed({
    id: 'infosys-sp-dse', companySlug: 'infosys', companyName: 'Infosys', examName: 'Infosys SP / DSE',
    sections: [
      S('Logical reasoning', 15, 25, MCQ, ['logical']),
      S('Mathematical ability', 10, 35, OBJ, ['quant']),
      S('Verbal ability', 20, 20, MCQ, ['verbal']),
      S('Pseudocode', 5, 10, ['mcq', 'output_prediction'], ['pseudocode']),
      S('Coding', 3, 180, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 65, sourceUrl: 'https://www.infosys.com/careers/',
    notes: 'Specialist Programmer and Digital Specialist Engineer roles.',
  }),
  seed({
    id: 'wipro-elite-nth', companySlug: 'wipro', companyName: 'Wipro', examName: 'Wipro Elite NTH',
    sections: [
      S('Logical ability', 14, 14, MCQ, ['logical']),
      S('Quantitative ability', 16, 16, OBJ, ['quant']),
      S('English comprehension', 18, 18, MCQ, ['verbal']),
      S('Essay writing', 1, 20, ['descriptive'], ['essay']),
      S('Online programming test', 2, 60, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 60, sourceUrl: 'https://careers.wipro.com/',
  }),
  seed({
    id: 'accenture-ase', companySlug: 'accenture', companyName: 'Accenture', examName: 'Accenture associate software engineer test',
    sections: [
      S('Cognitive assessment', 50, 50, MCQ, ['verbal', 'logical', 'quant']),
      S('Technical assessment', 40, 40, ['mcq', 'output_prediction'], ['technical', 'pseudocode']),
      S('Coding', 2, 45, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 60, sourceUrl: 'https://www.accenture.com/in-en/careers',
    notes: 'A communication assessment usually follows; it is not part of this practice set.',
  }),
  seed({
    id: 'cognizant-genc', companySlug: 'cognizant', companyName: 'Cognizant', examName: 'Cognizant GenC',
    sections: [
      S('Quantitative aptitude', 20, 25, OBJ, ['quant']),
      S('Logical reasoning', 20, 25, MCQ, ['logical']),
      S('Verbal ability', 20, 20, MCQ, ['verbal']),
      S('Coding', 2, 60, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 60, sourceUrl: 'https://careers.cognizant.com/',
    notes: 'GenC, GenC Next and GenC Pro use different coding depth.',
  }),
  seed({
    id: 'capgemini-analyst', companySlug: 'capgemini', companyName: 'Capgemini', examName: 'Capgemini analyst / senior analyst',
    sections: [
      S('Pseudocode', 30, 40, ['mcq', 'output_prediction'], ['pseudocode']),
      S('English communication', 30, 30, MCQ, ['verbal']),
      S('Reasoning (stands in for the game-based round)', 20, 25, MCQ, ['logical']),
      S('Coding', 2, 45, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 60, sourceUrl: 'https://www.capgemini.com/careers/',
    notes: 'The real test has a game-based aptitude round and a behavioural survey; practice uses reasoning questions instead.',
  }),
  seed({
    id: 'hcl-techbee', companySlug: 'hcltech', companyName: 'HCLTech', examName: 'HCL TechBee',
    sections: [
      S('Quantitative aptitude', 15, 20, OBJ, ['quant']),
      S('Logical reasoning', 15, 20, MCQ, ['logical']),
      S('English', 15, 15, MCQ, ['verbal']),
    ],
    negativeMarking: 0, cutoffPercent: 60, sourceUrl: 'https://www.hcltech.com/careers',
    notes: 'Early-career programme for school leavers; an interview follows the test.',
  }),

  // ── Product companies (online assessment style) ──
  seed({
    id: 'google-oa', companySlug: 'google', companyName: 'Google', examName: 'Google online coding assessment',
    sections: [S('Coding', 2, 90, CODE, ['coding'])],
    negativeMarking: 0, cutoffPercent: 70, sourceUrl: 'https://www.google.com/about/careers/applications/',
  }),
  seed({
    id: 'amazon-sde-oa', companySlug: 'amazon', companyName: 'Amazon', examName: 'Amazon SDE online assessment',
    sections: [
      S('Code debugging', 7, 20, ['debugging'], ['coding']),
      S('Coding', 2, 70, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 70, sourceUrl: 'https://www.amazon.jobs/',
    notes: 'The real OA also has a work-style survey, which is not scored here.',
  }),
  seed({
    id: 'meta-coding-screen', companySlug: 'meta', companyName: 'Meta', examName: 'Meta coding screen practice',
    sections: [S('Coding', 2, 45, CODE, ['coding'])],
    negativeMarking: 0, cutoffPercent: 75, sourceUrl: 'https://www.metacareers.com/',
    notes: 'Meta usually screens live with an engineer; this models the first coding round.',
  }),
  seed({
    id: 'microsoft-oa', companySlug: 'microsoft', companyName: 'Microsoft', examName: 'Microsoft online assessment',
    sections: [S('Coding', 3, 90, CODE, ['coding'])],
    negativeMarking: 0, cutoffPercent: 65, sourceUrl: 'https://careers.microsoft.com/',
  }),
  seed({
    id: 'apple-technical-screen', companySlug: 'apple', companyName: 'Apple', examName: 'Apple technical screen practice',
    sections: [
      S('CS fundamentals', 15, 20, MCQ, ['technical']),
      S('Coding', 2, 60, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 65, sourceUrl: 'https://www.apple.com/careers/',
    notes: 'Apple teams run their own screens; this is a general practice shape.',
  }),
  seed({
    id: 'netflix-technical-screen', companySlug: 'netflix', companyName: 'Netflix', examName: 'Netflix technical screen practice',
    sections: [
      S('Coding', 2, 60, CODE, ['coding']),
      S('System design', 1, 30, ['descriptive'], ['system design']),
    ],
    negativeMarking: 0, cutoffPercent: 70, sourceUrl: 'https://jobs.netflix.com/',
    notes: 'Netflix mostly hires experienced engineers through live interviews.',
  }),
  seed({
    id: 'uber-oa', companySlug: 'uber', companyName: 'Uber', examName: 'Uber online assessment',
    sections: [S('Coding', 4, 70, CODE, ['coding'])],
    negativeMarking: 0, cutoffPercent: 65, sourceUrl: 'https://www.uber.com/careers/',
  }),
  seed({
    id: 'airbnb-oa', companySlug: 'airbnb', companyName: 'Airbnb', examName: 'Airbnb coding assessment',
    sections: [S('Coding', 2, 60, CODE, ['coding'])],
    negativeMarking: 0, cutoffPercent: 70, sourceUrl: 'https://careers.airbnb.com/',
  }),
  seed({
    id: 'stripe-practical', companySlug: 'stripe', companyName: 'Stripe', examName: 'Stripe practical coding practice',
    sections: [
      S('Bug squash', 1, 45, ['debugging'], ['coding']),
      S('Practical coding', 1, 45, CODE, ['coding']),
    ],
    negativeMarking: 0, cutoffPercent: 70, sourceUrl: 'https://stripe.com/jobs',
  }),
  seed({
    id: 'spotify-oa', companySlug: 'spotify', companyName: 'Spotify', examName: 'Spotify coding assessment',
    sections: [S('Coding', 2, 70, CODE, ['coding'])],
    negativeMarking: 0, cutoffPercent: 65, sourceUrl: 'https://www.lifeatspotify.com/',
  }),
]
