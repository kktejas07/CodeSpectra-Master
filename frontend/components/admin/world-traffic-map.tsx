'use client'

import { useMemo } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

interface CountryData {
  country: string
  requests: number
}

interface Props {
  data: CountryData[]
  totalRequests: number
}

type CountMap = Record<string, number>

const CITY_COORDS: Record<string, [number, number]> = {
  'United States': [-95.7129, 37.0902],
  'India': [78.9629, 20.5937],
  'United Kingdom': [-3.4359, 55.3781],
  'Germany': [10.4515, 51.1657],
  'Canada': [-106.3468, 56.1304],
  'Australia': [133.7751, -25.2744],
  'France': [2.2137, 46.6034],
  'Brazil': [-51.9253, -14.2350],
  'Japan': [138.2529, 36.2048],
  'Russia': [105.3188, 61.5240],
  'Netherlands': [5.2913, 52.1326],
  'Singapore': [103.8198, 1.3521],
  'South Korea': [127.7669, 35.9078],
  'Sweden': [18.6435, 60.1282],
  'Norway': [8.4689, 60.4720],
  'Spain': [-3.7492, 40.4637],
  'Italy': [12.5674, 41.8719],
  'Poland': [19.1451, 51.9194],
  'Ukraine': [31.1656, 48.3794],
  'Turkey': [35.2433, 38.9637],
  'Iran': [53.6880, 32.4279],
  'Saudi Arabia': [45.0792, 23.8859],
  'United Arab Emirates': [53.8478, 23.4241],
  'Israel': [34.8516, 31.0461],
  'Egypt': [30.8025, 26.8206],
  'Nigeria': [8.6753, 9.0820],
  'South Africa': [22.9375, -30.5595],
  'Argentina': [-63.6167, -38.4161],
  'Mexico': [-102.5528, 23.6345],
  'Indonesia': [113.9213, -0.7893],
  'Thailand': [100.9925, 15.8700],
  'Vietnam': [108.2772, 14.0583],
  'Philippines': [121.7740, 12.8797],
  'Malaysia': [101.9758, 4.2105],
  'New Zealand': [172.8344, -40.9006],
  'Ireland': [-8.2439, 53.4129],
  'Denmark': [9.5018, 56.2639],
  'Finland': [25.7482, 61.9241],
  'Switzerland': [8.2275, 46.8182],
  'Austria': [14.5501, 47.5162],
  'Belgium': [4.4699, 50.8503],
  'Portugal': [-8.2245, 39.3999],
  'Greece': [21.8243, 39.0742],
  'Czech Republic': [15.4730, 49.8175],
  'Romania': [24.9668, 45.9432],
  'Hungary': [19.5033, 47.1625],
  'Bulgaria': [25.4858, 42.7339],
  'Chile': [-71.5429, -35.6751],
  'Colombia': [-74.2973, 4.5709],
  'Peru': [-75.0152, -9.1900],
  'Pakistan': [69.3451, 30.3753],
  'Bangladesh': [90.3563, 23.6850],
  'Kenya': [37.9062, -0.0236],
}

export function WorldTrafficMap({ data, totalRequests }: Props) {
  const countMap: CountMap = useMemo(() => {
    const m: CountMap = {}
    for (const d of data) {
      m[d.country] = d.requests
    }
    return m
  }, [data])

  const maxRequests = useMemo(
    () => Math.max(...data.map(d => d.requests), 1),
    [data],
  )

  const getColor = (requests: number) => {
    if (requests === 0) return '#1e293b'
    const intensity = requests / maxRequests
    if (intensity > 0.5) return '#06b6d4'
    if (intensity > 0.2) return '#0891b2'
    if (intensity > 0.05) return '#0e7490'
    return '#164e63'
  }

  return (
    <div className="w-full">
      <ComposableMap
        projectionConfig={{ scale: 147 }}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo: any) => {
              const name = geo.properties.name
              const count = countMap[name] || 0
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getColor(count)}
                  stroke="#0f172a"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: '#22d3ee', outline: 'none', cursor: 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                  title={count > 0 ? `${name}: ${count.toLocaleString()} requests` : name}
                />
              )
            })
          }
        </Geographies>
        {/* Dot markers for top countries */}
        {data.slice(0, 15).map((d) => {
          const coords = CITY_COORDS[d.country]
          if (!coords) return null
          const radius = Math.max(3, Math.min(12, (d.requests / maxRequests) * 14))
          return (
            <Marker key={d.country} coordinates={coords}>
              <circle
                r={radius}
                fill="#06b6d4"
                fillOpacity={0.5}
                stroke="#22d3ee"
                strokeWidth={1}
              />
            </Marker>
          )
        })}
      </ComposableMap>
    </div>
  )
}
