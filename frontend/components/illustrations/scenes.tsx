import { cn } from '@/lib/utils'

/**
 * CodeSpectra scene illustrations — larger vector scenes with people
 * (viewBox 480×320). Same token system as the spot set (`.cs-illo` in
 * globals.css), so they work in light and dark. Flat figures, 2px outlines,
 * royal-blue clothing and props, a mix of skin tones. Decorative by default.
 */

export type SceneName =
  | 'hiring-team' | 'candidate-desk' | 'hackathon-team' | 'proctored-test'
  | 'certificate-win' | 'interview-call' | 'learning' | 'analytics-review'

type Skin = 'sk1' | 'sk2' | 'sk3'
type Hair = 'short' | 'long' | 'bun' | 'curly'
type Shirt = 'a' | 'm' | 's'

const Ground = ({ w = 190 }: { w?: number }) => <ellipse className="g" cx="240" cy="300" rx={w} ry="12" />
const Spark = ({ x, y, s = 1, c = 'a' }: { x: number; y: number; s?: number; c?: string }) => (
  <path className={cn(c, 'twinkle')} transform={`translate(${x} ${y}) scale(${s})`} d="M0-7 1.6-1.6 7 0 1.6 1.6 0 7-1.6 1.6-7 0-1.6-1.6Z" />
)

function hairParts(x: number, y: number, r: number, hair: Hair, tone: string): { back?: React.ReactNode; front: React.ReactNode } {
  const cap = <path className={tone} d={`M${x - r} ${y + 1}a${r} ${r} 0 0 1 ${2 * r} 0c-5-6-13-8-${2 * r - 6} -3Z`} />
  switch (hair) {
    case 'long':
      return { back: <rect className={tone} x={x - r - 3} y={y - r - 1} width={2 * r + 6} height={r * 2.7} rx={r} />, front: cap }
    case 'bun':
      return { back: <circle className={tone} cx={x} cy={y - r - 3} r={r * 0.48} />, front: cap }
    case 'curly':
      return {
        front: (
          <g className={tone}>
            {[-0.85, -0.4, 0.05, 0.5, 0.9].map((k, i) => (
              <circle key={i} cx={x + k * r} cy={y - r * 0.62 + (i % 2) * 2} r={r * 0.42} />
            ))}
          </g>
        ),
      }
    default:
      return { front: cap }
  }
}

/** Head + hair. */
function Head({ x, y, r = 15, skin, hair, hairTone = 'hr' }: { x: number; y: number; r?: number; skin: Skin; hair: Hair; hairTone?: string }) {
  const parts = hairParts(x, y, r, hair, hairTone)
  return (
    <g>
      {parts.back}
      <circle className={skin} cx={x} cy={y} r={r} />
      {parts.front}
      <circle className="l" cx={x} cy={y} r={r} style={{ strokeWidth: 1.5, opacity: 0.35 }} />
    </g>
  )
}

/** Standing person, feet at (x, base). `pose` sets the right arm. */
function Standing({
  x, base, skin, hair, shirt = 'a', hairTone, pose = 'rest', flip = false,
}: { x: number; base: number; skin: Skin; hair: Hair; shirt?: Shirt; hairTone?: string; pose?: 'rest' | 'point' | 'raise' | 'hold'; flip?: boolean }) {
  const d = flip ? -1 : 1
  const shoulderY = base - 104
  const hand =
    pose === 'point' ? [x + d * 54, shoulderY - 22] : pose === 'raise' ? [x + d * 30, shoulderY - 48] : pose === 'hold' ? [x + d * 30, shoulderY + 26] : [x + d * 20, shoulderY + 46]
  return (
    <g>
      <rect className="ink" x={x - 15} y={base - 62} width="13" height="60" rx="6" />
      <rect className="ink" x={x + 2} y={base - 62} width="13" height="60" rx="6" />
      <ellipse className="ink" cx={x - 10} cy={base - 2} rx="10" ry="4" />
      <ellipse className="ink" cx={x + 10} cy={base - 2} rx="10" ry="4" />
      <path className={`arm ${shirt}`} d={`M${x - d * 16} ${shoulderY + 6}l${-d * 6} 40`} />
      <circle className={skin} cx={x - d * 22} cy={shoulderY + 48} r="5" />
      <rect className={shirt} x={x - 20} y={shoulderY - 4} width="40" height="54" rx="14" />
      <path className={`arm ${shirt}`} d={`M${x + d * 16} ${shoulderY + 6}L${hand[0]} ${hand[1]}`} />
      <circle className={skin} cx={hand[0]} cy={hand[1]} r="5" />
      <rect className={skin} x={x - 5} y={shoulderY - 12} width="10" height="10" rx="3" />
      <Head x={x} y={shoulderY - 26} skin={skin} hair={hair} hairTone={hairTone} />
    </g>
  )
}

