import { getMongoDb } from '@/lib/mongodb'
import { normalizeBankQuestion, bankContentHash } from '@/lib/question-bank'
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
  tech_stack?: string[]
  tags?: string[]
  industry?: string
  level?: string
  assessment_category?: string
}

const BTECH = 'btech'
const MCAT = 'mca'
const MTECH = 'mtech'

// Branch → default industry(s) so questions get sensible vertical tags.
const INDUSTRY: Record<string, string[]> = {
  cse: ['software', 'financial_services', 'government'],
  it: ['software', 'retail', 'call_centers'],
  ece: ['engineering', 'utilities_energy', 'manufacturing'],
  eee: ['utilities_energy', 'engineering', 'manufacturing'],
  mech: ['manufacturing', 'transportation_logistics', 'construction'],
  civil: ['construction', 'government', 'utilities_energy'],
  chem: ['manufacturing', 'utilities_energy', 'healthcare'],
  ai_ds: ['software', 'financial_services', 'healthcare'],
}

const CATEGORY: Record<string, string> = {
  aptitude: 'cognitive',
  technical: 'skills',
  coding: 'skills',
  mixed: 'cognitive',
}

// Default industry/level for rows that don't specify them.
function fill(row: SeedRow): SeedRow {
  const industry = row.industry || INDUSTRY[row.branch || '']?.[0] || 'software'
  const category = row.assessment_category || (row.subject === 'Aptitude' || row.subject === 'Logical Reasoning' || row.subject === 'Verbal Ability' ? 'cognitive' : 'skills')
  return {
    ...row,
    industry: row.industry || industry,
    assessment_category: category,
    level: row.level || 'entry',
    degree_type: row.degree_type || BTECH,
    type: row.type || 'mcq',
    difficulty: row.difficulty || 'Medium',
  }
}

// Convenience short-cuts to reduce row verbosity.
const E = 'Easy', M = 'Medium', H = 'Hard'
const m = (o: string[]) => o // mcq options
const TF = ['True', 'False']

// ────────────────────────────────────────────────────────────────────────────
// APTITUDE (cognitive) — quantitative, logical, verbal
// ────────────────────────────────────────────────────────────────────────────
const aptitude: SeedRow[] = [
  { question: 'A train crosses a platform of length 400 m in 40 s moving at 72 km/h. What is the length of the train?', options: m(['400 m', '440 m', '360 m', '480 m']), answer: '400 m', explanation: '72 km/h = 20 m/s; total distance = 20 × 40 = 800 m; train = 800 − 400 = 400 m.', difficulty: M, subject: 'Quantitative Aptitude', tags: ['speed-time-distance'], level: 'entry' },
  { question: 'The average of 5 numbers is 27. If one number is excluded, the average becomes 25. What is the excluded number?', options: m(['35', '33', '37', '31']), answer: '35', explanation: 'Sum of 5 = 135; sum of 4 = 100; excluded = 135 − 100 = 35.', difficulty: E, subject: 'Quantitative Aptitude', tags: ['averages'], level: 'entry' },
  { question: 'A shopkeeper sells an article at a 20% profit. If the cost price is ₹500, what is the selling price?', options: m(['₹550', '₹600', '₹620', '₹580']), answer: '₹600', explanation: 'SP = 500 × 1.20 = ₹600.', difficulty: E, subject: 'Quantitative Aptitude', tags: ['profit-loss'], level: 'entry' },
  { question: 'How many 3-digit numbers are divisible by 5?', options: m(['180', '190', '200', '170']), answer: '180', explanation: 'From 100 to 999, multiples of 5: floor(999/5) − floor(99/5) = 199 − 19 = 180.', difficulty: M, subject: 'Quantitative Aptitude', tags: ['number-system'], level: 'entry' },
  { question: 'Pipes A and B together fill a tank in 12 minutes. Pipe A alone fills it in 20 minutes. How long does pipe B alone take?', options: m(['25 min', '30 min', '28 min', '24 min']), answer: '30 min', explanation: '1/B = 1/12 − 1/20 = 5/60 − 3/60 = 2/60 = 1/30 ⇒ B = 30 min.', difficulty: M, subject: 'Quantitative Aptitude', tags: ['pipes-cisterns'], level: 'entry' },
  { question: 'If x + 1/x = 3, what is x² + 1/x²?', options: m(['7', '9', '11', '5']), answer: '7', explanation: '(x + 1/x)² = x² + 2 + 1/x² = 9 ⇒ x² + 1/x² = 7.', difficulty: M, subject: 'Quantitative Aptitude', tags: ['algebra'], level: 'entry' },
  { question: 'Statement: All planets are round. Some round things are shiny. Conclusion I: Some planets are shiny. Conclusion II: Some round things are planets. Which follows?', options: m(['Only I', 'Only II', 'Both', 'Neither']), answer: 'Only II', explanation: 'Some round things are planets follows by conversion of "All planets are round". No shiny↔planet link.', difficulty: M, subject: 'Logical Reasoning', tags: ['syllogism'], level: 'entry' },
  { question: 'Find the odd one out: 121, 144, 169, 181', options: m(['121', '144', '169', '181']), answer: '181', explanation: '121, 144, 169 are perfect squares (11², 12², 13²); 181 is not.', difficulty: E, subject: 'Logical Reasoning', tags: ['odd-one-out'], level: 'entry' },
  { question: 'In a certain code, MOBILE is written as NPCJMF. How is COMPUTER written?', options: m(['DPNQVTFS', 'DONQVUFS', 'DPNQUSF', 'DPNQVTFR']), answer: 'DPNQVTFS', explanation: 'Each letter shifts +1: C→D, O→P, M→N, P→Q, U→V, T→U, E→F, R→S.', difficulty: M, subject: 'Logical Reasoning', tags: ['coding-decoding'], level: 'entry' },
  { question: 'Ramesh is 8th from the left end of a row and 12th from the right. How many people are in the row?', options: m(['18', '19', '20', '21']), answer: '19', explanation: 'Total = 8 + 12 − 1 = 19.', difficulty: E, subject: 'Logical Reasoning', tags: ['rank-order'], level: 'entry' },
  { question: 'Select the synonym of "Candid".', options: m(['Secretive', 'Frank', 'Rude', 'Cautious']), answer: 'Frank', explanation: 'Candid means frank, open, and honest.', difficulty: E, subject: 'Verbal Ability', tags: ['synonyms'], level: 'entry' },
  { question: 'Choose the correctly spelled word.', options: m(['Accomodation', 'Accommodation', 'Acommodation', 'Accomodatian']), answer: 'Accommodation', explanation: 'Accommodation has double c and double m.', difficulty: E, subject: 'Verbal Ability', tags: ['spelling'], level: 'entry' },
  { question: 'If 40% of a number is 240, what is the number?', options: m(['500', '600', '700', '480']), answer: '600', explanation: 'n × 0.40 = 240 ⇒ n = 600.', difficulty: E, subject: 'Quantitative Aptitude', tags: ['percentages'], level: 'entry' },
  { question: 'A man cycles 24 km in 1.5 hours. What is his average speed?', options: m(['12 km/h', '16 km/h', '18 km/h', '14 km/h']), answer: '16 km/h', explanation: 'Speed = 24 / 1.5 = 16 km/h.', difficulty: E, subject: 'Quantitative Aptitude', tags: ['speed-time-distance'], level: 'entry' },
  { question: 'The compound interest on ₹2000 at 10% per annum for 2 years compounded annually is:', options: m(['₹410', '₹420', '₹400', '₹440']), answer: '₹420', explanation: 'A = 2000(1.1)² = 2420; CI = 2420 − 2000 = ₹420.', difficulty: M, subject: 'Quantitative Aptitude', tags: ['compound-interest'], level: 'entry' },
  { question: 'Directions: A, B, C, D, E stand in a line. C is to the immediate right of B, and B is between A and C. E is at one extreme. Who is at the other extreme if D is between C and E?', options: m(['A', 'B', 'C', 'D']), answer: 'A', explanation: 'Order is A-B-C-D-E, so A is the other extreme.', difficulty: H, subject: 'Logical Reasoning', tags: ['arrangement'], level: 'entry' },
  { question: 'Pick the analogy: Doctor : Hospital :: Teacher : ?', options: m(['School', 'Classroom', 'Books', 'Students']), answer: 'School', explanation: 'A doctor works in a hospital; a teacher works in a school.', difficulty: E, subject: 'Verbal Ability', tags: ['analogy'], level: 'entry' },
  { question: 'The next number in the sequence 3, 5, 9, 17, 33 is:', options: m(['65', '63', '61', '67']), answer: '65', explanation: 'Each term doubles minus 1: 33 × 2 − 1 = 65.', difficulty: M, subject: 'Quantitative Aptitude', tags: ['series'], level: 'entry' },
]

