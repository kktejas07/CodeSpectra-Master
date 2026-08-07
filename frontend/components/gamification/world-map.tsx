'use client'

import { useMemo, useState } from 'react'

interface WorldMapProps {
  countries: Array<{ code: string; name: string; count: number }>
  totalRequests: number
}

const COUNTRY_PATHS: Record<string, { path: string; name: string }> = {
  US: { path: 'M 25 62 L 30 58 L 38 55 L 42 52 L 48 53 L 50 56 L 48 60 L 44 64 L 38 68 L 32 68 L 26 65 Z', name: 'United States' },
  CA: { path: 'M 22 38 L 28 34 L 35 32 L 42 33 L 48 36 L 50 40 L 48 44 L 42 48 L 35 50 L 28 48 L 22 44 Z', name: 'Canada' },
  MX: { path: 'M 18 65 L 22 62 L 28 64 L 30 68 L 28 72 L 24 74 L 20 72 L 16 68 Z', name: 'Mexico' },
  BR: { path: 'M 45 75 L 52 72 L 58 74 L 60 80 L 58 86 L 52 90 L 46 88 L 42 82 L 42 78 Z', name: 'Brazil' },
  AR: { path: 'M 40 90 L 44 88 L 48 92 L 46 98 L 42 102 L 38 100 L 36 96 L 38 92 Z', name: 'Argentina' },
  GB: { path: 'M 62 38 L 64 36 L 66 38 L 64 42 L 62 42 Z', name: 'United Kingdom' },
  FR: { path: 'M 63 46 L 67 44 L 70 46 L 70 50 L 66 52 L 63 50 Z', name: 'France' },
  DE: { path: 'M 68 42 L 72 40 L 76 42 L 76 46 L 72 48 L 68 46 Z', name: 'Germany' },
  ES: { path: 'M 58 50 L 64 48 L 68 50 L 68 54 L 64 56 L 58 54 Z', name: 'Spain' },
  IT: { path: 'M 70 50 L 74 48 L 76 52 L 74 56 L 72 54 Z', name: 'Italy' },
  RU: { path: 'M 80 28 L 100 24 L 120 26 L 140 30 L 148 34 L 144 40 L 136 44 L 120 46 L 104 44 L 88 42 L 80 38 Z', name: 'Russia' },
  CN: { path: 'M 120 48 L 132 44 L 140 48 L 142 54 L 138 60 L 130 64 L 122 62 L 118 56 L 118 52 Z', name: 'China' },
  JP: { path: 'M 148 50 L 152 48 L 154 52 L 152 56 L 148 56 L 146 52 Z', name: 'Japan' },
  IN: { path: 'M 104 56 L 112 52 L 118 56 L 118 66 L 112 72 L 106 70 L 102 64 L 102 60 Z', name: 'India' },
  AU: { path: 'M 130 84 L 142 80 L 152 82 L 156 88 L 152 96 L 144 100 L 134 98 L 128 92 L 128 88 Z', name: 'Australia' },
  NG: { path: 'M 68 66 L 74 64 L 78 66 L 78 72 L 74 74 L 68 72 Z', name: 'Nigeria' },
  ZA: { path: 'M 76 96 L 82 92 L 88 94 L 88 100 L 82 104 L 76 102 Z', name: 'South Africa' },
  EG: { path: 'M 76 56 L 82 54 L 86 56 L 86 62 L 82 64 L 76 62 Z', name: 'Egypt' },
  SA: { path: 'M 84 58 L 92 54 L 96 58 L 96 66 L 92 70 L 84 68 Z', name: 'Saudi Arabia' },
  TR: { path: 'M 76 48 L 84 46 L 88 48 L 88 52 L 84 54 L 76 52 Z', name: 'Turkey' },
  KR: { path: 'M 142 50 L 146 48 L 148 50 L 148 54 L 146 56 L 142 54 Z', name: 'South Korea' },
  SE: { path: 'M 72 30 L 76 28 L 78 32 L 76 38 L 72 38 L 70 34 Z', name: 'Sweden' },
  NO: { path: 'M 68 26 L 72 24 L 76 28 L 74 34 L 70 36 L 66 32 Z', name: 'Norway' },
  NL: { path: 'M 66 40 L 70 38 L 72 40 L 72 44 L 70 46 L 66 44 Z', name: 'Netherlands' },
  SG: { path: 'M 118 68 L 120 67 L 121 68 L 120 69 L 118 69 Z', name: 'Singapore' },
  NZ: { path: 'M 160 100 L 164 98 L 166 100 L 164 106 L 160 106 L 158 102 Z', name: 'New Zealand' },
  ID: { path: 'M 124 72 L 134 70 L 140 72 L 140 78 L 134 80 L 124 78 Z', name: 'Indonesia' },
  TH: { path: 'M 120 60 L 124 58 L 126 60 L 126 66 L 124 68 L 120 66 Z', name: 'Thailand' },
  VN: { path: 'M 128 58 L 132 56 L 134 58 L 134 66 L 132 70 L 128 68 Z', name: 'Vietnam' },
  PH: { path: 'M 138 60 L 142 58 L 144 60 L 144 66 L 142 68 L 138 66 Z', name: 'Philippines' },
  MY: { path: 'M 122 66 L 128 64 L 130 66 L 130 70 L 128 72 L 122 70 Z', name: 'Malaysia' },
  PK: { path: 'M 100 52 L 106 50 L 110 52 L 110 58 L 106 60 L 100 58 Z', name: 'Pakistan' },
  BD: { path: 'M 114 58 L 118 56 L 120 58 L 120 62 L 118 64 L 114 62 Z', name: 'Bangladesh' },
  KE: { path: 'M 80 68 L 84 66 L 88 68 L 88 74 L 84 76 L 80 74 Z', name: 'Kenya' },
  CL: { path: 'M 36 88 L 40 86 L 42 90 L 42 100 L 40 106 L 36 104 L 34 96 Z', name: 'Chile' },
  CO: { path: 'M 34 68 L 40 66 L 44 68 L 44 74 L 40 76 L 34 74 Z', name: 'Colombia' },
  PE: { path: 'M 34 76 L 40 74 L 44 76 L 44 82 L 40 84 L 34 82 Z', name: 'Peru' },
  PL: { path: 'M 74 38 L 80 36 L 84 38 L 84 42 L 80 44 L 74 42 Z', name: 'Poland' },
  UA: { path: 'M 80 40 L 88 38 L 94 40 L 94 44 L 88 46 L 80 44 Z', name: 'Ukraine' },
  IR: { path: 'M 92 52 L 98 50 L 102 52 L 102 58 L 98 60 L 92 58 Z', name: 'Iran' },
  AE: { path: 'M 94 60 L 98 58 L 100 60 L 100 64 L 98 66 L 94 64 Z', name: 'UAE' },
  IL: { path: 'M 82 54 L 84 53 L 86 54 L 86 58 L 84 59 L 82 58 Z', name: 'Israel' },
  AT: { path: 'M 70 44 L 74 42 L 76 44 L 76 48 L 74 50 L 70 48 Z', name: 'Austria' },
  BE: { path: 'M 64 42 L 68 41 L 69 43 L 68 45 L 64 44 Z', name: 'Belgium' },
  PT: { path: 'M 56 48 L 60 47 L 61 50 L 60 53 L 56 52 Z', name: 'Portugal' },
  GR: { path: 'M 76 50 L 80 49 L 82 51 L 80 54 L 76 53 Z', name: 'Greece' },
  CZ: { path: 'M 72 42 L 76 41 L 78 43 L 76 45 L 72 44 Z', name: 'Czech Republic' },
  RO: { path: 'M 78 44 L 84 43 L 86 45 L 84 48 L 78 47 Z', name: 'Romania' },
  HU: { path: 'M 74 44 L 78 43 L 80 45 L 78 47 L 74 46 Z', name: 'Hungary' },
  BG: { path: 'M 80 48 L 84 47 L 86 49 L 84 51 L 80 50 Z', name: 'Bulgaria' },
  DK: { path: 'M 68 36 L 72 35 L 73 37 L 72 39 L 68 38 Z', name: 'Denmark' },
  FI: { path: 'M 78 26 L 84 24 L 86 28 L 84 34 L 78 34 L 76 30 Z', name: 'Finland' },
  CH: { path: 'M 66 46 L 70 45 L 71 47 L 70 49 L 66 48 Z', name: 'Switzerland' },
  IE: { path: 'M 58 38 L 62 37 L 63 39 L 62 41 L 58 40 Z', name: 'Ireland' },
}