/** Seated person (upper body), torso bottom at (x, seat). Hands reach toward `reach`. */
function Seated({
  x, seat, skin, hair, shirt = 'a', hairTone, reach,
}: { x: number; seat: number; skin: Skin; hair: Hair; shirt?: Shirt; hairTone?: string; reach: [number, number] }) {
  const sh = seat - 50
  return (
    <g>
      <rect className={shirt} x={x - 21} y={sh - 4} width="42" height="56" rx="15" />
      <path className={`arm ${shirt}`} d={`M${x - 14} ${sh + 8}Q${x - 18} ${sh + 34} ${reach[0] - 10} ${reach[1]}`} />
      <path className={`arm ${shirt}`} d={`M${x + 14} ${sh + 8}Q${x + 10} ${sh + 34} ${reach[0] + 8} ${reach[1]}`} />
      <circle className={skin} cx={reach[0] - 10} cy={reach[1]} r="5" />
      <circle className={skin} cx={reach[0] + 8} cy={reach[1]} r="5" />
      <rect className={skin} x={x - 5} y={sh - 12} width="10" height="10" rx="3" />
      <Head x={x} y={sh - 26} skin={skin} hair={hair} hairTone={hairTone} />
    </g>
  )
}

function Laptop({ x, y, w = 86, open = true, code = true }: { x: number; y: number; w?: number; open?: boolean; code?: boolean }) {
  const h = w * 0.62
  return (
    <g>
      {open && (
        <>
          <rect className="p" x={x - w / 2} y={y - h} width={w} height={h} rx="6" />
          <rect className="l" x={x - w / 2} y={y - h} width={w} height={h} rx="6" />
          {code && (
            <>
              <rect className="a" x={x - w / 2 + 10} y={y - h + 12} width={w * 0.22} height="4" rx="2" />
              <rect className="mu" x={x - w / 2 + 10 + w * 0.26} y={y - h + 12} width={w * 0.3} height="4" rx="2" />
              <rect className="mu" x={x - w / 2 + 18} y={y - h + 22} width={w * 0.44} height="4" rx="2" />
              <rect className="m" x={x - w / 2 + 18} y={y - h + 32} width={w * 0.3} height="4" rx="2" />
              <rect className="mu" x={x - w / 2 + 10} y={y - h + 42} width={w * 0.36} height="4" rx="2" />
            </>
          )}
        </>
      )}
      <path className="m" d={`M${x - w / 2 - 10} ${y}h${w + 20}l-6 7h${-w - 8}Z`} />
    </g>
  )
}

function Desk({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g>
      <rect className="desk" x={x1} y={y} width={x2 - x1} height="12" rx="4" />
      <rect className="l" x={x1} y={y} width={x2 - x1} height="12" rx="4" style={{ opacity: 0.4 }} />
      <rect className="desk" x={x1 + 14} y={y + 12} width="8" height={300 - y - 14} rx="3" />
      <rect className="desk" x={x2 - 22} y={y + 12} width="8" height={300 - y - 14} rx="3" />
    </g>
  )
}

function Plant({ x, base }: { x: number; base: number }) {
  return (
    <g>
      <path className="m" d={`M${x} ${base - 26}c-14-8-18-26-10-34 8 8 12 22 10 34Z`} />
      <path className="a" d={`M${x} ${base - 26}c12-10 14-28 6-36-8 10-10 24-6 36Z`} />
      <path className="s" d={`M${x - 14} ${base - 26}h28l-4 26h-20Z`} />
      <path className="l" d={`M${x - 14} ${base - 26}h28l-4 26h-20Z`} />
    </g>
  )
}