// ────────────────────────────────────────────────────────────────────────────
// CSE — Data Structures, OS, DBMS, Networks, OOP, Web, TOC, Software Engg
// ────────────────────────────────────────────────────────────────────────────
const cse: SeedRow[] = [
  { question: 'What is the worst-case time complexity of quicksort?', options: m(['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)']), answer: 'O(n²)', explanation: 'Worst case (e.g., already sorted with bad pivot) is O(n²).', difficulty: M, subject: 'Data Structures & Algorithms', tags: ['sorting'], level: 'entry' },
  { question: 'A queue supports which two primary operations?', options: m(['push/pop', 'enqueue/dequeue', 'insert/delete', 'add/remove']), answer: 'enqueue/dequeue', explanation: 'Queue is FIFO: enqueue at rear, dequeue at front.', difficulty: E, subject: 'Data Structures & Algorithms', tags: ['queue'], level: 'entry' },
  { question: 'Which tree guarantees O(log n) search in the worst case?', options: m(['Binary search tree', 'AVL tree', 'Binary tree', 'Expression tree']), answer: 'AVL tree', explanation: 'AVL self-balances to keep height O(log n).', difficulty: M, subject: 'Data Structures & Algorithms', tags: ['trees'], level: 'entry' },
  { question: 'In a min-heap, the smallest element is always at the:', options: m(['leaf', 'root', 'any node', 'rightmost node']), answer: 'root', explanation: 'Heap property keeps the minimum at the root.', difficulty: E, subject: 'Data Structures & Algorithms', tags: ['heap'], level: 'entry' },
  { question: 'Which process moves a process from memory to disk and back?', options: m(['Paging', 'Swapping', 'Fragmentation', 'Compaction']), answer: 'Swapping', explanation: 'Swapping is the movement of whole processes to/from secondary storage.', difficulty: M, subject: 'Operating Systems', tags: ['memory-management'], level: 'mid' },
  { question: 'Deadlock avoidance uses which algorithm?', options: m(['Banker\'s algorithm', 'Round robin', 'LRU', 'Optimal page replacement']), answer: 'Banker\'s algorithm', explanation: 'Banker\'s algorithm checks safe states before allocating resources.', difficulty: M, subject: 'Operating Systems', tags: ['deadlock'], level: 'mid' },
  { question: 'Which page replacement policy evicts the page not used for the longest time?', options: m(['FIFO', 'LRU', 'Second chance', 'Random']), answer: 'LRU', explanation: 'LRU (Least Recently Used) evicts the longest-unused page.', difficulty: M, subject: 'Operating Systems', tags: ['page-replacement'], level: 'mid' },
  { question: 'Which SQL command removes a table definition and all its data?', options: m(['DELETE', 'DROP', 'TRUNCATE', 'REMOVE']), answer: 'DROP', explanation: 'DROP TABLE removes the schema and data; DELETE/TRUNCATE only data.', difficulty: E, subject: 'Databases', tags: ['sql', 'ddl'], level: 'entry' },
  { question: 'A primary key is best described as:', options: m(['A column that may contain NULL', 'A unique identifier for each row', 'A duplicate-allowed index', 'A foreign key reference']), answer: 'A unique identifier for each row', explanation: 'Primary keys are unique and NOT NULL.', difficulty: E, subject: 'Databases', tags: ['sql', 'keys'], level: 'entry' },
  { question: 'Which normal form requires every non-prime attribute to be fully functionally dependent on the whole primary key?', options: m(['1NF', '2NF', '3NF', 'BCNF']), answer: '2NF', explanation: '2NF removes partial dependencies on a composite key.', difficulty: H, subject: 'Databases', tags: ['normalization'], level: 'mid' },
  { question: 'Which TCP/IP layer does the HTTP protocol belong to?', options: m(['Network', 'Transport', 'Application', 'Data Link']), answer: 'Application', explanation: 'HTTP is an application-layer protocol.', difficulty: E, subject: 'Computer Networks', tags: ['tcp-ip', 'http'], level: 'entry' },
  { question: 'What does ARP resolve?', options: m(['IP to MAC address', 'MAC to IP', 'Domain to IP', 'Port to service']), answer: 'IP to MAC address', explanation: 'ARP maps an IP address to a hardware (MAC) address on a LAN.', difficulty: M, subject: 'Computer Networks', tags: ['arp'], level: 'mid' },
  { question: 'UDP is preferred over TCP when:', options: m(['Reliability is critical', 'Low latency matters and some loss is tolerable', 'Large file transfer needed', 'Ordering must be guaranteed']), answer: 'Low latency matters and some loss is tolerable', explanation: 'UDP is connectionless, fast, and best-effort.', difficulty: E, subject: 'Computer Networks', tags: ['udp', 'tcp'], level: 'entry' },
  { question: 'Which of the following is a pure OOP concept in Java?', options: m(['Inheritance', 'Function pointer', 'Multiple inheritance of classes', 'Global variables']), answer: 'Inheritance', explanation: 'Java supports class inheritance; no multiple class inheritance or global functions.', difficulty: E, subject: 'Java', tags: ['java', 'oop'], level: 'entry' },
  { question: 'What does the "final" keyword on a method mean in Java?', options: m(['The method is abstract', 'The method cannot be overridden', 'The method is static', 'The method is private']), answer: 'The method cannot be overridden', explanation: 'final methods cannot be overridden by subclasses.', difficulty: E, subject: 'Java', tags: ['java', 'oop'], level: 'entry' },
  { question: 'In Python, which data structure is immutable?', options: m(['list', 'dict', 'tuple', 'set']), answer: 'tuple', explanation: 'Tuples are immutable sequences.', difficulty: E, subject: 'Programming in Python', tags: ['python'], level: 'entry' },
  { question: 'Which HTTP method is NOT idempotent?', options: m(['GET', 'PUT', 'POST', 'DELETE']), answer: 'POST', explanation: 'POST creates resources and may have side effects; GET/PUT/DELETE are idempotent.', difficulty: M, subject: 'Web Technologies', tags: ['http'], level: 'mid' },
  { question: 'What does CORS stand for?', options: m(['Cross-Origin Resource Sharing', 'Cross-Origin Request Security', 'Common Origin Resource System', 'Cross-Object Reference Sharing']), answer: 'Cross-Origin Resource Sharing', explanation: 'CORS controls cross-origin browser requests.', difficulty: M, subject: 'Web Technologies', tags: ['cors'], level: 'mid' },
  { question: 'Which language is NOT a regular language?', options: m(['a^n b^n (n≥1)', '(a|b)*abb', 'Strings ending in 00', 'Binary numbers divisible by 3']), answer: 'a^n b^n (n≥1)', explanation: 'aⁿbⁿ requires counting, which a finite automaton cannot do.', difficulty: H, subject: 'Theory of Computation', tags: ['regular-languages'], level: 'mid' },
  { question: 'The complement of a DFA\'s language is obtained by:', options: m(['Swapping final and non-final states', 'Reversing the transitions', 'Adding more states', 'Duplicating the start state']), answer: 'Swapping final and non-final states', explanation: 'Complement of a DFA swaps accepting and non-accepting states.', difficulty: M, subject: 'Theory of Computation', tags: ['dfa'], level: 'mid' },
  { question: 'Which SDLC model is best when requirements are clear and stable?', options: m(['Waterfall', 'Spiral', 'Iterative', 'Agile']), answer: 'Waterfall', explanation: 'Waterfall suits well-defined, stable requirements.', difficulty: E, subject: 'Software Engineering', tags: ['sdlc'], level: 'entry' },
  { question: 'What is a microservice?', options: m(['A single monolithic deployable', 'An independently deployable service focused on one capability', 'A type of database', 'A UI framework']), answer: 'An independently deployable service focused on one capability', explanation: 'Microservices are small, independently deployable services.', difficulty: M, subject: 'Software Engineering', tags: ['microservices'], level: 'mid' },
  { question: 'Which data structure is ideal for implementing an LRU cache?', options: m(['Hash map + doubly linked list', 'Stack', 'Array only', 'Binary search tree']), answer: 'Hash map + doubly linked list', explanation: 'O(1) get/put with LRU eviction uses a hash map with a doubly linked list.', difficulty: H, subject: 'Data Structures & Algorithms', tags: ['cache', 'lru'], level: 'senior' },
  { question: 'The time complexity of Dijkstra\'s algorithm with a binary heap is:', options: m(['O(V²)', 'O((V+E) log V)', 'O(E)', 'O(V+E)']), answer: 'O((V+E) log V)', explanation: 'Binary-heap Dijkstra runs in O((V+E) log V).', difficulty: H, subject: 'Data Structures & Algorithms', tags: ['graph'], level: 'mid' },
  { question: 'Which command in git creates a new branch and switches to it?', options: m(['git branch new', 'git checkout -b new', 'git switch main', 'git merge new']), answer: 'git checkout -b new', explanation: 'git checkout -b creates and switches to a new branch.', difficulty: E, subject: 'Programming in C/Java/Python', tags: ['git'], level: 'entry' },
  { question: 'In a DDL trigger vs DML trigger, which fires in response to data changes?', options: m(['DDL trigger', 'DML trigger', 'Both equally', 'Neither']), answer: 'DML trigger', explanation: 'DML triggers fire on INSERT/UPDATE/DELETE data changes.', difficulty: M, subject: 'Databases', tags: ['triggers'], level: 'mid' },
  { question: 'Which Linux command shows running processes with CPU/memory usage?', options: m(['ls', 'top', 'chmod', 'grep']), answer: 'top', explanation: 'top shows live process CPU/memory usage.', difficulty: E, subject: 'Operating Systems', tags: ['linux'], level: 'entry' },
  { question: 'What is the purpose of the "docker-compose.yml" file?', options: m(['To define and run multi-container Docker apps', 'To store environment secrets only', 'To compile source code', 'To configure DNS']), answer: 'To define and run multi-container Docker apps', explanation: 'Docker Compose orchestrates multi-container applications via YAML.', difficulty: M, subject: 'Cloud & DevOps', tags: ['docker'], level: 'mid' },
  { question: 'Which tool is a container orchestration platform?', options: m(['Kubernetes', 'Webpack', 'Babel', 'Terraform']), answer: 'Kubernetes', explanation: 'Kubernetes orchestrates containerized workloads at scale.', difficulty: E, subject: 'Cloud & DevOps', tags: ['kubernetes'], level: 'mid' },
  { question: 'In REST, which status code indicates a resource was created?', options: m(['200', '201', '204', '302']), answer: '201', explanation: '201 Created is returned after successful resource creation.', difficulty: M, subject: 'Web Technologies', tags: ['rest'], level: 'entry' },
  { question: 'What does the SQL query "SELECT COUNT(*) FROM orders GROUP BY customer_id" do?', options: m(['Counts orders per customer', 'Counts distinct customers', 'Sums order values', 'Counts total rows once']), answer: 'Counts orders per customer', explanation: 'GROUP BY customer_id with COUNT(*) returns order count per customer.', difficulty: M, subject: 'Databases', tags: ['sql', 'group-by'], level: 'mid' },
]