function getColor(count: number): string {
  if (count === 0) return '#e5e7eb'
  if (count <= 100) return '#bbf7d0'
  if (count <= 1000) return '#4ade80'
  if (count <= 10000) return '#16a34a'
  return '#14532d'
}

export function WorldMap({ countries, totalRequests }: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const countMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of countries) m[c.code] = c.count
    return m
  }, [countries])

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => b.count - a.count).slice(0, 10),
    [countries],
  )

  const handleMouse = (code: string, e: React.MouseEvent) => {
    setHovered(code)
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }

  const hoveredCountry = hovered ? countries.find(c => c.code === hovered) : null

  return (
    <div className="space-y-4">
      <div className="relative w-full">
        <svg
          viewBox="0 0 180 115"
          className="w-full h-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          {Object.entries(COUNTRY_PATHS).map(([code, { path, name }]) => (
            <path
              key={code}
              d={path}
              fill={getColor(countMap[code] || 0)}
              stroke="#94a3b8"
              strokeWidth={0.3}
              className="transition-colors duration-150"
              onMouseEnter={(e) => handleMouse(code, e)}
              onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: countMap[code] ? 'pointer' : 'default' }}
            />
          ))}
        </svg>

        {hoveredCountry && (
          <div
            className="fixed z-50 px-3 py-2 rounded-lg bg-popover text-popover-foreground text-sm shadow-lg border border-border pointer-events-none"
            style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8 }}
          >
            <span className="font-medium">{hoveredCountry.name}</span>
            <span className="ml-2 text-muted-foreground">
              {hoveredCountry.count.toLocaleString()} requests
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Legend:</span>
        {[
          { label: '0', color: '#e5e7eb' },
          { label: '1-100', color: '#bbf7d0' },
          { label: '101-1K', color: '#4ade80' },
          { label: '1K-10K', color: '#16a34a' },
          { label: '10K+', color: '#14532d' },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Top Countries</h4>
        {sortedCountries.map((c, i) => (
          <div key={c.code} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-muted-foreground/5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
              <span className="text-sm font-medium">{c.name}</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold font-mono text-emerald-500">{c.count.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground ml-1">requests</span>
            </div>
          </div>
        ))}
        {sortedCountries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No country data yet</p>
        )}
      </div>
    </div>
  )
}
