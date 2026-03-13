export interface AnalysisResult {
  raw: string
  summary: string
  issues: string[]
  suggestions: string[]
  improved_sql: string
}

export interface AIProvider {
  provider_name: string
  default_model: string | null
  base_url: string | null
  is_active: boolean
  has_api_key: boolean
}
