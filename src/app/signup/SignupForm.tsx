"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "./actions";

const field = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});
  return (
    <form action={action} className="space-y-4" data-signup-form="">
      <label className="block text-sm font-medium text-zinc-700">
        Your name
        <input name="name" autoComplete="name" required maxLength={80} defaultValue={state.name} className={field} />
      </label>
      <label className="block text-sm font-medium text-zinc-700">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} className={field} />
      </label>
      <label className="block text-sm font-medium text-zinc-700">
        Password
        <input name="password" type="password" autoComplete="new-password" required minLength={10} className={field} aria-describedby="pw-hint" />
        <span id="pw-hint" className="mt-1 block text-xs font-normal text-zinc-500">At least 10 characters.</span>
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-signup-error="">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
        {pending ? "Creating your account…" : "Create free account"}
      </button>
    </form>
  );
}
