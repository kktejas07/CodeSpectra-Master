/**
 * Engineering assessment catalog — degree types, engineering branches, and
 * screening dimensions used by exam creation and the question bank.
 *
 * Branch `topics` drive the AI question generator's coverage hints and the
 * curated seed set. IDs are stable slugs used in MongoDB docs.
 */

export interface BranchDef {
  id: string
  label: string
  short: string
  topics: string[]
}

export interface DegreeTypeDef {
  id: string
  label: string
}

export interface ScreeningTypeDef {
  id: string
  label: string
  short: string
  description: string
}

export const DEGREE_TYPES: DegreeTypeDef[] = [
  { id: 'btech', label: 'B.Tech' },
  { id: 'mtech', label: 'M.Tech' },
  { id: 'mca', label: 'MCA' },
  { id: 'diploma', label: 'Diploma' },
  { id: 'other', label: 'Other' },
]

export const BRANCHES: BranchDef[] = [
  { id: 'cse', label: 'Computer Science & Engineering', short: 'CSE', topics: ['Data Structures & Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Software Engineering', 'Programming in C/Java/Python', 'Theory of Computation'] },
  { id: 'it', label: 'Information Technology', short: 'IT', topics: ['DBMS', 'Web Technologies', 'Computer Networks', 'Operating Systems', 'Software Engineering', 'Data Structures', 'Cloud & DevOps'] },
  { id: 'ece', label: 'Electronics & Communication Engineering', short: 'ECE', topics: ['Signals & Systems', 'Digital Electronics', 'Analog Electronics', 'Communication Systems', 'Microprocessors', 'Control Systems', 'Electronic Devices'] },
  { id: 'eee', label: 'Electrical & Electronics Engineering', short: 'EEE', topics: ['Circuit Theory', 'Electrical Machines', 'Power Systems', 'Control Systems', 'Power Electronics', 'Electrical Measurements', 'Electromagnetic Theory'] },
  { id: 'mech', label: 'Mechanical Engineering', short: 'ME', topics: ['Thermodynamics', 'Fluid Mechanics', 'Strength of Materials', 'Machine Design', 'Manufacturing Processes', 'Theory of Machines', 'Heat Transfer'] },
  { id: 'civil', label: 'Civil Engineering', short: 'CE', topics: ['Structural Analysis', 'Concrete Technology', 'Geotechnical Engineering', 'Fluid Mechanics', 'Environmental Engineering', 'Surveying', 'Transportation Engineering'] },
  { id: 'chem', label: 'Chemical Engineering', short: 'CH', topics: ['Chemical Reaction Engineering', 'Mass Transfer', 'Heat Transfer', 'Thermodynamics', 'Fluid Mechanics', 'Process Control', 'Chemical Technology'] },
  { id: 'ai_ds', label: 'Artificial Intelligence & Data Science', short: 'AI&DS', topics: ['Machine Learning', 'Deep Learning', 'Probability & Statistics', 'Data Structures', 'Data Engineering', 'NLP', 'Neural Networks'] },
]

export const SCREENING_TYPES: ScreeningTypeDef[] = [
  { id: 'aptitude', label: 'Aptitude', short: 'Aptitude', description: 'Quantitative, logical & verbal reasoning' },
  { id: 'technical', label: 'Technical', short: 'Technical', description: 'Domain-specific engineering knowledge' },
  { id: 'coding', label: 'Coding', short: 'Coding', description: 'Programming & problem-solving' },
  { id: 'mixed', label: 'Mixed', short: 'Mixed', description: 'Aptitude + technical + coding' },
]

export type QuestionType = 'mcq' | 'multiple_response' | 'true_false' | 'coding' | 'descriptive' | 'fill_blanks'

/** Question types usable by the question bank and exams. Kept here (pure constants, no server deps) so client pages can import it safely. */
export const BANK_QUESTION_TYPES: QuestionType[] = ['mcq', 'multiple_response', 'true_false', 'coding', 'descriptive', 'fill_blanks']

export const QUESTION_TYPES: { id: string; label: string }[] = [
  { id: 'mcq', label: 'Multiple Choice' },
  { id: 'multiple_response', label: 'Multiple Response' },
  { id: 'true_false', label: 'True / False' },
  { id: 'fill_blanks', label: 'Fill in the Blanks' },
  { id: 'coding', label: 'Coding' },
  { id: 'descriptive', label: 'Descriptive' },
]

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const branchLabel = (id?: string | null): string =>
  BRANCHES.find((b) => b.id === id)?.short || id || 'General'

export const degreeLabel = (id?: string | null): string =>
  DEGREE_TYPES.find((d) => d.id === id)?.label || id || 'Any'
