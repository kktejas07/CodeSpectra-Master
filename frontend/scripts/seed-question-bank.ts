import { getMongoDb } from '@/lib/mongodb'
import { normalizeBankQuestion } from '@/lib/question-bank'
import { randomUUID } from 'crypto'

const now = () => new Date().toISOString()

type SeedRow = {
  question: string
  type?: string
  options?: string[]
  answer?: string
  explanation?: string
  difficulty?: string
  marks?: number
  degree_type?: string
  branch?: string
  subject?: string
  tags?: string[]
  source?: string
}

function build(rows: SeedRow[]) {
  return rows
    .map((r) => normalizeBankQuestion({ id: randomUUID(), createdAt: now(), ...r }))
    .filter((d): d is NonNullable<typeof d> => d !== null)
}

const BTECH = 'btech'

// ── Common Aptitude (branch-agnostic) ──
const aptitude: SeedRow[] = [
  { question: 'If 7 men can build a wall in 12 days, how many men are needed to build the same wall in 6 days?', options: ['9', '12', '14', '16'], answer: '14', explanation: 'Work is proportional to men × days: 7 × 12 = M × 6 ⇒ M = 14.', difficulty: 'Easy', subject: 'Quantitative Aptitude', marks: 5, degree_type: BTECH, tags: ['time-work'], source: 'seed' },
  { question: 'A train 240 m long crosses a pole in 12 seconds. What is its speed in km/h?', options: ['60 km/h', '72 km/h', '80 km/h', '90 km/h'], answer: '72 km/h', explanation: 'Speed = 240/12 = 20 m/s = 20 × 18/5 = 72 km/h.', difficulty: 'Medium', subject: 'Quantitative Aptitude', marks: 5, degree_type: BTECH, tags: ['speed-time-distance'], source: 'seed' },
  { question: 'In a class of 40 students, 25 play cricket and 20 play football. If 5 play neither, how many play both?', options: ['5', '10', '12', '15'], answer: '10', explanation: '|A ∪ B| = 40 − 5 = 35 = 25 + 20 − |A ∩ B| ⇒ |A ∩ B| = 10.', difficulty: 'Medium', subject: 'Quantitative Aptitude', marks: 5, degree_type: BTECH, tags: ['set-theory'], source: 'seed' },
  { question: 'LOGIC : REASONING :: :: ?', options: ['Tree : Root', 'Bread : Butter', 'Juice : Drink', 'Shoes : Feet'], answer: 'Juice : Drink', explanation: 'Reasoning is a broader category that LOGIC belongs to; a Drink is a broader category that Juice belongs to.', difficulty: 'Easy', subject: 'Logical Reasoning', marks: 5, degree_type: BTECH, tags: ['analogy'], source: 'seed' },
  { question: 'Statements: All flowers are trees. Some trees are bushes. Conclusion I: Some flowers are bushes. Conclusion II: Some trees are flowers. Which conclusion follows?', options: ['Only I', 'Only II', 'Both I and II', 'Neither I nor II'], answer: 'Only II', explanation: 'All flowers are trees ⇒ some trees are flowers (conversion). No statement links flowers to bushes.', difficulty: 'Medium', subject: 'Logical Reasoning', marks: 5, degree_type: BTECH, tags: ['syllogism'], source: 'seed' },
  { question: 'Complete the series: 2, 6, 12, 20, 30, ?', options: ['36', '40', '42', '44'], answer: '42', explanation: 'Differences are 4, 6, 8, 10, so next is 30 + 12 = 42.', difficulty: 'Easy', subject: 'Quantitative Aptitude', marks: 5, degree_type: BTECH, tags: ['series'], source: 'seed' },
  { question: 'A sum of money doubles itself in 8 years at simple interest. What is the rate of interest per annum?', options: ['10%', '12.5%', '15%', '8%'], answer: '12.5%', explanation: 'Interest = Principal ⇒ P × r × 8 / 100 = P ⇒ r = 12.5%.', difficulty: 'Medium', subject: 'Quantitative Aptitude', marks: 5, degree_type: BTECH, tags: ['simple-interest'], source: 'seed' },
]