// ────────────────────────────────────────────────────────────────────────────
// IT — Web, DBMS, Networks, OS, Cloud, DSA, DevOps
// ────────────────────────────────────────────────────────────────────────────
const it: SeedRow[] = [
  { question: 'Which HTML tag defines an unordered list?', options: m(['<ol>', '<ul>', '<li>', '<dl>']), answer: '<ul>', explanation: '<ul> renders an unordered (bulleted) list.', difficulty: E, subject: 'Web Technologies', tags: ['html'], level: 'entry' },
  { question: 'What does "responsive design" primarily mean?', options: m(['Design that adapts layout to screen size', 'Design with fast load times', 'Design that works offline', 'Design with animations']), answer: 'Design that adapts layout to screen size', explanation: 'Responsive design adapts the layout to different viewport sizes.', difficulty: E, subject: 'Web Technologies', tags: ['css'], level: 'entry' },
  { question: 'Which of the following is a NoSQL document database?', options: m(['PostgreSQL', 'MongoDB', 'Oracle', 'MySQL']), answer: 'MongoDB', explanation: 'MongoDB stores documents in JSON-like BSON format.', difficulty: E, subject: 'Databases', tags: ['nosql'], level: 'entry' },
  { question: 'What is the primary role of a web browser\'s DOM?', options: m(['Parsing and rendering the HTML document as an object tree', 'Compiling JavaScript to machine code', 'Managing the database connection', 'Encrypting network traffic']), answer: 'Parsing and rendering the HTML document as an object tree', explanation: 'DOM is the parsed representation of the document a script can manipulate.', difficulty: M, subject: 'Web Technologies', tags: ['dom'], level: 'entry' },
  { question: 'Which protocol provides a secure channel for web traffic?', options: m(['HTTP', 'TLS/SSL', 'FTP', 'SMTP']), answer: 'TLS/SSL', explanation: 'TLS/SSL encrypts traffic between client and server (HTTPS).', difficulty: E, subject: 'Computer Networks', tags: ['tls'], level: 'entry' },
  { question: 'In version control, what is "rebase"?', options: m(['Moving commits onto a new base commit', 'Deleting a branch', 'Creating a merge commit', 'Stashing changes']), answer: 'Moving commits onto a new base commit', explanation: 'Rebase replays commits onto a different base, keeping a linear history.', difficulty: M, subject: 'Software Engineering', tags: ['git'], level: 'mid' },
  { question: 'Which layer of the OSI model provides routing?', options: m(['Physical', 'Network', 'Session', 'Presentation']), answer: 'Network', explanation: 'The Network layer routes packets between networks.', difficulty: E, subject: 'Computer Networks', tags: ['osi'], level: 'entry' },
  { question: 'What is the purpose of a reverse proxy?', options: m(['To forward client requests to backend servers', 'To replace the database', 'To cache only static images', 'To compile frontend code']), answer: 'To forward client requests to backend servers', explanation: 'A reverse proxy fronts backend servers, adding load balancing, caching, and TLS.', difficulty: M, subject: 'Cloud & DevOps', tags: ['proxy'], level: 'mid' },
  { question: 'Which command initializes a new Git repository?', options: m(['git init', 'git start', 'git new', 'git create']), answer: 'git init', explanation: 'git init creates a new repository in the current directory.', difficulty: E, subject: 'Software Engineering', tags: ['git'], level: 'entry' },
  { question: 'What does "CI" in CI/CD stand for?', options: m(['Continuous Integration', 'Code Inspection', 'Continuous Interface', 'Computer Integration']), answer: 'Continuous Integration', explanation: 'CI automatically integrates and tests code changes.', difficulty: E, subject: 'Cloud & DevOps', tags: ['cicd'], level: 'mid' },
  { question: 'Which HTTP caching header tells the client to cache a response until a date?', options: m(['Expires', 'Cache-Control: no-cache', 'ETag', 'Vary']), answer: 'Expires', explanation: 'Expires sets an absolute cache expiry date/time.', difficulty: M, subject: 'Web Technologies', tags: ['caching'], level: 'mid' },
  { question: 'What is the default port for HTTPS?', options: m(['80', '443', '8080', '22']), answer: '443', explanation: 'HTTPS uses port 443.', difficulty: E, subject: 'Computer Networks', tags: ['ports'], level: 'entry' },
  { question: 'Which of the following is a message queue?', options: m(['RabbitMQ', 'Redis Cache only', 'Nginx', 'Grafana']), answer: 'RabbitMQ', explanation: 'RabbitMQ is a message broker for asynchronous communication.', difficulty: M, subject: 'Cloud & DevOps', tags: ['messaging'], level: 'mid' },
  { question: 'Which command in Linux changes file permissions?', options: m(['chmod', 'chown', 'mv', 'touch']), answer: 'chmod', explanation: 'chmod modifies file access permissions.', difficulty: E, subject: 'Operating Systems', tags: ['linux'], level: 'entry' },
  { question: 'The main purpose of an index on a database column is to:', options: m(['Speed up queries on that column', 'Add a primary key', 'Encrypt the column', 'Enforce uniqueness always']), answer: 'Speed up queries on that column', explanation: 'Indexes accelerate lookups at the cost of slower writes.', difficulty: E, subject: 'Databases', tags: ['indexes'], level: 'entry' },
  { question: 'Which JavaScript method converts a JSON string to an object?', options: m(['JSON.parse()', 'JSON.stringify()', 'JSON.toObject()', 'JSON.decode()']), answer: 'JSON.parse()', explanation: 'JSON.parse converts JSON text into a JS object.', difficulty: E, subject: 'Web Technologies', tags: ['javascript'], level: 'entry' },
  { question: 'What does the "&&" operator do in a shell command chain?', options: m(['Run the next command only if the previous succeeded', 'Run commands in parallel', 'Redirect output', 'Comment out the command']), answer: 'Run the next command only if the previous succeeded', explanation: '&& short-circuits: the next command runs only on success.', difficulty: E, subject: 'Cloud & DevOps', tags: ['shell'], level: 'entry' },
  { question: 'Which protocol resolves a domain name to an IP address?', options: m(['DNS', 'DHCP', 'SNMP', 'SMTP']), answer: 'DNS', explanation: 'DNS translates domain names to IP addresses.', difficulty: E, subject: 'Computer Networks', tags: ['dns'], level: 'entry' },
  { question: 'What is the difference between authentication and authorization?', options: m(['AuthN verifies identity; AuthZ grants permissions', 'They are identical', 'AuthZ verifies identity; AuthN grants permissions', 'Both manage encryption keys']), answer: 'AuthN verifies identity; AuthZ grants permissions', explanation: 'Authentication = who you are; Authorization = what you can do.', difficulty: E, subject: 'Software Engineering', tags: ['security'], level: 'entry' },
  { question: 'Which cloud service model provides virtual machines (e.g., AWS EC2)?', options: m(['IaaS', 'PaaS', 'SaaS', 'FaaS']), answer: 'IaaS', explanation: 'IaaS provides raw compute/storage infrastructure.', difficulty: E, subject: 'Cloud & DevOps', tags: ['cloud'], level: 'entry' },
]

// ────────────────────────────────────────────────────────────────────────────
// ECE — Signals, Digital, Analog, Communication, Microprocessors, Control
// ────────────────────────────────────────────────────────────────────────────
const ece: SeedRow[] = [
  { question: 'Which gate produces HIGH only when all inputs are HIGH?', options: m(['AND', 'OR', 'NAND', 'XOR']), answer: 'AND', explanation: 'AND outputs 1 only when all inputs are 1.', difficulty: E, subject: 'Digital Electronics', tags: ['logic-gates'], level: 'entry' },
  { question: 'What is the main advantage of FM over AM?', options: m(['Better noise immunity', 'Simpler receiver', 'Less bandwidth', 'Lower power']), answer: 'Better noise immunity', explanation: 'FM is more robust against amplitude noise.', difficulty: M, subject: 'Communication Systems', tags: ['modulation'], level: 'entry' },
  { question: 'The Laplace transform of the impulse function δ(t) is:', options: m(['1', '1/s', 's', 'e^-st']), answer: '1', explanation: 'L{δ(t)} = 1.', difficulty: E, subject: 'Signals & Systems', tags: ['laplace'], level: 'entry' },
  { question: 'A 4-bit ADC has how many possible output levels?', options: m(['8', '16', '32', '64']), answer: '16', explanation: '2⁴ = 16 distinct levels.', difficulty: E, subject: 'Analog Electronics', tags: ['adc'], level: 'entry' },
  { question: 'What is the characteristic impedance of free space?', options: m(['50 Ω', '75 Ω', '377 Ω', '120 Ω']), answer: '377 Ω', explanation: 'Free-space impedance Z₀ ≈ 377 Ω.', difficulty: M, subject: 'Electromagnetic Theory', tags: ['impedance'], level: 'mid' },
  { question: 'Which type of flip-flop changes state on the clock edge and has no indeterminate state?', options: m(['SR latch', 'D flip-flop', 'JK flip-flop', 'T flip-flop']), answer: 'JK flip-flop', explanation: 'JK avoids the invalid SR state and can toggle.', difficulty: M, subject: 'Digital Electronics', tags: ['flip-flops'], level: 'mid' },
  { question: 'The Fourier transform of a rectangular pulse is:', options: m(['Sinc function', 'Gaussian', 'Impulse train', 'Exponential']), answer: 'Sinc function', explanation: 'Rect ↔ sinc under Fourier transform.', difficulty: M, subject: 'Signals & Systems', tags: ['fourier'], level: 'mid' },
  { question: 'Which processor register holds the address of the next instruction?', options: m(['Program counter', 'Accumulator', 'Stack pointer', 'Status register']), answer: 'Program counter', explanation: 'The PC holds the address of the next instruction to fetch.', difficulty: E, subject: 'Microprocessors', tags: ['cpu-registers'], level: 'entry' },
  { question: 'What is the bandwidth of a signal sampled at 8 kHz with no aliasing?', options: m(['4 kHz', '8 kHz', '16 kHz', '2 kHz']), answer: '4 kHz', explanation: 'fs ≥ 2·fmax ⇒ fmax ≤ 4 kHz.', difficulty: M, subject: 'Signals & Systems', tags: ['sampling'], level: 'entry' },
  { question: 'Which amplifier has voltage gain approximately 1 and high input impedance?', options: m(['Common base', 'Emitter follower', 'Common emitter', 'Common collector']), answer: 'Emitter follower', explanation: 'The common-collector (emitter follower) has unity gain and high Zin.', difficulty: M, subject: 'Analog Electronics', tags: ['amplifiers'], level: 'mid' },
  { question: 'The feedback used in an oscillator to sustain oscillations is:', options: m(['Negative with 180° phase', 'Positive with loop gain ≥ 1', 'No feedback', 'Only DC feedback']), answer: 'Positive with loop gain ≥ 1', explanation: 'Barkhausen criterion: |Aβ| ≥ 1 with 0° total phase shift.', difficulty: M, subject: 'Analog Electronics', tags: ['oscillators'], level: 'mid' },
  { question: 'Which of the following is a unipolar device?', options: m(['BJT', 'MOSFET', 'SCR', 'Diode']), answer: 'MOSFET', explanation: 'MOSFETs are unipolar (single-carrier) devices.', difficulty: E, subject: 'Electronic Devices', tags: ['transistors'], level: 'entry' },
  { question: 'The transfer function of a system is the ratio of output to input in which domain?', options: m(['Laplace domain (s)', 'Time domain', 'Frequency domain only', 'Discrete domain']), answer: 'Laplace domain (s)', explanation: 'Transfer functions are defined in the s-domain.', difficulty: E, subject: 'Control Systems', tags: ['transfer-function'], level: 'mid' },
  { question: 'Which modulation is used in AM radio broadcast?', options: m(['Amplitude modulation', 'Frequency modulation', 'Phase modulation', 'Pulse code modulation']), answer: 'Amplitude modulation', explanation: 'AM broadcast radio uses amplitude modulation.', difficulty: E, subject: 'Communication Systems', tags: ['am'], level: 'entry' },
  { question: 'In 8051 microcontroller, how many timer/counter units are present?', options: m(['1', '2', '3', '4']), answer: '2', explanation: 'The 8051 has two timers/counters (Timer 0 and Timer 1).', difficulty: E, subject: 'Microprocessors', tags: ['8051'], level: 'mid' },
  { question: 'What is the decimal equivalent of the binary number 101101?', options: m(['43', '45', '53', '51']), answer: '45', explanation: '32 + 8 + 4 + 1 = 45.', difficulty: E, subject: 'Digital Electronics', tags: ['binary'], level: 'entry' },
  { question: 'A sine wave of 100 Hz passed through an ideal differentiator produces:', options: m(['A cosine of 100 Hz scaled by 2πf', 'A DC signal', 'A square wave', 'Half the frequency']), answer: 'A cosine of 100 Hz scaled by 2πf', explanation: 'd/dt[sin(ωt)] = ω·cos(ωt), scaling by ω = 2πf.', difficulty: H, subject: 'Signals & Systems', tags: ['differentiator'], level: 'mid' },
  { question: 'Which filter type has a flat passband and sharpest roll-off for a given order?', options: m(['Butterworth', 'Chebyshev', 'Bessel', 'All same']), answer: 'Chebyshev', explanation: 'Chebyshev filters have steeper roll-off than Butterworth at the cost of passband ripple.', difficulty: H, subject: 'Analog Electronics', tags: ['filters'], level: 'senior' },
]

