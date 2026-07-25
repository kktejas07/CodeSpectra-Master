declare module 'react-simple-maps' {
  import { ComponentType, ReactNode } from 'react'

  interface ComposableMapProps {
    projectionConfig?: { scale?: number; center?: [number, number] }
    style?: Record<string, string | number>
    children?: ReactNode
  }
  export const ComposableMap: ComponentType<ComposableMapProps>

  interface GeographiesProps {
    geography: string | object
    children: (data: { geographies: GeographyObject[] }) => ReactNode
  }
  interface GeographyObject {
    rsmKey: string
    properties: { name: string; [key: string]: unknown }
    [key: string]: unknown
  }
  export const Geographies: ComponentType<GeographiesProps>

  interface GeographyProps {
    geography: GeographyObject
    fill?: string
    stroke?: string
    strokeWidth?: number
    style?: {
      default?: Record<string, string>
      hover?: Record<string, string>
      pressed?: Record<string, string>
    }
    title?: string
  }
  export const Geography: ComponentType<GeographyProps>

  interface MarkerProps {
    coordinates: [number, number]
    children?: ReactNode
  }
  export const Marker: ComponentType<MarkerProps>
}
