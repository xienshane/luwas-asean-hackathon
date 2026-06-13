'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const redirectedFrom = String(formData.get('redirectedFrom') ?? '')
  const destination = redirectedFrom || '/coordinator'

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const params = new URLSearchParams({ error: error.message })
    if (redirectedFrom) params.set('redirectedFrom', redirectedFrom)
    redirect(`/login?${params.toString()}`)
  }

  revalidatePath('/', 'layout')
  redirect(destination)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const fullName = String(formData.get('fullName') ?? '')
  const agency = String(formData.get('agency') ?? '')

  if (password !== confirmPassword) {
    redirect('/signup?error=Passwords+do+not+match')
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, agency },
    },
  })

  if (error) {
    const params = new URLSearchParams({ error: error.message })
    redirect(`/signup?${params.toString()}`)
  }

  redirect('/signup?error=Check+your+email+to+confirm+your+account')
}
