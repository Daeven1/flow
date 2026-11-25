"use server";

import { createClient } from "@/lib/supabase/server";

export async function passwordSignIn(email: string, password: string) {
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  return error ? "Couldn’t sign in. Check your email and Grove password and try again." : null;
}

export async function setAccountPassword(password: string) {
  if (password.length < 12) return "Use at least 12 characters.";
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email) return "Sign in again before setting a password.";
  const { error } = await client.auth.updateUser({ password });
  if (error) return "Couldn’t save your password. Try a different password or sign in again first.";
  return null;
}

export async function accountEmail() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return user?.email ?? null;
}

export async function signOutOfGrove() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  return !error;
}
