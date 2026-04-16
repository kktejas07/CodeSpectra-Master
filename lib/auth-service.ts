import { supabase } from './supabase-client'

export interface AuthResponse {
  success: boolean
  message: string
  user?: any
  error?: string
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(
  email: string,
  password: string,
  fullName?: string
): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      return {
        success: false,
        message: error.message,
        error: error.message,
      }
    }

    return {
      success: true,
      message: 'Account created successfully. Please check your email to confirm.',
      user: data.user,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      message: errorMessage,
      error: errorMessage,
    }
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return {
        success: false,
        message: error.message,
        error: error.message,
      }
    }

    return {
      success: true,
      message: 'Signed in successfully',
      user: data.user,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      message: errorMessage,
      error: errorMessage,
    }
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return {
        success: false,
        message: error.message,
        error: error.message,
      }
    }

    return {
      success: true,
      message: 'Signed out successfully',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      message: errorMessage,
      error: errorMessage,
    }
  }
}

/**
 * Get the current user session
 */
export async function getCurrentUser() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch (error) {
    return null
  }
}

/**
 * Get the current session
 */
export async function getSession() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session
  } catch (error) {
    return null
  }
}
