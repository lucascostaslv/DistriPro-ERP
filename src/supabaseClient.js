import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing. Please check your .env file.')
}

// Use fallbacks to prevent app crash on startup if variables are missing
const url = supabaseUrl || 'https://placeholder.supabase.co'
const key = supabaseKey || 'placeholder'

export const supabase = createClient(url, key)