// ────────────────────────────────────────────────────────────────────────────
// EEE — Circuits, Machines, Power Systems, Control, Power Electronics
// ────────────────────────────────────────────────────────────────────────────
const eee: SeedRow[] = [
  { question: 'Which law states that the algebraic sum of currents at a node is zero?', options: m(['KVL', 'KCL', 'Ohm\'s law', 'Faraday\'s law']), answer: 'KCL', explanation: 'KCL = current conservation at a node.', difficulty: E, subject: 'Circuit Theory', tags: ['kcl'], level: 'entry' },
  { question: 'The frequency of the rotor currents of an induction motor depends on:', options: m(['Slip', 'Stator resistance', 'Rotor diameter', 'Supply voltage only']), answer: 'Slip', explanation: 'Rotor frequency fr = s·fs.', difficulty: M, subject: 'Electrical Machines', tags: ['induction-motor'], level: 'mid' },
  { question: 'Which device converts AC to DC?', options: m(['Inverter', 'Rectifier', 'Transformer', 'Chopper']), answer: 'Rectifier', explanation: 'A rectifier converts AC to DC.', difficulty: E, subject: 'Power Electronics', tags: ['rectifier'], level: 'entry' },
  { question: 'The skin effect is more pronounced at:', options: m(['Higher frequencies', 'Lower frequencies', 'DC', 'All frequencies equally']), answer: 'Higher frequencies', explanation: 'Skin effect increases with frequency, concentrating current near the surface.', difficulty: M, subject: 'Electromagnetic Theory', tags: ['skin-effect'], level: 'mid' },
  { question: 'The synchronous speed of a 4-pole, 50 Hz motor is:', options: m(['1500 rpm', '3000 rpm', '750 rpm', '1000 rpm']), answer: '1500 rpm', explanation: 'Ns = 120·f/P = 120×50/4 = 1500 rpm.', difficulty: M, subject: 'Electrical Machines', tags: ['synchronous-speed'], level: 'entry' },
  { question: 'In a star-connected system, line voltage is related to phase voltage as:', options: m(['VL = √3·Vph', 'VL = Vph', 'VL = 3·Vph', 'VL = Vph/√3']), answer: 'VL = √3·Vph', explanation: 'Line voltage leads phase voltage by 30° and is √3 times larger in a balanced star.', difficulty: M, subject: 'Power Systems', tags: ['three-phase'], level: 'entry' },
  { question: 'Which relay is used to protect a transformer against internal faults?', options: m(['Buchholz relay', 'Distance relay', 'Overcurrent relay', 'Frequency relay']), answer: 'Buchholz relay', explanation: 'The Buchholz relay detects gas accumulation from internal transformer faults.', difficulty: M, subject: 'Power Systems', tags: ['protection'], level: 'mid' },
  { question: 'The unit of magnetic flux is:', options: m(['Tesla', 'Weber', 'Henry', 'Gauss']), answer: 'Weber', explanation: 'Magnetic flux is measured in webers (Wb).', difficulty: E, subject: 'Circuit Theory', tags: ['magnetism'], level: 'entry' },
  { question: 'Which of the following is a constant speed AC motor?', options: m(['Synchronous motor', 'Induction motor', 'DC series motor', 'Repulsion motor']), answer: 'Synchronous motor', explanation: 'Synchronous motors run at exactly synchronous speed regardless of load (within limits).', difficulty: M, subject: 'Electrical Machines', tags: ['synchronous-motor'], level: 'mid' },
  { question: 'For maximum power transfer, the load resistance should equal:', options: m(['Source internal resistance', 'Twice source resistance', 'Half source resistance', 'Zero']), answer: 'Source internal resistance', explanation: 'Maximum power transfer occurs when RL = Rs.', difficulty: M, subject: 'Circuit Theory', tags: ['power-transfer'], level: 'entry' },
  { question: 'A chopper is a static device that converts:', options: m(['Fixed DC to variable DC', 'AC to DC', 'DC to AC', 'AC to AC']), answer: 'Fixed DC to variable DC', explanation: 'Choppers vary DC voltage level (DC-DC).', difficulty: M, subject: 'Power Electronics', tags: ['chopper'], level: 'mid' },
  { question: 'Which instrument measures electrical energy consumption?', options: m(['Wattmeter', 'Energy meter', 'Ammeter', 'Ohmmeter']), answer: 'Energy meter', explanation: 'Energy meters record kWh consumption.', difficulty: E, subject: 'Electrical Measurements', tags: ['instruments'], level: 'entry' },
  { question: 'In a power system, reactive power is measured in:', options: m(['VAR', 'Watt', 'kWh', 'Ohm']), answer: 'VAR', explanation: 'Reactive power is measured in volt-ampere reactive (VAR).', difficulty: E, subject: 'Power Systems', tags: ['reactive-power'], level: 'entry' },
  { question: 'The open-loop transfer function of a unity-feedback system is K/(s(s+2)). For a type-1 system, the velocity error constant Kv is:', options: m(['K/2', 'K', '2K', 'K/4']), answer: 'K/2', explanation: 'Kv = lim s→0 s·G(s) = K/2.', difficulty: H, subject: 'Control Systems', tags: ['error-constants'], level: 'senior' },
  { question: 'Which device is used for stepping up voltage in transmission?', options: m(['Transformer', 'Rectifier', 'Inductor', 'Relay']), answer: 'Transformer', explanation: 'Transformers step voltage up/down via electromagnetic induction.', difficulty: E, subject: 'Electrical Machines', tags: ['transformer'], level: 'entry' },
  { question: 'Power factor is the cosine of the phase angle between:', options: m(['Voltage and current', 'Active and reactive power only', 'Resistance and reactance', 'Frequency and speed']), answer: 'Voltage and current', explanation: 'PF = cos(φ) where φ is the voltage-current phase difference.', difficulty: E, subject: 'Electrical Measurements', tags: ['power-factor'], level: 'entry' },
]

