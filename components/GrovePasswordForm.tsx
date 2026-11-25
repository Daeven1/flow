"use client";

import { FormEvent, useEffect, useState } from "react";
import { accountEmail, passwordSignIn, setAccountPassword } from "@/app/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GrovePasswordForm({ setup = false }: { setup?: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (setup) accountEmail().then(value => setEmail(value ?? "")).catch(() => {});
  }, [setup]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    setMessage("");
    if (setup && password !== data.get("confirmation")) {
      setMessage("The passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const error = setup ? await setAccountPassword(password) : await passwordSignIn(String(data.get("email")), password);
      if (error) setMessage(error);
      else if (setup) {
        form.reset();
        setMessage("Password saved. You can now sign in with your email and Grove password.");
      } else window.location.assign("/daily");
    } catch {
      setMessage("Grove couldn’t reach the sign-in service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      {setup ? <p>Set a password for your existing Grove account{email && <strong> ({email})</strong>}.</p> :
        <label className="block">Email<Input name="email" type="email" autoComplete="username" required /></label>}
      <label className="block">{setup ? "New Grove password (12 characters or more)" : "Grove password"}
        <Input name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 12 : undefined} required />
      </label>
      {setup && <label className="block">Confirm password<Input name="confirmation" type="password" autoComplete="new-password" required /></label>}
      <Button type="submit" disabled={busy}>{setup ? "Save password" : "Sign in"}</Button>
      <p role="status">{message}</p>
    </form>
  );
}
