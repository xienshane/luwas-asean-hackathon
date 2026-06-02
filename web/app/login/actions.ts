'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const redirectedFrom = String(formData.get('redirectedFrom') ?? '')
  const destination = redirectedFrom || '/coordinator/health'

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