// ────────────────────────────────────────────────────────────────────────────
// MECH — Thermodynamics, Fluid, SOM, Design, Manufacturing, ToM, Heat Transfer
// ────────────────────────────────────────────────────────────────────────────
const mech: SeedRow[] = [
  { question: 'Which thermodynamic process has zero heat transfer?', options: m(['Adiabatic', 'Isothermal', 'Isobaric', 'Isochoric']), answer: 'Adiabatic', explanation: 'Adiabatic processes have Q = 0.', difficulty: E, subject: 'Thermodynamics', tags: ['adiabatic'], level: 'entry' },
  { question: 'Bernoulli\'s equation is based on which principle?', options: m(['Conservation of energy', 'Conservation of momentum', 'Conservation of mass', 'Newton\'s third law']), answer: 'Conservation of energy', explanation: 'Bernoulli relates pressure, velocity, and height via energy conservation.', difficulty: E, subject: 'Fluid Mechanics', tags: ['bernoulli'], level: 'entry' },
  { question: 'What is the unit of stress?', options: m(['N/m²', 'N·m', 'N/m', 'kg/m³']), answer: 'N/m²', explanation: 'Stress = force/area = Pa (N/m²).', difficulty: E, subject: 'Strength of Materials', tags: ['stress'], level: 'entry' },
  { question: 'The property that measures a material\'s resistance to indentation is:', options: m(['Hardness', 'Toughness', 'Ductility', 'Malleability']), answer: 'Hardness', explanation: 'Hardness resists surface indentation.', difficulty: E, subject: 'Strength of Materials', tags: ['hardness'], level: 'entry' },
  { question: 'In a Carnot cycle, the efficiency depends on:', options: m(['Source and sink temperatures', 'Working fluid', 'Pressure ratio only', 'Engine speed']), answer: 'Source and sink temperatures', explanation: 'η = 1 − T2/T1.', difficulty: M, subject: 'Thermodynamics', tags: ['carnot'], level: 'mid' },
  { question: 'Which gear type transmits power between non-parallel, intersecting shafts?', options: m(['Bevel gear', 'Helical gear', 'Worm gear', 'Spur gear']), answer: 'Bevel gear', explanation: 'Bevel gears connect intersecting (usually 90°) shafts.', difficulty: M, subject: 'Theory of Machines', tags: ['gears'], level: 'mid' },
  { question: 'The Nusselt number represents the ratio of:', options: m(['Convective to conductive heat transfer', 'Inertia to viscous forces', 'Reynolds to Prandtl', 'Heat capacity to thermal conductivity']), answer: 'Convective to conductive heat transfer', explanation: 'Nu = hL/k compares convection to conduction.', difficulty: M, subject: 'Heat Transfer', tags: ['nusselt'], level: 'mid' },
  { question: 'Which casting process uses a rotating mold to form hollow parts?', options: m(['Centrifugal casting', 'Sand casting', 'Die casting', 'Investment casting']), answer: 'Centrifugal casting', explanation: 'Centrifugal casting uses rotation to distribute metal in a hollow shape.', difficulty: M, subject: 'Manufacturing Processes', tags: ['casting'], level: 'mid' },
  { question: 'In turning operation, the feed direction of the tool is:', options: m(['Parallel to workpiece axis', 'Perpendicular to axis', 'Radial only', 'Axial only']), answer: 'Parallel to workpiece axis', explanation: 'Longitudinal feed moves the tool parallel to the workpiece axis.', difficulty: M, subject: 'Manufacturing Processes', tags: ['machining'], level: 'entry' },
  { question: 'The Euler\'s critical load formula applies to:', options: m(['Long slender columns', 'Short thick columns', 'Beams only', 'Torsion members']), answer: 'Long slender columns', explanation: 'Euler buckling applies to long slender columns.', difficulty: M, subject: 'Strength of Materials', tags: ['buckling'], level: 'mid' },
  { question: 'The Reynolds number below which pipe flow is laminar (commonly) is:', options: m(['2000', '4000', '10000', '100']), answer: '2000', explanation: 'Re < 2000 is typically laminar in pipes.', difficulty: E, subject: 'Fluid Mechanics', tags: ['reynolds-number'], level: 'entry' },
  { question: 'Which joint is used to connect two pipes end to end with threading?', options: m(['Threaded joint', 'Butt weld', 'Flanged joint', 'Riveted joint']), answer: 'Threaded joint', explanation: 'Threaded joints connect small pipes via external/internal threads.', difficulty: E, subject: 'Manufacturing Processes', tags: ['joints'], level: 'entry' },
  { question: 'The coefficient of performance (COP) of a refrigerator is the ratio of:', options: m(['Heat removed to work input', 'Work input to heat removed', 'Heat rejected to heat removed', 'Temperature rise to work']), answer: 'Heat removed to work input', explanation: 'COP_ref = QL / W.', difficulty: M, subject: 'Thermodynamics', tags: ['refrigeration'], level: 'mid' },
  { question: 'In a 4-stroke SI engine, the ignition of the air-fuel mixture happens during which stroke?', options: m(['Power stroke', 'Compression stroke', 'Intake stroke', 'Exhaust stroke']), answer: 'Power stroke', explanation: 'Ignition occurs near the end of compression, driving the power stroke.', difficulty: M, subject: 'IC Engines', tags: ['ic-engines'], level: 'entry' },
  { question: 'Which welding process is preferred for thin stainless steel sheets requiring precise control?', options: m(['TIG', 'MIG', 'Submerged arc', 'Electroslag']), answer: 'TIG', explanation: 'TIG (GTAW) gives precise control, ideal for thin stainless.', difficulty: M, subject: 'Manufacturing Processes', tags: ['welding'], level: 'mid' },
  { question: 'The unit of dynamic viscosity is:', options: m(['Pa·s', 'm²/s', 'kg/m', 'N·s/m']), answer: 'Pa·s', explanation: 'Dynamic viscosity μ has units of Pa·s.', difficulty: E, subject: 'Fluid Mechanics', tags: ['viscosity'], level: 'entry' },
]

// ────────────────────────────────────────────────────────────────────────────
// CIVIL — Structural, Concrete, Geotech, Fluid, Environment, Surveying, Transport
// ────────────────────────────────────────────────────────────────────────────
const civil: SeedRow[] = [
  { question: 'The stress-strain curve of concrete up to about 30% of ultimate strength is:', options: m(['Linear', 'Parabolic', 'Exponential', 'Discontinuous']), answer: 'Linear', explanation: 'Concrete behaves nearly elastically at low stress.', difficulty: M, subject: 'Concrete Technology', tags: ['concrete'], level: 'entry' },
  { question: 'Which of the following tests is used to measure workability of fresh concrete?', options: m(['Slump test', 'Crushing test', 'Tensile test', 'Soundness test']), answer: 'Slump test', explanation: 'The slump test measures fresh-concrete workability.', difficulty: E, subject: 'Concrete Technology', tags: ['slump'], level: 'entry' },
  { question: 'The bending moment diagram of a simply supported beam with a central point load is:', options: m(['Triangular', 'Rectangular', 'Parabolic', 'Trapezoidal']), answer: 'Triangular', explanation: 'Central point load yields a triangular BM diagram with peak PL/4.', difficulty: M, subject: 'Structural Analysis', tags: ['bending-moment'], level: 'entry' },
  { question: 'Which soil property indicates the water content at which a soil transitions from liquid to plastic state?', options: m(['Liquid limit', 'Plastic limit', 'Shrinkage limit', 'Optimum moisture content']), answer: 'Liquid limit', explanation: 'The liquid limit is the boundary between liquid and plastic states.', difficulty: M, subject: 'Geotechnical Engineering', tags: ['atterberg'], level: 'mid' },
  { question: 'The hydraulic gradient in a pipe flow is the slope of:', options: m(['Piezometric head line', 'Energy line', 'Bed line', 'Velocity profile']), answer: 'Piezometric head line', explanation: 'The hydraulic gradient line plots pressure + elevation head.', difficulty: M, subject: 'Fluid Mechanics', tags: ['hydraulic-gradient'], level: 'mid' },
  { question: 'Which treatment step removes suspended solids in a water treatment plant?', options: m(['Sedimentation', 'Chlorination', 'Fluoridation', 'Aeration']), answer: 'Sedimentation', explanation: 'Sedimentation settles suspended solids by gravity.', difficulty: E, subject: 'Environmental Engineering', tags: ['water-treatment'], level: 'entry' },
  { question: 'The angle between the true north and magnetic meridian is called:', options: m(['Declination', 'Bearing', 'Azimuth', 'Inclination']), answer: 'Declination', explanation: 'Magnetic declination is the angle between true and magnetic north.', difficulty: M, subject: 'Surveying', tags: ['surveying'], level: 'mid' },
  { question: 'The design speed of a highway depends primarily on:', options: m(['Terrain and class of road', 'Vehicle color', 'Weather forecast', 'Number of lanes only']), answer: 'Terrain and class of road', explanation: 'Design speed is set by road class and terrain.', difficulty: E, subject: 'Transportation Engineering', tags: ['highways'], level: 'entry' },
  { question: 'Which IS code covers the design of reinforced concrete structures?', options: m(['IS 456', 'IS 800', 'IS 875', 'IS 10262']), answer: 'IS 456', explanation: 'IS 456:2000 governs plain and reinforced concrete design.', difficulty: M, subject: 'Structural Analysis', tags: ['is-codes'], level: 'mid' },
  { question: 'The phenomenon where excess pore water pressure develops in saturated soil under loading is:', options: m(['Consolidation', 'Permeability', 'Capillarity', 'Compaction']), answer: 'Consolidation', explanation: 'Consolidation involves gradual pore-water dissipation under sustained load.', difficulty: M, subject: 'Geotechnical Engineering', tags: ['consolidation'], level: 'mid' },
  { question: 'A cantilever beam loaded at the free end has maximum bending moment at:', options: m(['The fixed end', 'The free end', 'Midspan', 'Quarter span']), answer: 'The fixed end', explanation: 'Max BM = PL at the fixed support.', difficulty: E, subject: 'Structural Analysis', tags: ['cantilever'], level: 'entry' },
  { question: 'Which survey instrument is used to measure horizontal and vertical angles?', options: m(['Theodolite', 'Dumpy level', 'Compass', 'Plane table']), answer: 'Theodolite', explanation: 'A theodolite measures both horizontal and vertical angles.', difficulty: E, subject: 'Surveying', tags: ['theodolite'], level: 'entry' },
  { question: 'The void ratio of a soil is the ratio of:', options: m(['Volume of voids to volume of solids', 'Volume of water to volume of air', 'Weight of solids to total volume', 'Dry density to bulk density']), answer: 'Volume of voids to volume of solids', explanation: 'e = Vv/Vs.', difficulty: E, subject: 'Geotechnical Engineering', tags: ['void-ratio'], level: 'entry' },
  { question: 'The characteristic strength of concrete fck is defined at what percentile?', options: m(['95%', '50%', '99%', '75%']), answer: '95%', explanation: 'Characteristic strength is the 5% lower-fractile value (95% confidence).', difficulty: H, subject: 'Concrete Technology', tags: ['characteristic-strength'], level: 'mid' },
  { question: 'Which foundation is most economical for a light structure on good soil?', options: m(['Isolated footing', 'Pile foundation', 'Mat foundation', 'Raft foundation']), answer: 'Isolated footing', explanation: 'Isolated spread footings suit light loads on competent soil.', difficulty: E, subject: 'Geotechnical Engineering', tags: ['foundations'], level: 'entry' },
  { question: 'The maximum permissible crack width in reinforced concrete (general) as per IS 456 is:', options: m(['0.3 mm', '1 mm', '0.05 mm', '5 mm']), answer: '0.3 mm', explanation: 'IS 456 limits crack width to 0.3 mm in general.', difficulty: H, subject: 'Concrete Technology', tags: ['cracks'], level: 'senior' },
]

