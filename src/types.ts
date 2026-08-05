export type Load = 'SEA' | 'SDA' | 'LDA' | 'LSD'
export type BusType = 'SD' | 'DD' | 'BD'
export type Operator = 'SBST' | 'SMRT' | 'TTS' | 'GAS'

export interface ArriveLahArrival {
  time: string | null
  duration_ms: number | null
  lat: number
  lng: number
  load: Load | null
  feature: string | null
  type: BusType | null
  visit_number: number
  origin_code: string | null
  destination_code: string | null
  monitored: number
}

export interface ArriveLahService {
  no: string
  operator: Operator
  next: ArriveLahArrival | null
  subsequent: ArriveLahArrival | null
  next2: ArriveLahArrival | null
  next3: ArriveLahArrival | null
}

export interface ArriveLahResponse {
  services: ArriveLahService[]
}

export interface Stop {
  code: string
  name: string
  road: string
  lat: number
  lng: number
}

export interface FavoriteStop {
  code: string
  name: string
  road: string
}
