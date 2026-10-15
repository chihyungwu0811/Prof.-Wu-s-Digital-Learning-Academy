'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, ClipboardList, GraduationCap, MousePointer2, ShieldCheck } from 'lucide-react';
import { LanguagePicker } from './i18n';
import { appPath, appUrl, currentProfile, isSupabaseConfigured, supabase } from '../lib/supabase';

export default function AccountForm({ initial = 'login' }: { initial?: string }) {
  const [mode, setMode] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const title = mode === 'register' ? 'Join the academy.' : mode === 'reset' ? 'Choose a new password.' : mode === 'verify' ? 'Verify your email.' : mode === 'forgot' ? 'Reset your password.' : mode === 'resend' ? 'Request a verification link.' : 'Welcome back.';

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (mode === 'verify') {
      supabase.auth.getUser().then(async ({ data, error: authError }) => {
        if (authError) { setError(authError.message); return; }
        if (!data.user?.email_confirmed_at) { setMessage('Open the confirmation link from your email to verify this address.'); return; }
        const profile = await currentProfile(data.user);
        setMessage(profile?.status === 'Active' ? 'Email verified. Your account is approved.' : 'Email verified. Your registration is waiting for administrator approval.');
        if (profile?.status === 'Active') window.location.assign(appPath('/'));
      }).catch(e => setError(e.message));
    }
  }, [mode]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    const f = new FormData(e.currentTarget), email = String(f.get('email') || '').trim(), password = String(f.get('password') || '');
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Add the project URL and anon key to the GitHub Actions variables.');
      if (mode === 'register') {
        if (password !== f.get('confirm')) throw new Error('The passwords do not match.');
        const { error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl('/verify/'), data: { name: String(f.get('name') || '').trim(), organization: String(f.get('organization') || ''), country: String(f.get('country') || '') } } });
        if (authError) throw authError;
        setMessage('Registration submitted. Check your email to verify your address; administrator approval is still required before learning access.');
      } else if (mode === 'login') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        const profile = await currentProfile(data.user);
        if (!data.user.email_confirmed_at) { await supabase.auth.signOut(); throw new Error('Verify your email address before signing in.'); }
        if (profile?.status !== 'Active') {
          await supabase.auth.signOut();
          throw new Error(profile?.status === 'Suspended' ? 'Your account is suspended. Contact your administrator.' : 'Your account is awaiting administrator approval.');
        }
        window.location.assign(appPath('/'));
      } else if (mode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('/reset/') });
        if (authError) throw authError;
        setMessage('If this account exists, password-reset instructions will be sent to its email address.');
      } else if (mode === 'resend') {
        const { error: authError } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl('/verify/') } });
        if (authError) throw authError;
        setMessage('If this address has a pending registration, a new verification email will be sent.');
      } else if (mode === 'reset') {
        if (password !== f.get('confirm')) throw new Error('The passwords do not match.');
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        await supabase.auth.signOut();
        setMessage('Password updated. You can now sign in.');
        setMode('login');
      } else if (mode === 'verify') {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!data.user?.email_confirmed_at) throw new Error('Open the confirmation link from your email first.');
        const profile = await currentProfile(data.user);
        setMessage(profile?.status === 'Active' ? 'Email verified. Your account is approved.' : 'Email verified. Your registration is waiting for administrator approval.');
      }
    } catch (e) { setError((e as Error).message || 'Unable to continue.'); }
    finally { setBusy(false); }
  }

  function change(next: string) { setMode(next); setError(''); setMessage(''); }
  return <main className="auth-shell"><section className="auth-story"><a className="auth-brand" href={appPath('/')}><BookOpen size={28}/><span>Prof. Wu’s<small>Digital Learning Academy</small></span></a><div className="auth-story-content"><p className="eyebrow">A WORLD OF POSSIBILITIES</p><h1>Go beyond<br/>the formula.</h1><p>Build understanding through interactive exploration, guided learning, and meaningful practice.</p><div className="auth-features"><span><MousePointer2 size={20}/>Explore interactive models</span><span><BookOpen size={20}/>Learn at your own pace</span><span><ClipboardList size={20}/>Check your understanding</span></div></div><p className="auth-story-footer">Curiosity is where learning begins.</p></section><section className="auth-form-wrap"><div className="auth-language"><LanguagePicker/></div><span className="auth-icon"><GraduationCap size={27}/></span><p className="eyebrow">YOUR LEARNING JOURNEY</p><h2>{title}</h2><p>{mode==='register'?'Create an account. Verify your email, then wait for administrator approval.':mode==='verify'?'Confirm your email address to continue your registration.':mode==='forgot'||mode==='resend'?'Enter the email address associated with your account.':mode==='reset'?'Use the password-reset link from your email to choose a new password.':'Sign in to your authorized subjects and learning materials.'}</p>{error&&<div className="alert error" role="alert">{error}</div>}{message&&<div className="alert success" role="status">{message}</div>}{!isSupabaseConfigured&&<div className="alert error" role="alert">Supabase is not configured yet. Set the GitHub Actions variables before publishing.</div>}
    <form onSubmit={submit}>{mode==='register'&&<label className="field">Full name<input name="name" autoComplete="name" maxLength={120} required/></label>}{!['reset','verify'].includes(mode)&&<label className="field">Email address<input type="email" name="email" autoComplete="email" maxLength={254} required/></label>}{['login','register','reset'].includes(mode)&&<label className="field">Password<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} maxLength={128} required/></label>}{['register','reset'].includes(mode)&&<><label className="field">Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={12} maxLength={128} required/></label><p className="fine">Use at least 12 characters.</p></>}{mode==='register'&&<div className="form-pair"><label className="field">Organization (optional)<input name="organization" maxLength={200} autoComplete="organization"/></label><label className="field">Country (optional)<input name="country" maxLength={100} autoComplete="country-name"/></label></div>}{mode==='login'&&<button className="text-button auth-forgot" type="button" onClick={()=>change('forgot')}>Forgot password?</button>}<button className="primary auth-submit" disabled={busy||mode==='verify'&&!isSupabaseConfigured}>{busy?'Please wait…':mode==='register'?'Create account':mode==='reset'?'Update password':mode==='verify'?'Check verification':mode==='forgot'||mode==='resend'?'Send instructions':'Sign in'}<ArrowRight size={17}/></button></form><div className="auth-switch">{mode==='login'?<>New to the academy? <button className="text-button" onClick={()=>change('register')}>Create an account</button></>:<button className="text-button" onClick={()=>change('login')}>Back to sign in</button>}</div>{mode==='login'&&<button className="text-button" onClick={()=>change('resend')}>Resend verification email</button>}<div className="auth-access-note"><ShieldCheck size={18}/><p>Administrator approval and subject authorization are required to start learning.</p></div></section></main>;
}