// ────────────────────────────────────────────────────────────────────────────
// CHEM — Reaction Engg, Mass Transfer, Heat Transfer, Thermo, Fluid, Control
// ────────────────────────────────────────────────────────────────────────────
const chem: SeedRow[] = [
  { question: 'Which equipment is used for liquid-liquid extraction?', options: m(['Mixer-settler', 'Distillation column', 'Cyclone', 'Fluidized bed']), answer: 'Mixer-settler', explanation: 'Mixer-settlers carry out liquid-liquid extraction stages.', difficulty: M, subject: 'Mass Transfer', tags: ['extraction'], level: 'entry' },
  { question: 'The Damkohler number relates:', options: m(['Reaction rate to convective mass transfer', 'Viscous to inertial forces', 'Heat to mass diffusivity', 'Pressure to flow rate']), answer: 'Reaction rate to convective mass transfer', explanation: 'Da compares reaction kinetics to flow/mixing timescales.', difficulty: H, subject: 'Chemical Reaction Engineering', tags: ['damkohler'], level: 'senior' },
  { question: 'Fick\'s law describes which transport phenomenon?', options: m(['Molecular diffusion', 'Convective heat transfer', 'Radiation', 'Momentum transfer']), answer: 'Molecular diffusion', explanation: 'Fick\'s first law governs molecular diffusion of species.', difficulty: M, subject: 'Mass Transfer', tags: ['fick'], level: 'entry' },
  { question: 'For a first-order reaction in a CSTR at steady state, the space time is:', options: m(['CA0·X/(k·CA)', '1/k·ln(1/(1−X))', 'k·CA0', 'X/k']), answer: 'CA0·X/(k·CA)', explanation: 'For a CSTR, τ = CA0·X / (k·CA).', difficulty: H, subject: 'Chemical Reaction Engineering', tags: ['cstr'], level: 'mid' },
  { question: 'The heat transfer mechanism that requires no medium is:', options: m(['Radiation', 'Convection', 'Conduction', 'All require a medium']), answer: 'Radiation', explanation: 'Radiation transfers heat via electromagnetic waves without a medium.', difficulty: E, subject: 'Heat Transfer', tags: ['radiation'], level: 'entry' },
  { question: 'Which dimensionless group characterizes forced convection?', options: m(['Reynolds number', 'Biot number', 'Lewis number', 'Fourier number']), answer: 'Reynolds number', explanation: 'Re governs flow regime in forced convection.', difficulty: E, subject: 'Heat Transfer', tags: ['reynolds'], level: 'entry' },
  { question: 'The minimum reflux ratio in distillation corresponds to:', options: m(['Infinite number of stages', 'Zero stages', 'Minimum reboiler duty', 'Maximum distillate purity']), answer: 'Infinite number of stages', explanation: 'At minimum reflux, the number of stages approaches infinity.', difficulty: H, subject: 'Mass Transfer', tags: ['distillation'], level: 'mid' },
  { question: 'Which reactor type has the narrowest residence time distribution?', options: m(['PFR', 'CSTR', 'Batch with good mixing', 'Series of CSTRs']), answer: 'PFR', explanation: 'PFRs have plug flow with a single residence time (ideal).', difficulty: M, subject: 'Chemical Reaction Engineering', tags: ['pfr'], level: 'mid' },
  { question: 'The Clausius-Clapeyron equation relates vapor pressure to:', options: m(['Temperature via latent heat', 'Density', 'Viscosity', 'Surface tension']), answer: 'Temperature via latent heat', explanation: 'd(ln P)/dT = ΔHvap/(RT²).', difficulty: M, subject: 'Chemical Thermodynamics', tags: ['clausius-clapeyron'], level: 'mid' },
  { question: 'Which process removes water vapor from air using a desiccant?', options: m(['Adsorption drying', 'Distillation', 'Filtration', 'Crystallization']), answer: 'Adsorption drying', explanation: 'Desiccants adsorb moisture from air.', difficulty: M, subject: 'Mass Transfer', tags: ['adsorption'], level: 'mid' },
  { question: 'The critical temperature of a gas is the temperature above which it:', options: m(['Cannot be liquefied by pressure alone', 'Becomes a solid', 'Has zero viscosity', 'Cannot be compressed']), answer: 'Cannot be liquefied by pressure alone', explanation: 'Above Tc, a gas cannot be liquefied by pressure alone.', difficulty: M, subject: 'Chemical Thermodynamics', tags: ['critical-temperature'], level: 'entry' },
  { question: 'A PID controller combines which three actions?', options: m(['Proportional, Integral, Derivative', 'Pressure, Inductance, Density', 'Proportional, Impedance, Deviation', 'Pump, Inlet, Discharge']), answer: 'Proportional, Integral, Derivative', explanation: 'PID = proportional + integral + derivative control.', difficulty: E, subject: 'Process Control', tags: ['pid'], level: 'entry' },
  { question: 'The function of a baffle in a shell-and-tube heat exchanger is to:', options: m(['Increase shell-side turbulence', 'Reduce heat transfer', 'Increase pressure drop only', 'Prevent corrosion']), answer: 'Increase shell-side turbulence', explanation: 'Baffles improve shell-side heat transfer by inducing cross-flow.', difficulty: M, subject: 'Heat Transfer', tags: ['hx'], level: 'mid' },
  { question: 'Which fluid behavior is described by Newton\'s law of viscosity?', options: m(['Shear stress proportional to velocity gradient', 'Shear stress proportional to shear strain', 'Constant viscosity at all rates', 'Zero shear stress']), answer: 'Shear stress proportional to velocity gradient', explanation: 'τ = μ(du/dy) for Newtonian fluids.', difficulty: E, subject: 'Fluid Mechanics', tags: ['viscosity'], level: 'entry' },
  { question: 'The overflow weir in a clarifier serves to:', options: m(['Collect clarified effluent evenly', 'Add chemicals', 'Mix sludge', 'Increase velocity']), answer: 'Collect clarified effluent evenly', explanation: 'Weirs collect clear water uniformly from the surface.', difficulty: M, subject: 'Chemical Technology', tags: ['clarifier'], level: 'mid' },
  { question: 'Which unit operation separates solids from liquids using a porous medium?', options: m(['Filtration', 'Distillation', 'Evaporation', 'Absorption']), answer: 'Filtration', explanation: 'Filtration separates solids from liquids via a porous barrier.', difficulty: E, subject: 'Mass Transfer', tags: ['filtration'], level: 'entry' },
]

// ────────────────────────────────────────────────────────────────────────────
// AI/DS — ML, DL, Stats, Data Engg, NLP, DSA, Neural Nets
// ────────────────────────────────────────────────────────────────────────────
const ai_ds: SeedRow[] = [
  { question: 'Which algorithm is used for supervised classification and works by finding the line that maximizes margin?', options: m(['SVM', 'K-means', 'Apriori', 'PCA']), answer: 'SVM', explanation: 'SVMs maximize the margin between classes.', difficulty: M, subject: 'Machine Learning', tags: ['svm'], level: 'entry' },
  { question: 'What does the K in K-means represent?', options: m(['Number of clusters', 'Number of features', 'Number of iterations', 'Kernel size']), answer: 'Number of clusters', explanation: 'K is the pre-specified number of clusters.', difficulty: E, subject: 'Machine Learning', tags: ['k-means'], level: 'entry' },
  { question: 'The confusion matrix of a binary classifier has how many cells?', options: m(['4', '2', '8', '6']), answer: '4', explanation: 'TP, FP, FN, TN.', difficulty: E, subject: 'Machine Learning', tags: ['confusion-matrix'], level: 'entry' },
  { question: 'Which activation function maps outputs to a 0–1 range?', options: m(['Sigmoid', 'ReLU', 'Leaky ReLU', 'Linear']), answer: 'Sigmoid', explanation: 'Sigmoid squashes values into (0,1).', difficulty: E, subject: 'Deep Learning', tags: ['activation'], level: 'entry' },
  { question: 'In backpropagation, which rule updates the weights?', options: m(['Chain rule of calculus', 'Bayes rule', 'Central limit theorem', 'Heuristic rule']), answer: 'Chain rule of calculus', explanation: 'Backprop uses the chain rule to compute gradients.', difficulty: M, subject: 'Deep Learning', tags: ['backprop'], level: 'mid' },
  { question: 'The probability of event A given B is written as:', options: m(['P(A|B)', 'P(A∩B)', 'P(A∪B)', 'P(B|A)']), answer: 'P(A|B)', explanation: 'Conditional probability notation.', difficulty: E, subject: 'Probability & Statistics', tags: ['probability'], level: 'entry' },
  { question: 'Which statistic measures the spread of a dataset?', options: m(['Standard deviation', 'Median', 'Mode', 'Percentile']), answer: 'Standard deviation', explanation: 'SD quantifies dispersion around the mean.', difficulty: E, subject: 'Probability & Statistics', tags: ['statistics'], level: 'entry' },
  { question: 'A model trained well on training data but poorly on unseen data is said to be:', options: m(['Overfitting', 'Underfitting', 'Regularized', 'Bias-free']), answer: 'Overfitting', explanation: 'Overfitting captures noise instead of the signal.', difficulty: E, subject: 'Machine Learning', tags: ['overfitting'], level: 'entry' },
  { question: 'Which technique is used to reduce the number of features while preserving variance?', options: m(['PCA', 'One-hot encoding', 'Min-max scaling', 'Boosting']), answer: 'PCA', explanation: 'PCA projects data onto principal components, reducing dimensionality.', difficulty: M, subject: 'Machine Learning', tags: ['pca'], level: 'mid' },
  { question: 'In NLP, stop words are typically:', options: m(['Removed during preprocessing', 'Given more weight', 'Used as labels', 'Converted to numbers']), answer: 'Removed during preprocessing', explanation: 'Common words like "the", "and" are often removed.', difficulty: E, subject: 'NLP', tags: ['nlp'], level: 'entry' },
  { question: 'Which loss function is used for binary classification?', options: m(['Binary cross-entropy', 'Mean squared error', 'Huber loss', 'Absolute error']), answer: 'Binary cross-entropy', explanation: 'Binary cross-entropy suits binary classification output.', difficulty: M, subject: 'Deep Learning', tags: ['loss'], level: 'mid' },
  { question: 'What does an "Epoch" mean in model training?', options: m(['One full pass over the training data', 'One batch update', 'One feature', 'One gradient step']), answer: 'One full pass over the training data', explanation: 'An epoch is one complete pass over the training set.', difficulty: E, subject: 'Deep Learning', tags: ['training'], level: 'entry' },
  { question: 'Which database is columnar and often used for analytical workloads?', options: m(['ClickHouse', 'MongoDB', 'Redis', 'Cassandra (default)']), answer: 'ClickHouse', explanation: 'ClickHouse is a columnar OLAP database.', difficulty: M, subject: 'Data Engineering', tags: ['olap'], level: 'mid' },
  { question: 'The term "feature engineering" refers to:', options: m(['Creating/transforming input variables for models', 'Training a model', 'Deploying a model', 'Labeling data']), answer: 'Creating/transforming input variables for models', explanation: 'Feature engineering improves model input quality.', difficulty: E, subject: 'Machine Learning', tags: ['features'], level: 'entry' },
  { question: 'Which of these is a generative model?', options: m(['GAN', 'Logistic regression', 'SVM', 'Decision tree']), answer: 'GAN', explanation: 'GANs generate new data samples.', difficulty: M, subject: 'Deep Learning', tags: ['gan'], level: 'mid' },
  { question: 'The F1 score is the harmonic mean of:', options: m(['Precision and recall', 'Accuracy and loss', 'Bias and variance', 'TP and FP']), answer: 'Precision and recall', explanation: 'F1 = 2·(P·R)/(P+R).', difficulty: M, subject: 'Machine Learning', tags: ['f1'], level: 'entry' },
  { question: 'What is the time complexity of finding a value in a balanced BST?', options: m(['O(log n)', 'O(n)', 'O(1)', 'O(n log n)']), answer: 'O(log n)', explanation: 'Balanced BST search is O(log n).', difficulty: E, subject: 'Data Structures', tags: ['bst'], level: 'entry' },
  { question: 'In a data pipeline, what does ETL stand for?', options: m(['Extract, Transform, Load', 'Export, Test, Launch', 'Extract, Train, Log', 'Evaluate, Transform, Load']), answer: 'Extract, Transform, Load', explanation: 'ETL moves data from sources into a warehouse.', difficulty: E, subject: 'Data Engineering', tags: ['etl'], level: 'entry' },
  { question: 'Which neural network architecture is best suited for sequential data?', options: m(['RNN/LSTM', 'Fully connected only', 'Convolutional only', 'Autoencoder']), answer: 'RNN/LSTM', explanation: 'RNNs/LSTMs capture temporal dependencies.', difficulty: M, subject: 'Deep Learning', tags: ['rnn'], level: 'mid' },
  { question: 'The ROC curve plots:', options: m(['TPR against FPR', 'Precision against recall', 'Loss against epochs', 'Accuracy against threshold']), answer: 'TPR against FPR', explanation: 'ROC shows TPR vs FPR at various thresholds.', difficulty: M, subject: 'Machine Learning', tags: ['roc'], level: 'mid' },
]

