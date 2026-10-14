'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signInAction, signUpAction, type FormState } from '@/lib/actions';

export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === 'login' ? signInAction : signUpAction, {});
  return (
    <form action={action} className="flex flex-col gap-3.5">
      {mode === 'signup' && (
        <>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">Your name<input name="name" required autoComplete="name" className="input h-11 font-normal" /></label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">Company or agency<input name="company" autoComplete="organization" className="input h-11 font-normal" /></label>
        </>
      )}
      <label className="flex flex-col gap-1 text-[13px] font-semibold">Email<input name="email" type="email" required autoComplete="email" className="input h-11 font-normal" /></label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">Password
        <input name="password" type="password" required minLength={mode === 'signup' ? 10 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="input h-11 font-normal" />
        {mode === 'signup' && <span className="font-normal text-muted">At least 10 characters.</span>}
      </label>
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{state.error}</p>}
      <button className="btn btn-primary h-12 justify-center" disabled={pending}>{pending ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Start the 14-day free trial'}</button>
      <p className="text-center text-[13px] text-muted">
        {mode === 'login' ? <>New here? <Link className="font-semibold text-accent" href="/signup">Create an account</Link></> : <>Already have an account? <Link className="font-semibold text-accent" href="/login">Sign in</Link></>}
      </p>
    </form>
  );
}
