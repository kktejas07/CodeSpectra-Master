import { cn } from '@/lib/utils'

/**
 * CodeSpectra spot illustrations — hand-built vector art in the brand style:
 * 2px rounded line work, soft royal-blue fills, a ground shadow and a few
 * sparkles. Every colour is a token (see `.cs-illo` in globals.css), so the
 * same art works in light, dark and on the royal-blue banner (`inverse`).
 * Decorative by default (aria-hidden); pass `title` to make one meaningful.
 */

export type IllustrationName =
  | 'coding' | 'proctoring' | 'certificate' | 'hackathon' | 'analytics' | 'interview'
  | 'courses' | 'resume' | 'jobs' | 'leaderboard' | 'calendar' | 'security'
  | 'settings' | 'team' | 'notifications' | 'search' | 'upload' | 'success'
  | 'error' | 'ai' | 'mock-test' | 'assessment' | 'billing' | 'launch' | 'inbox'
  | 'bookmarks' | 'not-found' | 'locked' | 'integrations' | 'scanner'

const Ground = () => <ellipse className="g" cx="100" cy="139" rx="72" ry="6" />
const Spark = ({ x, y, s = 1, c = 'a' }: { x: number; y: number; s?: number; c?: string }) => (
  <path
    className={cn(c, 'twinkle')}
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M0-6 1.4-1.4 6 0 1.4 1.4 0 6-1.4 1.4-6 0-1.4-1.4Z"
  />
)
const Dot = ({ x, y, r = 2.5, c = 'm' }: { x: number; y: number; r?: number; c?: string }) => <circle className={c} cx={x} cy={y} r={r} />
const Lines = ({ x, y, w, n = 3, gap = 8 }: { x: number; y: number; w: number[]; n?: number; gap?: number }) => (
  <>
    {Array.from({ length: n }).map((_, i) => (
      <rect key={i} className="mu" x={x} y={y + i * gap} width={w[i % w.length]} height="3.5" rx="1.75" />
    ))}
  </>
)
const Avatar = ({ x, y, r = 9, c = 's' }: { x: number; y: number; r?: number; c?: string }) => (
  <g>
    <circle className={c} cx={x} cy={y} r={r} />
    <circle className="l" cx={x} cy={y} r={r} />
    <circle className="m" cx={x} cy={y - r * 0.22} r={r * 0.32} />
    <path className="m" d={`M${x - r * 0.55} ${y + r * 0.62}a${r * 0.55} ${r * 0.45} 0 0 1 ${r * 1.1} 0Z`} />
  </g>
)
const CodeMark = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path className="as" transform={`translate(${x} ${y}) scale(${s})`} d="M-6-6-12 0l6 6M6-6l6 6-6 6M2-9-2 9" />
)