// ────────────────────────────────────────────────────────────────────────────
// True/False, multiple-response, fill-blanks, coding samples across branches
// ────────────────────────────────────────────────────────────────────────────
const mixedTypes: SeedRow[] = [
  // CSE true/false + coding
  { question: 'An array index in C starts at 1.', type: 'true_false', options: TF, answer: 'False', explanation: 'C arrays are 0-indexed.', difficulty: E, subject: 'Programming in C/Java/Python', branch: 'cse', tags: ['arrays'], level: 'entry' },
  { question: 'A stack is a FIFO data structure.', type: 'true_false', options: TF, answer: 'False', explanation: 'Stacks are LIFO.', difficulty: E, subject: 'Data Structures & Algorithms', branch: 'cse', tags: ['stack'], level: 'entry' },
  { question: 'Which of the following operations are O(1) average on a hash map?', type: 'multiple_response', options: m(['Insert', 'Lookup', 'Delete', 'Iterate in sorted order']), answer: 'Insert,Lookup,Delete', explanation: 'Hash map insert/lookup/delete are amortized O(1); sorted iteration is O(n log n).', difficulty: M, subject: 'Data Structures & Algorithms', branch: 'cse', tags: ['hashmap'], level: 'mid' },
  { question: 'Given a sorted array, binary search runs in ____ time in the worst case.', type: 'fill_blanks', options: m(['O(n)', 'O(log n)', 'O(n log n)', 'O(1)']), answer: 'O(log n)', explanation: 'Binary search halves the search space each step.', difficulty: E, subject: 'Data Structures & Algorithms', branch: 'cse', tags: ['binary-search'], level: 'entry' },
  { question: 'Write a function that returns whether a string is a palindrome.', type: 'coding', options: undefined, answer: 'Compare string to its reverse; return true if equal.', explanation: 'A simple two-pointer or reverse-compare approach works in O(n).', difficulty: E, subject: 'Programming in C/Java/Python', branch: 'cse', tech_stack: ['python'], tags: ['strings'], level: 'entry', marks: 20 },
  { question: 'Write a function to find the first non-repeating character in a string.', type: 'coding', options: undefined, answer: 'Use a hash map of character counts in two passes; return the first char with count 1.', explanation: 'O(n) time, O(1) space with a fixed alphabet.', difficulty: M, subject: 'Programming in C/Java/Python', branch: 'cse', tech_stack: ['python'], tags: ['strings', 'hashmap'], level: 'mid', marks: 20 },
  { question: 'Which of these are HTTP request methods?', type: 'multiple_response', options: m(['GET', 'POST', 'FETCH', 'PUT']), answer: 'GET,POST,PUT', explanation: 'GET, POST, PUT, DELETE are standard HTTP methods; FETCH is not.', difficulty: E, subject: 'Web Technologies', branch: 'it', tags: ['http'], level: 'entry' },
  // ECE true/false + multiple response
  { question: 'A NAND gate is a universal gate.', type: 'true_false', options: TF, answer: 'True', explanation: 'NAND alone can implement any Boolean function.', difficulty: E, subject: 'Digital Electronics', branch: 'ece', tags: ['logic-gates'], level: 'entry' },
  { question: 'Which of the following are types of data transmission?', type: 'multiple_response', options: m(['Serial', 'Parallel', 'Bidirectional', 'Quadratic']), answer: 'Serial,Parallel,Bidirectional', explanation: 'Serial, parallel, and bidirectional are real transmission modes; quadratic is not.', difficulty: E, subject: 'Communication Systems', branch: 'ece', tags: ['transmission'], level: 'entry' },
  { question: 'In an ideal op-amp, input impedance is infinite.', type: 'true_false', options: TF, answer: 'True', explanation: 'Ideal op-amps draw no input current.', difficulty: E, subject: 'Analog Electronics', branch: 'ece', tags: ['op-amp'], level: 'entry' },
  // Mech / civil true-false
  { question: 'Second law of thermodynamics states that heat cannot spontaneously flow from a colder body to a hotter body.', type: 'true_false', options: TF, answer: 'True', explanation: 'That is the Clausius statement of the second law.', difficulty: E, subject: 'Thermodynamics', branch: 'mech', tags: ['second-law'], level: 'entry' },
  { question: 'Slump test measures the compressive strength of concrete.', type: 'true_false', options: TF, answer: 'False', explanation: 'The slump test measures workability, not strength.', difficulty: E, subject: 'Concrete Technology', branch: 'civil', tags: ['slump'], level: 'entry' },
  { question: 'Which of the following are methods of water purification?', type: 'multiple_response', options: m(['Sedimentation', 'Filtration', 'Chlorination', 'Pyrolysis']), answer: 'Sedimentation,Filtration,Chlorination', explanation: 'Sedimentation, filtration, and chlorination purify water; pyrolysis is not a water-purification step.', difficulty: E, subject: 'Environmental Engineering', branch: 'civil', tags: ['water-treatment'], level: 'entry' },
  // AI true/false
  { question: 'Decision trees are prone to overfitting.', type: 'true_false', options: TF, answer: 'True', explanation: 'Deep, unpruned trees fit training noise.', difficulty: E, subject: 'Machine Learning', branch: 'ai_ds', tags: ['decision-trees'], level: 'entry' },
  { question: 'Which of the following are regression evaluation metrics?', type: 'multiple_response', options: m(['MSE', 'R²', 'MAE', 'Precision']), answer: 'MSE,R²,MAE', explanation: 'MSE, R², MAE evaluate regression; precision is a classification metric.', difficulty: M, subject: 'Machine Learning', branch: 'ai_ds', tags: ['metrics'], level: 'mid' },
  { question: 'The learning rate in gradient descent controls ____ size.', type: 'fill_blanks', options: m(['step', 'batch', 'epoch', 'dataset']), answer: 'step', explanation: 'Learning rate scales the gradient update step.', difficulty: E, subject: 'Deep Learning', branch: 'ai_ds', tags: ['gradient-descent'], level: 'entry' },
  // Chem / eee fill-blanks
  { question: 'The ____ number predicts laminar vs turbulent flow.', type: 'fill_blanks', options: m(['Reynolds', 'Nusselt', 'Prandtl', 'Mach']), answer: 'Reynolds', explanation: 'Reynolds number indicates flow regime.', difficulty: E, subject: 'Fluid Mechanics', branch: 'chem', tags: ['reynolds-number'], level: 'entry' },
  { question: 'A ____ converts AC to DC.', type: 'fill_blanks', options: m(['rectifier', 'inverter', 'transformer', 'chopper']), answer: 'rectifier', explanation: 'Rectifiers convert AC to DC.', difficulty: E, subject: 'Power Electronics', branch: 'eee', tags: ['rectifier'], level: 'entry' },
]

