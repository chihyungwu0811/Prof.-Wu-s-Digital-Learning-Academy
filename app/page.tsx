'use client';

import { useEffect, useState } from 'react';
import AccountForm from './account-form';
import Academy from './academy';
import { appPath, currentProfile, isSupabaseConfigured, supabase } from '../lib/supabase';

export default function Page() {
  const [state, setState] = useState<'loading'|'signed-out'|'pending'|'suspended'|'ready'|'misconfigured'>('loading');
  useEffect(() => {
    if (!isSupabaseConfigured) { setState('misconfigured'); return; }
    let alive = true;
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.user) { setState('signed-out'); return; }
      const profile = await currentProfile(data.user);
      if (!alive) return;
      setState(!data.user.email_confirmed_at || !profile?.email_verified ? 'pending' : profile?.status === 'Active' ? 'ready' : profile?.status === 'Suspended' ? 'suspended' : 'pending');
    }).catch(() => alive && setState('signed-out'));
    return () => { alive = false; };
  }, []);
  if (state === 'ready') return <Academy/>;
  if (state === 'signed-out' || state === 'misconfigured') return <AccountForm/>;
  if (state === 'loading') return <main className="welcome"><p className="eyebrow">WELCOME TO THE ACADEMY</p><h1>Opening your academy…</h1></main>;
  return <main className="welcome"><p className="eyebrow">YOUR LEARNING JOURNEY</p><h1>{state === 'pending' ? 'Your registration is being reviewed.' : 'Your account is suspended.'}</h1><p>{state === 'pending' ? 'Verify your email address, then wait for administrator approval. Your learning portal will open after approval.' : 'Contact your administrator if you believe this is an error.'}</p><button className="secondary" onClick={async()=>{await supabase.auth.signOut();window.location.assign(appPath('/login/'));}}>Sign out</button></main>;
}