// ── CSE / IT ──
const cse: SeedRow[] = [
  { question: 'What is the time complexity of binary search on a sorted array of n elements?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], answer: 'O(log n)', explanation: 'Binary search halves the search space each step.', difficulty: 'Easy', subject: 'Data Structures & Algorithms', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['binary-search', 'complexity'], source: 'seed' },
  { question: 'Which data structure is used for implementing function calls (recursion) in most languages?', options: ['Queue', 'Stack', 'Heap', 'Linked List'], answer: 'Stack', explanation: 'Activation records are pushed/popped LIFO.', difficulty: 'Easy', subject: 'Data Structures & Algorithms', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['stack'], source: 'seed' },
  { question: 'In Java, which keyword is used to stop a method from being overridden?', options: ['static', 'final', 'abstract', 'sealed'], answer: 'final', explanation: 'final methods cannot be overridden by subclasses.', difficulty: 'Easy', subject: 'Java', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['java', 'oop'], source: 'seed' },
  { question: 'Which HTTP status code represents "Not Found"?', options: ['400', '401', '403', '404'], answer: '404', explanation: '404 indicates the requested resource does not exist.', difficulty: 'Easy', subject: 'Web Technologies', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['http'], source: 'seed' },
  { question: 'The SELECT query "SELECT * FROM emp WHERE name LIKE \'J%\'" returns rows where name ____.', options: ['ends with J', 'starts with J', 'contains J', 'equals J'], answer: 'starts with J', explanation: 'The % wildcard matches any string after J.', difficulty: 'Medium', subject: 'Databases', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['sql', 'like'], source: 'seed' },
  { question: 'Given the array [64, 25, 12, 22, 11], how many passes does selection sort need to fully sort it?', options: ['4', '5', '6', '3'], answer: '4', explanation: 'Selection sort needs n − 1 passes for n elements.', difficulty: 'Medium', subject: 'Data Structures & Algorithms', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['sorting'], source: 'seed' },
  { question: 'Which OSI layer is responsible for routing packets between networks?', options: ['Data Link', 'Network', 'Transport', 'Session'], answer: 'Network', explanation: 'The Network layer (Layer 3) performs routing.', difficulty: 'Easy', subject: 'Computer Networks', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['osi', 'networking'], source: 'seed' },
  { question: 'Which of the following is NOT a NoSQL database?', options: ['MongoDB', 'Cassandra', 'MySQL', 'Redis'], answer: 'MySQL', explanation: 'MySQL is a relational (SQL) database.', difficulty: 'Easy', subject: 'Databases', marks: 10, branch: 'cse', degree_type: BTECH, tags: ['nosql'], source: 'seed' },
]

// ── ECE / EEE (branch id 'ece' shared by both ECE and EEE) ──
const ece: SeedRow[] = [
  { question: 'What is the output of a 2-input XOR gate when both inputs are HIGH (1, 1)?', options: ['0', '1', 'High-Z', 'Undefined'], answer: '0', explanation: 'XOR outputs 1 only when inputs differ.', difficulty: 'Easy', subject: 'Digital Electronics', marks: 10, branch: 'ece', degree_type: BTECH, tags: ['logic-gates'], source: 'seed' },
  { question: 'The Nyquist sampling theorem states that a signal must be sampled at least ____ its highest frequency.', options: ['once per', 'twice', 'four times', 'equal to the period of'], answer: 'twice', explanation: 'fs ≥ 2 × fmax to avoid aliasing.', difficulty: 'Medium', subject: 'Signals & Systems', marks: 10, branch: 'ece', degree_type: BTECH, tags: ['sampling', 'nyquist'], source: 'seed' },
  { question: 'What is the relationship between the cut-off frequency and the time constant RC in a first-order low-pass filter?', options: ['fc = 1/(2πRC)', 'fc = RC', 'fc = 2πRC', 'fc = 1/RC'], answer: 'fc = 1/(2πRC)', explanation: 'Standard first-order low-pass cutoff formula.', difficulty: 'Medium', subject: 'Analog Electronics', marks: 10, branch: 'ece', degree_type: BTECH, tags: ['filters', 'rc'], source: 'seed' },
  { question: 'Which modulation technique has the best noise immunity for digital data?', options: ['ASK', 'FSK', 'PSK', 'AM'], answer: 'PSK', explanation: 'PSK is less affected by amplitude noise than ASK/AM.', difficulty: 'Hard', subject: 'Communication Systems', marks: 10, branch: 'ece', degree_type: BTECH, tags: ['modulation'], source: 'seed' },
  { question: 'An ideal op-amp has ____ input impedance and ____ output impedance.', options: ['zero, infinite', 'infinite, zero', 'infinite, infinite', 'zero, zero'], answer: 'infinite, zero', explanation: 'Ideal op-amp: no input current drawn, output is an ideal voltage source.', difficulty: 'Easy', subject: 'Analog Electronics', marks: 10, branch: 'ece', degree_type: BTECH, tags: ['op-amp'], source: 'seed' },
  { question: 'The Kirchhoff Current Law (KCL) states that the sum of currents entering a node is ____.', options: ['equal to the largest current', 'zero', 'equal to the total resistance', 'undefined'], answer: 'zero', explanation: 'Charge cannot accumulate: ΣI(in) = ΣI(out).', difficulty: 'Easy', subject: 'Circuit Theory', marks: 10, branch: 'ece', degree_type: BTECH, tags: ['kcl', 'circuits'], source: 'seed' },
]

// ── Mechanical ──
const mech: SeedRow[] = [
  { question: 'The first law of thermodynamics is essentially a statement of which principle?', options: ['Conservation of momentum', 'Conservation of energy', 'Conservation of mass', 'Entropy increase'], answer: 'Conservation of energy', explanation: 'ΔU = Q − W — energy is conserved.', difficulty: 'Easy', subject: 'Thermodynamics', marks: 10, branch: 'mech', degree_type: BTECH, tags: ['thermodynamics', 'first-law'], source: 'seed' },
  { question: 'Which property of a fluid is directly responsible for viscous drag?', options: ['Density', 'Surface tension', 'Viscosity', 'Bulk modulus'], answer: 'Viscosity', explanation: 'Viscosity resists internal fluid flow layers.', difficulty: 'Easy', subject: 'Fluid Mechanics', marks: 10, branch: 'mech', degree_type: BTECH, tags: ['viscosity', 'fluid-mechanics'], source: 'seed' },
  { question: 'In a 4-stroke engine, the crankshaft makes ____ revolutions per complete cycle.', options: ['1', '2', '4', '8'], answer: '2', explanation: 'Four strokes (intake, compression, power, exhaust) span two crankshaft revolutions.', difficulty: 'Medium', subject: 'IC Engines', marks: 10, branch: 'mech', degree_type: BTECH, tags: ['ic-engines'], source: 'seed' },
  { question: 'Young\'s modulus measures the ____ of a material.', options: ['hardness', 'toughness', 'stiffness', 'ductility'], answer: 'stiffness', explanation: 'It is the ratio of stress to strain in the elastic region.', difficulty: 'Easy', subject: 'Strength of Materials', marks: 10, branch: 'mech', degree_type: BTECH, tags: ['som', 'youngs-modulus'], source: 'seed' },
  { question: 'Gear ratio of 60:1 means the output shaft rotates ____ the input shaft.', options: ['60 times faster than', '1/60th as fast as', 'at the same speed as', '120 times faster than'], answer: '1/60th as fast as', explanation: 'Output speed = input speed / gear ratio, torque is multiplied.', difficulty: 'Easy', subject: 'Theory of Machines', marks: 10, branch: 'mech', degree_type: BTECH, tags: ['gears'], source: 'seed' },
  { question: 'Which welding process uses a consumable electrode and is most common in fabrication?', options: ['TIG', 'MIG', 'Oxy-acetylene', 'Resistance'], answer: 'MIG', explanation: 'MIG (GMAW) uses a continuously fed consumable wire electrode.', difficulty: 'Medium', subject: 'Manufacturing', marks: 10, branch: 'mech', degree_type: BTECH, tags: ['welding', 'manufacturing'], source: 'seed' },
]

// ── Civil ──
const civil: SeedRow[] = [
  { question: 'The strength of concrete is primarily governed by which ratio?', options: ['Water-cement ratio', 'Sand-cement ratio', 'Aggregate-cement ratio', 'Slump ratio'], answer: 'Water-cement ratio', explanation: 'Lower w/c ratio gives higher strength and durability (Abrams\' law).', difficulty: 'Easy', subject: 'Concrete Technology', marks: 10, branch: 'civil', degree_type: BTECH, tags: ['concrete'], source: 'seed' },
  { question: 'A simply supported beam carries a point load at midspan. The maximum bending moment occurs at ____.', options: ['the supports', 'midspan', 'quarter span', 'nowhere'], answer: 'midspan', explanation: 'For a central point load on a simple span, max moment = PL/4 at midspan.', difficulty: 'Easy', subject: 'Strength of Materials', marks: 10, branch: 'civil', degree_type: BTECH, tags: ['beams', 'bending-moment'], source: 'seed' },
  { question: 'Which type of foundation is typically used for a heavy structure on soft soil?', options: ['Isolated footing', 'Pile foundation', 'Raft foundation', 'Strip footing'], answer: 'Pile foundation', explanation: 'Piles transfer load to deeper, stronger strata.', difficulty: 'Medium', subject: 'Geotechnical Engineering', marks: 10, branch: 'civil', degree_type: BTECH, tags: ['foundations', 'soil'], source: 'seed' },
  { question: 'In surveying, the imaginary surface used to define the horizontal reference is called the ____.', options: ['azimuth', 'datum', 'bearing', 'contour'], answer: 'datum', explanation: 'A datum is the reference surface/level for vertical measurements.', difficulty: 'Medium', subject: 'Surveying', marks: 10, branch: 'civil', degree_type: BTECH, tags: ['surveying'], source: 'seed' },
  { question: 'Which IS code specifies the general construction in steel for India?', options: ['IS 456', 'IS 800', 'IS 1893', 'IS 875'], answer: 'IS 800', explanation: 'IS 456 is concrete, IS 800 is steel, IS 1893 is earthquake design.', difficulty: 'Hard', subject: 'Structural Engineering', marks: 10, branch: 'civil', degree_type: BTECH, tags: ['steel', 'is-codes'], source: 'seed' },
  { question: 'Bulking of sand means the volume of sand ____ in the presence of moisture.', options: ['decreases', 'increases', 'stays constant', 'becomes zero'], answer: 'increases', explanation: 'Moisture films push particles apart, increasing apparent volume.', difficulty: 'Medium', subject: 'Construction Materials', marks: 10, branch: 'civil', degree_type: BTECH, tags: ['sand', 'materials'], source: 'seed' },
]

// ── Chemical ──
const chem: SeedRow[] = [
  { question: 'For an endothermic reaction, increasing the temperature at equilibrium will ____ the formation of products.', options: ['decrease', 'increase', 'not affect', 'stop'], answer: 'increase', explanation: 'Le Chatelier\'s principle: endothermic reactions favor heat absorption.', difficulty: 'Medium', subject: 'Chemical Thermodynamics', marks: 10, branch: 'chem', degree_type: BTECH, tags: ['le-chatelier', 'equilibrium'], source: 'seed' },
  { question: 'Which unit operation separates a liquid mixture based on differences in boiling points?', options: ['Filtration', 'Distillation', 'Extraction', 'Crystallization'], answer: 'Distillation', explanation: 'Distillation exploits volatility differences.', difficulty: 'Easy', subject: 'Mass Transfer', marks: 10, branch: 'chem', degree_type: BTECH, tags: ['distillation'], source: 'seed' },
  { question: 'The Reynolds number is the ratio of ____ forces to ____ forces in a flowing fluid.', options: ['inertial, viscous', 'viscous, inertial', 'gravitational, inertial', 'pressure, viscous'], answer: 'inertial, viscous', explanation: 'Re = ρVD/μ determines laminar vs turbulent flow.', difficulty: 'Easy', subject: 'Fluid Mechanics', marks: 10, branch: 'chem', degree_type: BTECH, tags: ['reynolds-number'], source: 'seed' },
  { question: 'What is the degree of freedom for a pure single-phase component?', options: ['0', '1', '2', '3'], answer: '2', explanation: 'Gibbs phase rule: F = C − P + 2 = 1 − 1 + 2 = 2 (T and P can vary).', difficulty: 'Hard', subject: 'Thermodynamics', marks: 10, branch: 'chem', degree_type: BTECH, tags: ['gibbs-phase-rule'], source: 'seed' },
  { question: 'Which reactor gives the highest conversion for a given volume in a first-order reaction?', options: ['CSTR', 'PFR', 'Batch', 'Semi-batch'], answer: 'PFR', explanation: 'Plug flow reactors outperform CSTRs for positive-order kinetics.', difficulty: 'Medium', subject: 'Reaction Engineering', marks: 10, branch: 'chem', degree_type: BTECH, tags: ['reactors', 'pfr'], source: 'seed' },
  { question: 'The Laplace transform of the unit step function is ____.', options: ['1', '1/s', 's', 'e^-s'], answer: '1/s', explanation: 'L{1} = 1/s for s > 0.', difficulty: 'Medium', subject: 'Process Control', marks: 10, branch: 'chem', degree_type: BTECH, tags: ['laplace', 'control'], source: 'seed' },
]

// ── AI & Data Science ──
const ai_ds: SeedRow[] = [
  { question: 'Which algorithm is most commonly used to optimize weights in a neural network?', options: ['Gradient descent', 'Random search', 'Naive Bayes', 'K-means'], answer: 'Gradient descent', explanation: 'Backpropagation uses gradient descent to minimize loss.', difficulty: 'Easy', subject: 'Machine Learning', marks: 10, branch: 'ai_ds', degree_type: BTECH, tags: ['neural-networks', 'optimization'], source: 'seed' },
  { question: 'Overfitting in a model can be reduced by which technique?', options: ['Increasing features', 'Regularization', 'Removing the validation set', 'Increasing epochs'], answer: 'Regularization', explanation: 'L1/L2 regularization penalize large weights and reduce variance.', difficulty: 'Easy', subject: 'Machine Learning', marks: 10, branch: 'ai_ds', degree_type: BTECH, tags: ['regularization'], source: 'seed' },
  { question: 'Which SQL clause is used to filter grouped results (applied after GROUP BY)?', options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], answer: 'HAVING', explanation: 'HAVING filters aggregated groups; WHERE filters rows pre-aggregation.', difficulty: 'Medium', subject: 'Databases', marks: 10, branch: 'ai_ds', degree_type: BTECH, tags: ['sql', 'group-by'], source: 'seed' },
  { question: 'Which pandas method returns the first n rows of a DataFrame?', options: ['.head()', '.top()', '.first()', '.peek()'], answer: '.head()', explanation: 'df.head(n) returns the first n rows.', difficulty: 'Easy', subject: 'Python for Data Science', marks: 10, branch: 'ai_ds', degree_type: BTECH, tags: ['pandas'], source: 'seed' },
  { question: 'In NLP, TF-IDF is used to ____.', options: ['cluster documents', 'weight term importance in a document', 'generate word embeddings', 'tokenize text'], answer: 'weight term importance in a document', explanation: 'TF-IDF balances term frequency against corpus-wide rarity.', difficulty: 'Medium', subject: 'NLP', marks: 10, branch: 'ai_ds', degree_type: BTECH, tags: ['tf-idf', 'nlp'], source: 'seed' },
  { question: 'Precision measures the fraction of positive predictions that are actually ____.', options: ['relevant', 'irrelevant', 'negative', 'random'], answer: 'relevant', explanation: 'Precision = TP / (TP + FP).', difficulty: 'Easy', subject: 'Machine Learning', marks: 10, branch: 'ai_ds', degree_type: BTECH, tags: ['metrics', 'classification'], source: 'seed' },
]

async function seed() {
  const db = await getMongoDb()
  const col = db.collection('question_bank')
  const existing = await col.countDocuments()
  if (existing > 0) {
    console.log(`question_bank already has ${existing} documents — skipping seed.`)
    process.exit(0)
  }

  const all = [...aptitude, ...cse, ...ece, ...mech, ...civil, ...chem, ...ai_ds]
  const docs = build(all)
  await col.insertMany(docs)
  console.log(`✓ question_bank seeded with ${docs.length} starter questions (aptitude + 6 branches).`)
  console.log('Tip: top up with AI bulk generation and CSV/JSON import for 1000+ per branch.')
  process.exit(0)
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1) })