// Descriptive (subjective) questions — model answers, no options — across branches
const descriptive: SeedRow[] = [
  { question: 'Explain the difference between TCP and UDP, and give a real-world use case for each.', type: 'descriptive', options: undefined, answer: 'TCP is connection-oriented, reliable, ordered, and slower; used for HTTP/email/file transfer. UDP is connectionless, fast, best-effort, and used for live streaming, VoIP, and DNS.', explanation: 'Focus on reliability vs latency trade-off.', difficulty: M, subject: 'Computer Networks', branch: 'cse', tags: ['tcp-udp'], level: 'mid', marks: 10 },
  { question: 'Describe how a binary search tree differs from a hash table for lookups, including complexity and ordering guarantees.', type: 'descriptive', options: undefined, answer: 'BST lookups are O(log n) average (O(n) worst), support sorted traversal/range queries; hash tables are O(1) average lookups but unordered. Choose BST when ordering matters, hash table for fast exact lookups.', explanation: 'Compare time complexity and ordering capabilities.', difficulty: H, subject: 'Data Structures & Algorithms', branch: 'cse', tags: ['bst-hash'], level: 'senior', marks: 15 },
  { question: 'Explain the concept of normal forms (1NF through 3NF) in database design with a small example.', type: 'descriptive', options: undefined, answer: '1NF: atomic columns; 2NF: no partial dependency on composite key; 3NF: no transitive dependency. Example: split a student table into student and department tables to remove transitive dependencies.', explanation: 'Show step-by-step normalization of a sample table.', difficulty: M, subject: 'Databases', branch: 'it', tags: ['normalization'], level: 'mid', marks: 10 },
  { question: 'Describe how a transistor acts as an amplifier. Mention the biasing condition and the three operating regions.', type: 'descriptive', options: undefined, answer: 'A BJT amplifies when operated in the active region (base-emitter forward biased, base-collector reverse biased). Small base current controls a larger collector current, giving current/voltage gain.', explanation: 'Cover biasing, active region, and gain concept.', difficulty: M, subject: 'Analog Electronics', branch: 'ece', tags: ['transistor'], level: 'mid', marks: 10 },
  { question: 'Explain the principle of operation of a three-phase induction motor and why it is self-starting.', type: 'descriptive', options: undefined, answer: 'A rotating magnetic field (RMF) is produced by balanced three-phase currents in the stator windings. The RMF induces current in the rotor bars (induction), which experiences torque, making the motor self-starting.', explanation: 'Emphasize rotating magnetic field and induction of rotor current.', difficulty: H, subject: 'Electrical Machines', branch: 'eee', tags: ['induction-motor'], level: 'senior', marks: 15 },
  { question: 'Explain the working of a four-stroke internal combustion engine, naming each stroke in order.', type: 'descriptive', options: undefined, answer: 'Intake (air-fuel drawn in), Compression (mixture compressed), Power (combustion drives piston down), Exhaust (burned gases expelled). A flywheel maintains rotation between power strokes.', explanation: 'List strokes in sequence and the function of each.', difficulty: M, subject: 'Internal Combustion Engines', branch: 'mech', tags: ['ic-engine'], level: 'mid', marks: 10 },
  { question: 'Describe the steps involved in concrete mix design and the factors that affect the water-cement ratio.', type: 'descriptive', options: undefined, answer: 'Steps: select target strength, choose w/c ratio, determine water content from slump, compute cement content, aggregate proportions, trial mix. Lower w/c gives higher strength but lower workability.', explanation: 'Cover the ACI/IS mix design procedure.', difficulty: H, subject: 'Concrete Technology', branch: 'civil', tags: ['mix-design'], level: 'senior', marks: 15 },
  { question: 'Explain the role of catalysts in chemical reactions and how they affect activation energy and equilibrium.', type: 'descriptive', options: undefined, answer: 'Catalysts lower activation energy by providing an alternative pathway, speeding up both forward and reverse reactions. They do not shift equilibrium but help reach it faster and are not consumed.', explanation: 'Distinguish kinetics (rate) from thermodynamics (equilibrium).', difficulty: M, subject: 'Chemical Reaction Engineering', branch: 'chem', tags: ['catalyst'], level: 'mid', marks: 10 },
  { question: 'Explain overfitting and underfitting in machine learning, and describe two techniques to mitigate overfitting.', type: 'descriptive', options: undefined, answer: 'Overfitting: model captures noise, high train/low test accuracy. Underfitting: too simple, high error everywhere. Mitigations: regularization (L1/L2), dropout, more data, cross-validation, pruning.', explanation: 'Define both terms then give concrete mitigations.', difficulty: M, subject: 'Machine Learning', branch: 'ai_ds', tags: ['overfitting'], level: 'mid', marks: 10 },
]

// Senior-level harder questions for depth
const senior: SeedRow[] = [
  { question: 'In distributed systems, the CAP theorem states that a system can simultaneously provide only two of:', options: m(['Consistency, Availability, Partition tolerance', 'Latency, Throughput, Reliability', 'Security, Speed, Cost', 'Scalability, Durability, Isolation']), answer: 'Consistency, Availability, Partition tolerance', explanation: 'CAP: Consistency, Availability, Partition tolerance — pick two.', difficulty: H, subject: 'Software Engineering', branch: 'cse', tags: ['cap-theorem'], level: 'senior' },
  { question: 'The two-phase commit protocol guarantees:', options: m(['Atomicity across distributed transactions', 'Eventual consistency always', 'Zero network delay', 'Infinite scalability']), answer: 'Atomicity across distributed transactions', explanation: '2PC ensures all-or-nothing commits across participants.', difficulty: H, subject: 'Databases', branch: 'cse', tags: ['2pc'], level: 'senior' },
  { question: 'In control systems, the gain margin is the reciprocal of:', options: m(['Magnitude of G(jω) at phase −180°', 'Phase at gain crossover', 'Gain at phase crossover', 'Damping ratio']), answer: 'Magnitude of G(jω) at phase −180°', explanation: 'Gain margin = 1/|G(jω)| at the −180° phase crossing.', difficulty: H, subject: 'Control Systems', branch: 'ece', tags: ['stability'], level: 'senior' },
  { question: 'Which compensation technique improves both transient and steady-state performance?', options: m(['Lag-lead compensator', 'Pure lag', 'Pure lead', 'Gain only']), answer: 'Lag-lead compensator', explanation: 'Lag-lead combines the lead (transient) and lag (steady-state) benefits.', difficulty: H, subject: 'Control Systems', branch: 'eee', tags: ['compensation'], level: 'senior' },
  { question: 'The stress intensity factor KIC measures a material\'s:', options: m(['Fracture toughness', 'Hardness', 'Fatigue limit', 'Creep resistance']), answer: 'Fracture toughness', explanation: 'KIC is the critical stress intensity factor for crack growth.', difficulty: H, subject: 'Strength of Materials', branch: 'mech', tags: ['fracture'], level: 'senior' },
  { question: 'The critical void ratio of sand relates to:', options: m(['Liquefaction behavior', 'Hydraulic conductivity', 'Angle of repose', 'Compaction curve']), answer: 'Liquefaction behavior', explanation: 'Critical void ratio defines the boundary for contractive/dilative behavior linked to liquefaction.', difficulty: H, subject: 'Geotechnical Engineering', branch: 'civil', tags: ['liquefaction'], level: 'senior' },
  { question: 'The Arrhenius equation relates reaction rate constant to:', options: m(['Temperature and activation energy', 'Pressure and volume', 'Concentration only', 'Catalyst surface area']), answer: 'Temperature and activation energy', explanation: 'k = A·e^(−Ea/RT).', difficulty: M, subject: 'Chemical Reaction Engineering', branch: 'chem', tags: ['arrhenius'], level: 'senior' },
  { question: 'Transformer attention in LLMs is based on which mechanism?', options: m(['Self-attention over token embeddings', 'Convolutional filtering', 'Recurrent hidden state only', 'Random projection']), answer: 'Self-attention over token embeddings', explanation: 'Transformers use scaled dot-product self-attention.', difficulty: M, subject: 'Deep Learning', branch: 'ai_ds', tags: ['transformer', 'nlp'], level: 'senior' },
  { question: 'Which technique reduces overfitting by randomly dropping neurons during training?', options: m(['Dropout', 'Batch normalization', 'Data augmentation only', 'Early stopping only']), answer: 'Dropout', explanation: 'Dropout randomly zeroes neuron activations to regularize.', difficulty: E, subject: 'Deep Learning', branch: 'ai_ds', tags: ['dropout'], level: 'entry' },
  { question: 'The CQL (Common Query Language) equivalent in MongoDB to filter documents is:', options: m(['find() with query object', 'SELECT *', 'map-reduce', 'aggregate only']), answer: 'find() with query object', explanation: 'MongoDB find() takes a query document filter.', difficulty: E, subject: 'Databases', branch: 'cse', tags: ['mongodb'], level: 'entry' },
]

const all: SeedRow[] = [
  ...aptitude,
  ...cse,
  ...it,
  ...ece,
  ...eee,
  ...mech,
  ...civil,
  ...chem,
  ...ai_ds,
  ...mixedTypes,
  ...descriptive,
  ...senior,
]

async function seed() {
  const db = await getMongoDb()
  const col = db.collection('question_bank')
  const existing = await col.find({}, { projection: { _id: 0 } }).toArray()
  const seen = new Set(existing.map((d: any) => bankContentHash(d)))

  const docs = all
    .map((r) => {
      const filled = fill(r)
      return normalizeBankQuestion({ id: randomUUID(), createdAt: now(), source: 'seed', ...filled })
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .filter((d) => {
      const h = bankContentHash(d)
      if (seen.has(h)) return false
      seen.add(h)
      return true
    })

  if (docs.length) {
    await col.insertMany(docs)
  }
  console.log(`✓ question_bank expanded by ${docs.length} curated questions (total now ${existing.length + docs.length}).`)
  console.log('Distribution:')
  const byBranch = await col.aggregate([{ $group: { _id: '$branch', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()
  console.log('  branches:', JSON.stringify(byBranch))
  const byType = await col.aggregate([{ $group: { _id: '$type', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()
  console.log('  types:', JSON.stringify(byType))
  const byDiff = await col.aggregate([{ $group: { _id: '$difficulty', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()
  console.log('  difficulty:', JSON.stringify(byDiff))
  const byIndustry = await col.aggregate([{ $group: { _id: '$industry', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()
  console.log('  industries:', JSON.stringify(byIndustry))
  const byLevel = await col.aggregate([{ $group: { _id: '$level', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()
  console.log('  levels:', JSON.stringify(byLevel))
  process.exit(0)
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1) })