const ART: Record<IllustrationName, React.ReactNode> = {
  coding: (
    <>
      <Ground />
      <rect className="p" x="38" y="28" width="124" height="92" rx="12" />
      <rect className="l" x="38" y="28" width="124" height="92" rx="12" />
      <path className="l" d="M38 46h124" />
      <Dot x={50} y={37} r={2.5} c="bd" /><Dot x={59} y={37} r={2.5} c="wn" /><Dot x={68} y={37} r={2.5} c="ok" />
      <rect className="a" x="52" y="58" width="22" height="4" rx="2" />
      <rect className="mu" x="78" y="58" width="34" height="4" rx="2" />
      <rect className="mu" x="62" y="70" width="44" height="4" rx="2" />
      <rect className="m" x="62" y="82" width="28" height="4" rx="2" />
      <rect className="mu" x="94" y="82" width="20" height="4" rx="2" />
      <rect className="mu" x="52" y="94" width="30" height="4" rx="2" />
      <g className="float">
        <circle className="a" cx="150" cy="104" r="17" />
        <path className="w" d="M145 96v16l13-8Z" />
      </g>
      <Spark x={30} y={30} /><Spark x={172} y={44} s={0.7} c="m" />
    </>
  ),
  proctoring: (
    <>
      <Ground />
      <rect className="p" x="40" y="24" width="112" height="78" rx="10" />
      <rect className="l" x="40" y="24" width="112" height="78" rx="10" />
      <path className="l" d="M84 102l-4 18h32l-4-18M72 120h48" />
      <rect className="s" x="52" y="36" width="88" height="54" rx="6" />
      <circle className="m" cx="96" cy="56" r="10" />
      <path className="m" d="M78 86c2-11 9-16 18-16s16 5 18 16Z" />
      <path className="as" d="M60 44v-4h6M132 44v-4h-6M60 82v4h6M132 82v4h-6" />
      <g className="float">
        <path className="a" d="M152 70l18 7v12c0 11-8 18-18 22-10-4-18-11-18-22V77Z" />
        <path className="oks" style={{ stroke: '#fff' }} d="M145 90l5 5 9-10" />
      </g>
      <Spark x={30} y={40} c="m" /><Spark x={176} y={56} s={0.7} />
    </>
  ),
  certificate: (
    <>
      <Ground />
      <rect className="p" x="34" y="26" width="132" height="94" rx="8" />
      <rect className="l" x="34" y="26" width="132" height="94" rx="8" />
      <rect className="lt" x="42" y="34" width="116" height="78" rx="4" />
      <rect className="a" x="70" y="44" width="60" height="5" rx="2.5" />
      <Lines x={62} y={58} w={[76, 60, 70]} n={3} gap={9} />
      <rect className="mu" x="52" y="98" width="34" height="3" rx="1.5" />
      <g className="float">
        <path className="m" d="M138 96l-6 26 9-5 6 8 4-26Z" />
        <path className="a" d="M152 96l6 26-9-5-6 8-4-26Z" />
        <circle className="a" cx="145" cy="94" r="14" />
        <circle className="lt" style={{ stroke: '#fff', opacity: 0.8 }} cx="145" cy="94" r="9" />
        <path className="w" d="M145 88l1.8 3.8 4.2.5-3.1 2.9.8 4.1-3.7-2-3.7 2 .8-4.1-3.1-2.9 4.2-.5Z" />
      </g>
      <Spark x={26} y={30} /><Spark x={176} y={36} s={0.7} c="m" />
    </>
  ),
  hackathon: (
    <>
      <Ground />
      <g className="float">
        <path className="s" d="M78 30h44v18c0 14-10 24-22 24S78 62 78 48Z" />
        <path className="l" d="M78 30h44v18c0 14-10 24-22 24S78 62 78 48Z" />
        <path className="l" d="M78 36H66c0 10 6 16 14 16M122 36h12c0 10-6 16-14 16" />
        <path className="a" d="M93 72h14v12H93Z" />
        <rect className="a" x="84" y="84" width="32" height="7" rx="3" />
        <path className="w" d="M100 40l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8Z" />
      </g>
      <Avatar x={56} y={112} r={13} />
      <Avatar x={100} y={116} r={13} c="m" />
      <Avatar x={144} y={112} r={13} />
      <Spark x={44} y={40} /><Spark x={160} y={34} s={0.8} c="m" /><Spark x={150} y={70} s={0.6} />
    </>
  ),
  analytics: (
    <>
      <Ground />
      <rect className="p" x="34" y="24" width="132" height="98" rx="12" />
      <rect className="l" x="34" y="24" width="132" height="98" rx="12" />
      <rect className="mu" x="48" y="36" width="40" height="5" rx="2.5" />
      <rect className="s" x="50" y="78" width="14" height="30" rx="3" />
      <rect className="m" x="72" y="66" width="14" height="42" rx="3" />
      <rect className="s" x="94" y="72" width="14" height="36" rx="3" />
      <rect className="m" x="116" y="56" width="14" height="52" rx="3" />
      <rect className="a" x="138" y="46" width="14" height="62" rx="3" />
      <path className="as" d="M50 66l22-10 22 6 22-14 26-12" />
      <circle className="a" cx="142" cy="36" r="4" />
      <path className="lt" d="M48 108h108" />
      <g className="float2">
        <rect className="a" x="138" y="10" width="40" height="22" rx="8" />
        <path className="as" style={{ stroke: '#fff' }} d="M147 25l6-6 5 4 8-8" />
      </g>
      <Spark x={24} y={48} c="m" />
    </>
  ),
  interview: (
    <>
      <Ground />
      <path className="p" d="M30 34h88a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H62l-16 14V88H40a10 10 0 0 1-10-10V44a10 10 0 0 1 10-10Z" />
      <path className="l" d="M40 34h78a10 10 0 0 1 10 10v34a10 10 0 0 1-10 10H62l-16 14V88h-6a10 10 0 0 1-10-10V44a10 10 0 0 1 10-10Z" />
      <Lines x={44} y={50} w={[66, 50, 58]} n={3} gap={9} />
      <g className="float">
        <path className="a" d="M106 70h56a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10h-6v12l-14-12h-36a10 10 0 0 1-10-10V80a10 10 0 0 1 10-10Z" />
        <rect className="w" x="118" y="84" width="36" height="4" rx="2" opacity=".9" />
        <rect className="w" x="118" y="94" width="24" height="4" rx="2" opacity=".7" />
      </g>
      <Spark x={156} y={40} /><Spark x={26} y={110} s={0.7} c="m" />
    </>
  ),
  courses: (
    <>
      <Ground />
      <path className="s" d="M100 46c-14-10-36-12-58-8v74c22-4 44-2 58 8Z" />
      <path className="p" d="M100 46c14-10 36-12 58-8v74c-22-4-44-2-58 8Z" />
      <path className="l" d="M100 46c-14-10-36-12-58-8v74c22-4 44-2 58 8 14-10 36-12 58-8V38c-22-4-44-2-58 8Zm0 0v74" />
      <Lines x={52} y={56} w={[36, 28, 34, 22]} n={4} gap={10} />
      <g className="float">
        <circle className="a" cx="130" cy="78" r="16" />
        <path className="w" d="M125 70v16l13-8Z" />
      </g>
      <Spark x={36} y={30} /><Spark x={168} y={30} s={0.7} c="m" />
    </>
  ),
  resume: (
    <>
      <Ground />
      <rect className="p" x="56" y="18" width="88" height="112" rx="10" />
      <rect className="l" x="56" y="18" width="88" height="112" rx="10" />
      <Avatar x={80} y={44} r={12} />
      <rect className="a" x="98" y="36" width="34" height="5" rx="2.5" />
      <rect className="mu" x="98" y="47" width="24" height="4" rx="2" />
      <Lines x={68} y={66} w={[64, 52, 58, 40, 60]} n={5} gap={10} />
      <g className="float">
        <circle className="ok" cx="146" cy="104" r="14" />
        <path className="oks" style={{ stroke: '#fff' }} d="M139 104l5 5 9-10" />
      </g>
      <Spark x={44} y={34} /><Spark x={160} y={30} s={0.7} c="m" />
    </>
  ),
  jobs: (
    <>
      <Ground />
      <rect className="p" x="40" y="48" width="120" height="76" rx="12" />
      <rect className="l" x="40" y="48" width="120" height="76" rx="12" />
      <path className="l" d="M80 48v-9a7 7 0 0 1 7-7h26a7 7 0 0 1 7 7v9" />
      <path className="s" d="M40 72h120v14H40Z" />
      <path className="l" d="M40 79h120" />
      <rect className="a" x="92" y="74" width="16" height="12" rx="3" />
      <g className="float">
        <path className="a" d="M152 18a14 14 0 0 1 14 14c0 11-14 24-14 24s-14-13-14-24a14 14 0 0 1 14-14Z" />
        <circle className="w" cx="152" cy="32" r="5" />
      </g>
      <Spark x={30} y={40} c="m" /><Spark x={176} y={76} s={0.7} />
    </>
  ),
  leaderboard: (
    <>
      <Ground />
      <rect className="s" x="40" y="86" width="40" height="46" rx="4" />
      <rect className="a" x="80" y="66" width="40" height="66" rx="4" />
      <rect className="m" x="120" y="96" width="40" height="36" rx="4" />
      <path className="l" d="M40 132V90a4 4 0 0 1 4-4h36V70a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v26h36a4 4 0 0 1 4 4v32Z" />
      <path className="w" d="M100 82l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" />
      <text className="mu" x="60" y="114" textAnchor="middle" fontSize="16" fontWeight="700" style={{ fill: 'var(--i-line)' }}>2</text>
      <text x="140" y="120" textAnchor="middle" fontSize="16" fontWeight="700" style={{ fill: 'var(--i-line)' }}>3</text>
      <g className="float"><Avatar x={100} y={44} r={14} /></g>
      <Avatar x={60} y={70} r={11} c="p" />
      <Avatar x={140} y={80} r={11} c="p" />
      <Spark x={130} y={34} /><Spark x={68} y={34} s={0.7} c="m" />
    </>
  ),
  calendar: (
    <>
      <Ground />
      <rect className="p" x="42" y="30" width="116" height="96" rx="12" />
      <rect className="l" x="42" y="30" width="116" height="96" rx="12" />
      <path className="s" d="M42 42a12 12 0 0 1 12-12h92a12 12 0 0 1 12 12v12H42Z" />
      <path className="l" d="M42 54h116M70 22v16M130 22v16" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => (
          <rect key={`${r}${c}`} className={r === 1 && c === 3 ? 'a' : 'mu'} x={56 + c * 19} y={64 + r * 14} width="10" height="7" rx="2" />
        )),
      )}
      <g className="float">
        <circle className="ok" cx="152" cy="112" r="14" />
        <path className="oks" style={{ stroke: '#fff' }} d="M145 112l5 5 9-10" />
      </g>
      <Spark x={30} y={46} /><Spark x={170} y={36} s={0.7} c="m" />
    </>
  ),
  security: (
    <>
      <Ground />
      <path className="s" d="M100 16l48 18v32c0 30-21 50-48 62-27-12-48-32-48-62V34Z" />
      <path className="l" d="M100 16l48 18v32c0 30-21 50-48 62-27-12-48-32-48-62V34Z" />
      <g className="float">
        <rect className="a" x="80" y="64" width="40" height="32" rx="7" />
        <path className="l" d="M88 64v-8a12 12 0 0 1 24 0v8" />
        <circle className="w" cx="100" cy="78" r="4" />
        <rect className="w" x="98.5" y="80" width="3" height="8" rx="1.5" />
      </g>
      <Spark x={36} y={40} /><Spark x={166} y={50} s={0.7} c="m" /><Spark x={160} y={104} s={0.6} />
    </>
  ),
  settings: (
    <>
      <Ground />
      <rect className="p" x="34" y="34" width="84" height="88" rx="12" />
      <rect className="l" x="34" y="34" width="84" height="88" rx="12" />
      {[52, 76, 100].map((y, i) => (
        <g key={y}>
          <path className="lt" d={`M48 ${y}h56`} />
          <circle className={i === 1 ? 'a' : 'm'} cx={[62, 90, 74][i]} cy={y} r="6" />
        </g>
      ))}
      <g className="float" style={{ transformOrigin: '146px 70px' }}>
        <path
          className="a"
          d="M146 46l5 1 2 7 6 3 6-4 4 4-4 6 3 6 7 2v6l-7 2-3 6 4 6-4 4-6-4-6 3-2 7h-6l-2-7-6-3-6 4-4-4 4-6-3-6-7-2v-6l7-2 3-6-4-6 4-4 6 4 6-3 2-7Z"
        />
        <circle className="p" cx="146" cy="73" r="9" />
      </g>
      <Spark x={26} y={30} c="m" />
    </>
  ),
  team: (
    <>
      <Ground />
      <path className="lt" d="M100 46 56 92M100 46l44 46M56 92h88" />
      <g className="float"><Avatar x={100} y={44} r={18} c="a" /></g>
      <Avatar x={56} y={94} r={16} />
      <Avatar x={144} y={94} r={16} />
      <g className="float2">
        <circle className="a" cx="164" cy="44" r="12" />
        <path className="w" d="M163 38h2v5h5v2h-5v5h-2v-5h-5v-2h5Z" />
      </g>
      <Spark x={36} y={46} /><Spark x={100} y={120} s={0.6} c="m" />
    </>
  ),
  notifications: (
    <>
      <Ground />
      <g className="float" style={{ transformOrigin: '100px 30px' }}>
        <path className="s" d="M100 26c-20 0-32 15-32 36v22l-10 14h84l-10-14V62c0-21-12-36-32-36Z" />
        <path className="l" d="M100 26c-20 0-32 15-32 36v22l-10 14h84l-10-14V62c0-21-12-36-32-36Zm-12 72a12 12 0 0 0 24 0M100 18v8" />
      </g>
      <circle className="a" cx="128" cy="36" r="11" />
      <text x="128" y="40.5" textAnchor="middle" fontSize="12" fontWeight="700" className="w">3</text>
      <path className="lt" d="M48 50c-4 6-4 16 0 22M152 50c4 6 4 16 0 22" />
      <Spark x={36} y={34} /><Spark x={166} y={96} s={0.7} c="m" />
    </>
  ),
  search: (
    <>
      <Ground />
      <rect className="p" x="34" y="30" width="96" height="70" rx="10" />
      <rect className="l" x="34" y="30" width="96" height="70" rx="10" />
      <Lines x={46} y={44} w={[60, 44, 52, 36]} n={4} gap={11} />
      <g className="float">
        <circle className="s" cx="128" cy="86" r="24" />
        <circle className="l" cx="128" cy="86" r="24" />
        <path className="as" style={{ strokeWidth: 7 }} d="M146 104l16 16" />
        <path className="lt" d="M116 78a14 14 0 0 1 12-6" />
      </g>
      <Spark x={150} y={34} /><Spark x={26} y={110} s={0.7} c="m" />
    </>
  ),
  upload: (
    <>
      <Ground />
      <path className="s" d="M62 106a24 24 0 0 1-2-48 32 32 0 0 1 62-6 22 22 0 0 1 22 26 16 16 0 0 1-4 28Z" />
      <path className="l" d="M62 106a24 24 0 0 1-2-48 32 32 0 0 1 62-6 22 22 0 0 1 22 26 16 16 0 0 1-4 28Z" />
      <g className="float">
        <circle className="a" cx="100" cy="86" r="20" />
        <path className="as" style={{ stroke: '#fff' }} d="M100 96V76m-8 8 8-8 8 8" />
      </g>
      <Spark x={40} y={36} /><Spark x={160} y={40} s={0.7} c="m" />
    </>
  ),
  success: (
    <>
      <Ground />
      <circle className="s" cx="100" cy="72" r="44" />
      <g className="float">
        <circle className="ok" cx="100" cy="72" r="30" />
        <path className="oks" style={{ stroke: '#fff', strokeWidth: 5 }} d="M86 72l10 10 18-20" />
      </g>
      <rect className="a" x="46" y="34" width="8" height="4" rx="2" transform="rotate(-30 50 36)" />
      <rect className="wn" x="150" y="40" width="8" height="4" rx="2" transform="rotate(25 154 42)" />
      <rect className="m" x="152" y="100" width="8" height="4" rx="2" transform="rotate(-20 156 102)" />
      <circle className="a" cx="44" cy="100" r="3" />
      <Spark x={60} y={22} /><Spark x={142} y={20} s={0.7} c="m" /><Spark x={166} y={72} s={0.6} />
    </>
  ),
  error: (
    <>
      <Ground />
      <path className="p" d="M100 22l54 94H46Z" />
      <path className="l" d="M100 22l54 94H46Z" />
      <path className="s" d="M100 40l38 66H62Z" />
      <g className="float">
        <rect className="wn" x="95" y="56" width="10" height="32" rx="5" />
        <circle className="wn" cx="100" cy="100" r="6" />
      </g>
      <path className="lt" d="M30 60l10 4M170 60l-10 4M38 34l8 8M162 34l-8 8" />
    </>
  ),
  ai: (
    <>
      <Ground />
      <rect className="p" x="56" y="34" width="88" height="88" rx="18" />
      <rect className="l" x="56" y="34" width="88" height="88" rx="18" />
      <path className="lt" d="M76 34v-12M100 34v-12M124 34v-12M76 122v10M124 122v10M56 58H44M56 98H44M144 58h12M144 98h12" />
      <rect className="s" x="72" y="50" width="56" height="56" rx="12" />
      <g className="twinkle" style={{ transformOrigin: '100px 78px' }}>
        <path className="a" d="M100 58l5 15 15 5-15 5-5 15-5-15-15-5 15-5Z" />
      </g>
      <Spark x={128} y={58} s={0.7} c="w" />
      <Spark x={36} y={36} /><Spark x={168} y={110} s={0.7} c="m" />
    </>
  ),
  'mock-test': (
    <>
      <Ground />
      <rect className="p" x="38" y="26" width="86" height="104" rx="10" />
      <rect className="l" x="38" y="26" width="86" height="104" rx="10" />
      {[46, 70, 94].map((y, i) => (
        <g key={y}>
          <rect className={i < 2 ? 'ok' : 's'} x="50" y={y - 6} width="12" height="12" rx="3" />
          {i < 2 && <path className="oks" style={{ stroke: '#fff', strokeWidth: 2 }} d={`M53 ${y}l2.5 2.5 4.5-5`} />}
          <rect className="mu" x="70" y={y - 2} width={[40, 32, 44][i]} height="4" rx="2" />
        </g>
      ))}
      <g className="float">
        <circle className="p" cx="140" cy="92" r="26" />
        <circle className="l" cx="140" cy="92" r="26" />
        <path className="l" d="M134 62h12M140 62v4" />
        <path className="a" d="M140 92V72a20 20 0 0 1 17 30Z" opacity=".9" />
        <path className="as" d="M140 92V76" />
      </g>
      <Spark x={30} y={30} /><Spark x={174} y={50} s={0.7} c="m" />
    </>
  ),
  assessment: (
    <>
      <Ground />
      <rect className="p" x="50" y="26" width="100" height="106" rx="10" />
      <rect className="l" x="50" y="26" width="100" height="106" rx="10" />
      <rect className="a" x="80" y="18" width="40" height="16" rx="6" />
      {[50, 74, 98].map((y, i) => (
        <g key={y}>
          <rect className="mu" x="62" y={y} width={[44, 38, 48][i]} height="4" rx="2" />
          <rect className={['s', 'm', 'a'][i]} x="116" y={y - 4} width="24" height="12" rx="6" />
          <rect className="mu" x="62" y={y + 9} width="28" height="3" rx="1.5" opacity=".6" />
        </g>
      ))}
      <g className="float"><CodeMark x={164} y={44} s={1} /></g>
      <Spark x={36} y={44} /><Spark x={168} y={110} s={0.7} c="m" />
    </>
  ),
  billing: (
    <>
      <Ground />
      <rect className="p" x="92" y="20" width="62" height="96" rx="6" />
      <rect className="l" x="92" y="20" width="62" height="96" rx="6" />
      <Lines x={102} y={34} w={[42, 30, 36, 24]} n={4} gap={10} />
      <rect className="a" x="102" y="84" width="42" height="6" rx="3" />
      <g className="float">
        <rect className="a" x="34" y="62" width="88" height="56" rx="10" />
        <rect className="w" x="34" y="74" width="88" height="10" opacity=".35" />
        <rect className="w" x="44" y="96" width="30" height="5" rx="2.5" opacity=".9" />
        <circle className="w" cx="104" cy="102" r="7" opacity=".55" />
        <circle className="w" cx="96" cy="102" r="7" opacity=".85" />
      </g>
      <Spark x={30} y={40} c="m" /><Spark x={168} y={40} s={0.7} />
    </>
  ),
  launch: (
    <>
      <Ground />
      <g className="float">
        <path className="p" d="M100 18c18 12 26 34 22 60H78c-4-26 4-48 22-60Z" />
        <path className="l" d="M100 18c18 12 26 34 22 60H78c-4-26 4-48 22-60Z" />
        <circle className="a" cx="100" cy="50" r="9" />
        <path className="m" d="M78 62l-14 18 16-2ZM122 62l14 18-16-2Z" />
        <path className="a" d="M88 82h24l-4 16h-16Z" />
        <path className="wn" d="M94 98h12l-6 16Z" />
      </g>
      <path className="lt" d="M58 104v14M142 100v18M74 120v8M126 118v10" />
      <Spark x={44} y={36} /><Spark x={154} y={30} s={0.8} c="m" /><Spark x={160} y={70} s={0.6} />
    </>
  ),
  inbox: (
    <>
      <Ground />
      <path className="s" d="M40 82l18-42h84l18 42v34a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8Z" />
      <path className="l" d="M40 82l18-42h84l18 42v34a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8Zm0 0h34l6 12h40l6-12h34" />
      <g className="float">
        <rect className="p" x="74" y="22" width="52" height="40" rx="6" />
        <rect className="l" x="74" y="22" width="52" height="40" rx="6" />
        <Lines x={84} y={32} w={[32, 22]} n={2} gap={9} />
      </g>
      <Spark x={30} y={40} /><Spark x={170} y={50} s={0.7} c="m" />
    </>
  ),
  bookmarks: (
    <>
      <Ground />
      <rect className="p" x="44" y="30" width="78" height="96" rx="10" />
      <rect className="l" x="44" y="30" width="78" height="96" rx="10" />
      <Lines x={56} y={50} w={[54, 40, 48, 34]} n={4} gap={11} />
      <g className="float">
        <path className="a" d="M118 22h36v84l-18-14-18 14Z" />
        <path className="w" d="M136 44l3.5 7.2 7.9 1.1-5.7 5.6 1.3 7.9-7-3.7-7 3.7 1.3-7.9-5.7-5.6 7.9-1.1Z" />
      </g>
      <Spark x={34} y={36} c="m" /><Spark x={170} y={110} s={0.7} />
    </>
  ),
  'not-found': (
    <>
      <Ground />
      <text x="100" y="96" textAnchor="middle" fontSize="64" fontWeight="800" className="s" style={{ letterSpacing: '-2px' }}>404</text>
      <g className="float">
        <circle className="p" cx="104" cy="70" r="22" />
        <circle className="l" cx="104" cy="70" r="22" />
        <path className="as" style={{ strokeWidth: 6 }} d="M120 86l16 16" />
        <path className="l" d="M97 63l14 14M111 63 97 77" />
      </g>
      <Spark x={44} y={40} /><Spark x={160} y={36} s={0.7} c="m" />
    </>
  ),
  locked: (
    <>
      <Ground />
      <g className="float">
        <rect className="a" x="64" y="62" width="72" height="58" rx="12" />
        <path className="l" d="M78 62V48a22 22 0 0 1 44 0v14" />
        <circle className="w" cx="100" cy="86" r="7" />
        <rect className="w" x="97" y="90" width="6" height="14" rx="3" />
      </g>
      <Spark x={44} y={44} /><Spark x={156} y={40} s={0.7} c="m" />
    </>
  ),
  integrations: (
    <>
      <Ground />
      <path className="lt" d="M100 74 52 40M100 74l48-34M100 74l-48 40M100 74l48 40" />
      <g className="float"><rect className="a" x="78" y="52" width="44" height="44" rx="12" /><CodeMark x={100} y={74} s={0.9} /></g>
      {[[52, 40], [148, 40], [52, 112], [148, 112]].map(([x, y], i) => (
        <g key={i}>
          <rect className="p" x={x - 14} y={y - 14} width="28" height="28" rx="8" />
          <rect className="l" x={x - 14} y={y - 14} width="28" height="28" rx="8" />
          <circle className={i % 2 ? 'm' : 's'} cx={x} cy={y} r="6" />
        </g>
      ))}
    </>
  ),
  scanner: (
    <>
      <Ground />
      <rect className="p" x="40" y="24" width="104" height="96" rx="10" />
      <rect className="l" x="40" y="24" width="104" height="96" rx="10" />
      {[38, 50, 62, 74, 86, 98].map((y, i) => (
        <rect key={y} className={i === 3 ? 'bd' : 'mu'} x={52 + (i % 2) * 10} y={y} width={[52, 40, 60, 44, 36, 50][i]} height="4" rx="2" />
      ))}
      <rect className="m" x="40" y="66" width="104" height="3" opacity=".9" />
      <g className="float">
        <circle className="a" cx="148" cy="100" r="18" />
        <path className="as" style={{ stroke: '#fff' }} d="M141 100l5 5 9-10" />
      </g>
      <Spark x={30} y={36} /><Spark x={166} y={40} s={0.7} c="m" />
    </>
  ),
}

export function Illustration({
  name,
  className,
  inverse,
  title,
}: {
  name: IllustrationName
  className?: string
  /** White line art for use on the royal-blue banner. */
  inverse?: boolean
  /** Accessible name; omit for decorative use. */
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 200 150"
      className={cn('cs-illo h-auto w-40', inverse && 'cs-illo-inverse', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {ART[name]}
    </svg>
  )
}

export const ILLUSTRATION_NAMES = Object.keys(ART) as IllustrationName[]