const SCENES: Record<SceneName, React.ReactNode> = {
  'hiring-team': (
    <>
      <Ground w={200} />
      {/* big board */}
      <rect className="p" x="150" y="36" width="230" height="160" rx="14" />
      <rect className="l" x="150" y="36" width="230" height="160" rx="14" />
      <rect className="mu" x="168" y="54" width="90" height="6" rx="3" />
      <rect className="a" x="320" y="50" width="44" height="14" rx="7" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <circle className={i < 3 ? 'a' : 'm'} cx="178" cy={84 + i * 21} r="7" />
          <rect className="mu" x="192" y={81 + i * 21} width="60" height="5" rx="2.5" />
          <rect className="s" x="264" y={80 + i * 21} width="96" height="8" rx="4" />
          <rect className={i < 3 ? 'a' : 'm'} x="264" y={80 + i * 21} width={[92, 84, 78, 60, 52][i]} height="8" rx="4" />
        </g>
      ))}
      <path className="as" d="M168 150h192" strokeDasharray="5 5" />
      <rect className="desk" x="258" y="196" width="12" height="104" rx="4" />
      <Standing x={108} base={298} skin="sk2" hair="bun" shirt="a" pose="point" />
      <Standing x={410} base={298} skin="sk1" hair="short" shirt="m" pose="hold" flip />
      <g className="float">
        <rect className="a" x="40" y="60" width="74" height="36" rx="12" />
        <path className="as" style={{ stroke: '#fff' }} d="M54 78l6 6 12-12" />
        <rect className="w" x="78" y="74" width="26" height="4" rx="2" opacity=".85" />
        <rect className="w" x="78" y="82" width="18" height="4" rx="2" opacity=".6" />
      </g>
      <Spark x={130} y={30} /><Spark x={420} y={60} s={0.8} c="m" /><Spark x={30} y={140} s={0.6} />
    </>
  ),
  'candidate-desk': (
    <>
      <Ground w={180} />
      <Plant x={86} base={196} />
      <Desk x1={70} x2={410} y={196} />
      <Laptop x={276} y={194} w={120} />
      <rect className="s" x="128" y="176" width="40" height="18" rx="4" />
      <rect className="l" x="128" y="176" width="40" height="18" rx="4" style={{ opacity: 0.5 }} />
      <path className="ink" d="M196 300v-58a12 12 0 0 1 12-12h20v70" opacity=".9" />
      <Seated x={214} seat={232} skin="sk3" hair="curly" shirt="a" reach={[262, 186]} />
      <g className="float">
        <rect className="p" x="330" y="40" width="96" height="44" rx="14" />
        <rect className="l" x="330" y="40" width="96" height="44" rx="14" />
        <circle className="a" cx="352" cy="62" r="11" />
        <path className="as" style={{ stroke: '#fff', strokeWidth: 2 }} d="M352 56v6l4 3" />
        <rect className="mu" x="370" y="54" width="44" height="5" rx="2.5" />
        <rect className="a" x="370" y="64" width="30" height="6" rx="3" />
      </g>
      <g className="float2">
        <rect className="ok" x="54" y="70" width="88" height="34" rx="12" />
        <path className="as" style={{ stroke: '#fff' }} d="M68 87l5 5 10-10" />
        <rect className="w" x="92" y="81" width="38" height="4" rx="2" opacity=".9" />
        <rect className="w" x="92" y="89" width="26" height="4" rx="2" opacity=".7" />
      </g>
      <Spark x={300} y={40} /><Spark x={440} y={120} s={0.7} c="m" />
    </>
  ),
  'hackathon-team': (
    <>
      <Ground w={210} />
      <Desk x1={80} x2={400} y={210} />
      <Seated x={150} seat={236} skin="sk1" hair="long" shirt="m" hairTone="hr2" reach={[150, 200]} />
      <Seated x={330} seat={236} skin="sk3" hair="short" shirt="a" reach={[330, 200]} />
      <Laptop x={150} y={208} w={66} code={false} />
      <Laptop x={330} y={208} w={66} code={false} />
      <circle className="w" cx="150" cy="188" r="4" opacity=".7" />
      <circle className="w" cx="330" cy="188" r="4" opacity=".7" />
      <Standing x={240} base={298} skin="sk2" hair="short" shirt="a" pose="raise" />
      {/* sticky notes */}
      {[[60, 40, 'a'], [96, 52, 'm'], [380, 36, 's'], [414, 56, 'a']].map(([x, y, c], i) => (
        <g key={i} className={i % 2 ? 'float2' : 'float'}>
          <rect className={c as string} x={x as number} y={y as number} width="30" height="30" rx="4" transform={`rotate(${i % 2 ? 6 : -6} ${(x as number) + 15} ${(y as number) + 15})`} />
        </g>
      ))}
      <g className="float">
        <path className="wn" d="M226 52h28v12c0 9-6 15-14 15s-14-6-14-15Z" />
        <rect className="wn" x="234" y="79" width="12" height="8" rx="2" />
        <rect className="wn" x="228" y="86" width="24" height="5" rx="2" />
      </g>
      <Spark x={200} y={40} /><Spark x={290} y={34} s={0.8} c="m" /><Spark x={444} y={110} s={0.6} />
    </>
  ),
  'proctored-test': (
    <>
      <Ground w={190} />
      <Desk x1={80} x2={400} y={214} />
      {/* monitor */}
      <rect className="p" x="232" y="76" width="150" height="104" rx="10" />
      <rect className="l" x="232" y="76" width="150" height="104" rx="10" />
      <path className="l" d="M300 180v20h-26M314 180v20h26" />
      <rect className="s" x="244" y="88" width="126" height="80" rx="6" />
      <Head x={307} y={118} r={14} skin="sk2" hair="bun" />
      <path className="m" d="M285 162c2-14 10-20 22-20s20 6 22 20Z" />
      <path className="as" d="M262 98v-6h8M352 98v-6h-8M262 158v6h8M352 158v6h-8" />
      <circle className="bd" cx="372" cy="86" r="4" />
      <Seated x={172} seat={254} skin="sk2" hair="bun" shirt="a" reach={[214, 206]} />
      <path className="m" d="M196 212h60l-4 6h-52Z" />
      <g className="float">
        <path className="a" d="M412 108l26 10v18c0 16-11 26-26 32-15-6-26-16-26-32v-18Z" />
        <path className="as" style={{ stroke: '#fff' }} d="M402 136l7 7 13-14" />
      </g>
      <g className="float2">
        <rect className="p" x="40" y="70" width="104" height="58" rx="12" />
        <rect className="l" x="40" y="70" width="104" height="58" rx="12" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle className={i === 1 ? 'wn' : 'ok'} cx="56" cy={86 + i * 14} r="4" />
            <rect className="mu" x="66" y={84 + i * 14} width={[64, 52, 58][i]} height="4" rx="2" />
          </g>
        ))}
      </g>
      <Spark x={226} y={50} /><Spark x={450} y={190} s={0.7} c="m" />
    </>
  ),
  'certificate-win': (
    <>
      <Ground w={170} />
      <Standing x={240} base={298} skin="sk1" hair="long" shirt="a" pose="raise" hairTone="hr2" />
      <g className="float">
        <rect className="p" x="268" y="86" width="120" height="84" rx="8" transform="rotate(-6 328 128)" />
        <rect className="l" x="268" y="86" width="120" height="84" rx="8" transform="rotate(-6 328 128)" />
        <g transform="rotate(-6 328 128)">
          <rect className="a" x="294" y="102" width="68" height="6" rx="3" />
          <rect className="mu" x="288" y="116" width="80" height="4" rx="2" />
          <rect className="mu" x="296" y="126" width="64" height="4" rx="2" />
          <circle className="a" cx="360" cy="152" r="11" />
          <path className="w" d="M360 146l1.6 3.4 3.7.5-2.7 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7-2.7-2.6 3.7-.5Z" />
        </g>
      </g>
      {[[120, 70, 'a', -30], [150, 120, 'wn', 20], [380, 60, 'm', 40], [420, 150, 'a', -20], [110, 200, 'm', 10], [400, 230, 'wn', -40], [180, 40, 'ok', 15]].map(([x, y, c, r], i) => (
        <rect key={i} className={cn(c as string, 'twinkle')} x={x as number} y={y as number} width="12" height="5" rx="2.5" transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <Spark x={300} y={50} /><Spark x={170} y={170} s={0.7} c="m" /><Spark x={440} y={110} s={0.6} />
    </>
  ),
  'interview-call': (
    <>
      <Ground w={200} />
      <rect className="p" x="70" y="40" width="340" height="210" rx="16" />
      <rect className="l" x="70" y="40" width="340" height="210" rx="16" />
      <rect className="s" x="86" y="56" width="150" height="150" rx="10" />
      <rect className="s" x="244" y="56" width="150" height="150" rx="10" />
      <Head x={161} y={112} r={22} skin="sk3" hair="short" />
      <path className="a" d="M121 206c4-30 20-44 40-44s36 14 40 44Z" />
      <Head x={319} y={112} r={22} skin="sk1" hair="bun" hairTone="hr2" />
      <path className="m" d="M279 206c4-30 20-44 40-44s36 14 40 44Z" />
      {[0, 1, 2].map((i) => (
        <circle key={i} className={i === 2 ? 'bd' : 'm'} cx={210 + i * 30} cy="228" r="10" />
      ))}
      <g className="float">
        <path className="a" d="M330 0h0" />
        <rect className="a" x="356" y="20" width="96" height="42" rx="14" />
        <path className="a" d="M372 62l-4 12 14-12Z" />
        <rect className="w" x="370" y="34" width="66" height="5" rx="2.5" opacity=".9" />
        <rect className="w" x="370" y="44" width="44" height="5" rx="2.5" opacity=".7" />
      </g>
      <g className="float2">
        <rect className="p" x="24" y="150" width="86" height="40" rx="14" />
        <rect className="l" x="24" y="150" width="86" height="40" rx="14" />
        <rect className="mu" x="38" y="163" width="56" height="5" rx="2.5" />
        <rect className="mu" x="38" y="173" width="38" height="5" rx="2.5" />
      </g>
      <Spark x={60} y={30} /><Spark x={440} y={140} s={0.7} c="m" />
    </>
  ),
  learning: (
    <>
      <Ground w={170} />
      {/* stack of books */}
      {[[150, 262, 180, 'a'], [160, 236, 160, 'm'], [146, 210, 172, 's']].map(([x, y, w, c], i) => (
        <g key={i}>
          <rect className={c as string} x={x as number} y={y as number} width={w as number} height="26" rx="5" />
          <rect className="l" x={x as number} y={y as number} width={w as number} height="26" rx="5" style={{ opacity: 0.45 }} />
          <rect className="w" x={(x as number) + 12} y={(y as number) + 11} width={(w as number) * 0.5} height="4" rx="2" opacity=".55" />
        </g>
      ))}
      <Seated x={240} seat={206} skin="sk2" hair="curly" shirt="a" reach={[270, 166]} />
      <rect className="p" x="258" y="132" width="56" height="40" rx="6" transform="rotate(-10 286 152)" />
      <rect className="l" x="258" y="132" width="56" height="40" rx="6" transform="rotate(-10 286 152)" />
      <g className="float">
        <circle className="a" cx="372" cy="80" r="26" />
        <path className="w" d="M364 68v24l20-12Z" />
      </g>
      <g className="float2">
        <rect className="p" x="70" y="70" width="96" height="44" rx="12" />
        <rect className="l" x="70" y="70" width="96" height="44" rx="12" />
        <rect className="mu" x="84" y="84" width="60" height="5" rx="2.5" />
        <rect className="s" x="84" y="96" width="68" height="6" rx="3" />
        <rect className="a" x="84" y="96" width="44" height="6" rx="3" />
      </g>
      <Spark x={330} y={140} /><Spark x={60} y={160} s={0.7} c="m" /><Spark x={420} y={150} s={0.6} />
    </>
  ),
  'analytics-review': (
    <>
      <Ground w={200} />
      <rect className="p" x="176" y="40" width="226" height="170" rx="14" />
      <rect className="l" x="176" y="40" width="226" height="170" rx="14" />
      <rect className="mu" x="194" y="58" width="70" height="6" rx="3" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} className={i === 5 ? 'a' : i % 2 ? 'm' : 's'} x={198 + i * 32} y={190 - [40, 64, 52, 84, 72, 110][i]} width="20" height={[40, 64, 52, 84, 72, 110][i]} rx="4" />
      ))}
      <path className="as" d="M208 140l32-20 32 8 32-30 32 10 32-34" />
      <path className="lt" d="M194 190h192" />
      <rect className="desk" x="283" y="210" width="12" height="90" rx="4" />
      <Standing x={120} base={298} skin="sk3" hair="long" shirt="a" pose="point" />
      <g className="float">
        <rect className="a" x="356" y="16" width="88" height="40" rx="14" />
        <path className="as" style={{ stroke: '#fff' }} d="M370 42l10-10 8 6 14-14" />
        <rect className="w" x="410" y="30" width="24" height="5" rx="2.5" opacity=".85" />
      </g>
      <Spark x={150} y={50} /><Spark x={430} y={120} s={0.7} c="m" /><Spark x={60} y={110} s={0.6} />
    </>
  ),
}

export function Scene({
  name,
  className,
  title,
}: {
  name: SceneName
  className?: string
  /** Accessible name; omit for decorative use. */
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 480 320"
      className={cn('cs-illo h-auto w-full max-w-[480px]', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {SCENES[name]}
    </svg>
  )
}

export const SCENE_NAMES = Object.keys(SCENES) as SceneName[]
