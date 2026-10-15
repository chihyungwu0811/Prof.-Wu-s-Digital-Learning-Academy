'use client';

import { createClient, type User } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const appPath = (path: string) => `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
export const appUrl = (path: string) => `${window.location.origin}${appPath(path)}`;
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://missing-project.supabase.co', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export async function currentProfile(user?: User | null) {
  const current = user === undefined ? (await supabase.auth.getUser()).data.user : user;
  if (!current) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', current.id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, email: current.email || data.email } : null;
}

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
const now = () => new Date().toISOString();
const isAdmin = async () => (await currentProfile())?.role === 'admin';

export async function fetchAcademyData() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  fail(userError);
  if (!user) throw new Error('Sign in to continue.');
  const profile = await currentProfile(user);
  if (!profile) throw new Error('Your account profile is not ready yet. Refresh in a moment.');
  const admin = profile.role === 'admin';
  const [subjectsResult, grantsResult, progressResult] = await Promise.all([
    supabase.from('subjects').select('*').order('created', { ascending: false }),
    supabase.from('grants').select('*'),
    supabase.from('progress').select('*'),
  ]);
  fail(subjectsResult.error); fail(grantsResult.error); fail(progressResult.error);
  const subjects = subjectsResult.data || [], grants = grantsResult.data || [], progress = progressResult.data || [];
  if (!admin) return {
    user: { userId: user.id, email: user.email, displayName: profile.name, fullName: profile.name },
    role: 'student', student: profile, subjects, grants: profile.status === 'Active' ? grants : [], progress: profile.status === 'Active' ? progress : [],
  };
  const [profilesResult, lessonsResult, auditResult] = await Promise.all([
    supabase.from('profiles').select('*').neq('id', user.id).order('created', { ascending: false }),
    supabase.from('lessons').select('*').order('subject').order('chapter').order('position'),
    supabase.from('audit').select('*').order('created', { ascending: false }).limit(30),
  ]);
  fail(profilesResult.error); fail(lessonsResult.error); fail(auditResult.error);
  const lessons = lessonsResult.data || [];
  const quizIds = lessons.filter((lesson: any) => lesson.type === 'quiz').map((lesson: any) => lesson.id);
  const questionsResult = quizIds.length ? await supabase.from('lesson_questions').select('*').in('lesson_id', quizIds).order('position') : { data: [], error: null };
  fail(questionsResult.error);
  const questions = questionsResult.data || [];
  const lessonsWithAssets = await Promise.all(lessons.map(async (l: any) => {
    let assetUrl: string | null = null;
    if (l.asset) { const signed = await supabase.storage.from('lesson-assets').createSignedUrl(l.asset, 600); fail(signed.error); assetUrl = signed.data?.signedUrl ?? null; }
    return { ...l, assetUrl, questions: questions.filter((q: any) => q.lesson_id === l.id).map((q: any) => ({ prompt: q.prompt, options: q.options, answer: q.correct_index, explanation: q.explanation })) };
  }));
  return {
    user: { userId: user.id, email: user.email, displayName: profile.name, fullName: profile.name },
    role: 'admin', subjects, students: (profilesResult.data || []).map((p: any) => ({ ...p, id: p.id })), grants,
    lessons: lessonsWithAssets,
    progress, audit: auditResult.data || [],
  };
}

export async function academyAction(payload: any) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Sign in to continue.');
  const admin = await isAdmin();
  const { action } = payload;
  if (action === 'register') {
    const { error } = await supabase.rpc('update_my_academy_profile', {
      p_name: String(payload.name || '').trim(), p_organization: String(payload.organization || ''), p_country: String(payload.country || ''),
    }); fail(error); return;
  }
  if (action === 'status') {
    const { error } = await supabase.rpc('admin_set_student_status', { p_ids: payload.ids, p_status: payload.status }); fail(error);
  } else if (action === 'grant' || action === 'revoke') {
    const { error } = await supabase.rpc('admin_batch_subject_access', {
      p_student_ids: payload.students, p_subject_ids: payload.subjects, p_expires: payload.expires || null, p_revoke: action === 'revoke',
    }); fail(error);
  } else if (action === 'subject') {
    if (!admin) throw new Error('Administrator access required.');
    const { error } = await supabase.from('subjects').upsert({ id: payload.id || crypto.randomUUID(), title: String(payload.title).trim(), description: payload.description || '', category: payload.category || 'Engineering', published: Boolean(payload.published), created: payload.created || now() }); fail(error);
  } else if (action === 'deleteSubject') {
    if (!admin) throw new Error('Administrator access required.');
    const { error } = await supabase.from('subjects').delete().eq('id', payload.id); fail(error);
  } else if (action === 'lesson') {
    if (!admin) throw new Error('Administrator access required.');
    const id = payload.id || crypto.randomUUID();
    const questions = payload.type === 'quiz' ? (payload.questions || [{ prompt: payload.body, options: payload.options, answer: payload.answer, explanation: payload.explanation }]) : [];
    const { error } = await supabase.from('lessons').upsert({ id, subject: payload.subject, chapter: String(payload.chapter).trim(), title: String(payload.title).trim(), type: payload.type, body: payload.body || '', asset: payload.asset || null, published: Boolean(payload.published), position: Number(payload.position) || 0, created: payload.created || now() }); fail(error);
    const { error: deleteError } = await supabase.from('lesson_questions').delete().eq('lesson_id', id); fail(deleteError);
    if (questions.length) {
      const { error: insertError } = await supabase.from('lesson_questions').insert(questions.map((q: any, position: number) => ({ lesson_id: id, position, prompt: q.prompt, options: q.options, correct_index: Number(q.answer), explanation: q.explanation || '' }))); fail(insertError);
    }
  } else if (action === 'deleteLesson') {
    if (!admin) throw new Error('Administrator access required.');
    const { error } = await supabase.from('lessons').delete().eq('id', payload.id); fail(error);
  } else throw new Error('Unknown academy action.');

  if (admin) {
    const details = { ...payload };
    delete details.password;
    const { error } = await supabase.from('audit').insert({ actor: user.id, action, details, created: now() }); fail(error);
  }
}

export async function uploadLessonAsset(file: File, subject: string, type: string) {
  if (!['pdf', 'video', 'custom'].includes(type) || !file.size || file.size > (type === 'custom' ? 1024 * 1024 : 25 * 1024 * 1024)) throw new Error('Choose a supported file within the size limit.');
  const extension = type === 'pdf' ? 'pdf' : type === 'video' ? 'mp4' : 'html';
  const path = `${subject}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('lesson-assets').upload(path, file, { contentType: file.type || (type === 'pdf' ? 'application/pdf' : type === 'video' ? 'video/mp4' : 'text/html'), upsert: false });
  fail(error);
  return { key: path, name: file.name };
}

export async function listLessons() {
  const { data, error } = await supabase.from('lessons').select('*,subjects!inner(title)').eq('published', true).eq('subjects.published', true).order('subject').order('chapter').order('position');
  fail(error);
  const rows = data || [];
  const quizIds = rows.filter((l: any) => l.type === 'quiz').map((l: any) => l.id);
  const questions = quizIds.length ? await supabase.from('lesson_questions').select('lesson_id,position,prompt,options').in('lesson_id', quizIds).order('position') : { data: [], error: null };
  fail(questions.error);
  const progress = await supabase.from('progress').select('*'); fail(progress.error);
  return rows.map((l: any) => ({ ...l, subject_title: l.subjects?.title, questions: (questions.data || []).filter((q: any) => q.lesson_id === l.id), ...(progress.data || []).find((p: any) => p.lesson === l.id) }));
}

export async function getLesson(id: string) {
  const { data, error } = await supabase.from('lessons').select('*,subjects!inner(title)').eq('id', id).maybeSingle(); fail(error);
  if (!data) throw new Error('Lesson not found or access is unavailable.');
  let questions: any[] = [];
  if (data.type === 'quiz') {
    const result = await supabase.rpc('get_student_quiz_questions', { p_lesson_id: id }); fail(result.error); questions = result.data || [];
  }
  const progress = await supabase.from('progress').select('*').eq('lesson', id).maybeSingle(); fail(progress.error);
  let assetUrl: string | null = null;
  if (data.asset) { const signed = await supabase.storage.from('lesson-assets').createSignedUrl(data.asset, 600); fail(signed.error); assetUrl = signed.data?.signedUrl ?? null; }
  return { ...data, subject_title: (data as any).subjects?.title, questions, ...(progress.data || {}), assetUrl };
}

export async function completeLesson(lesson: string) { const { error } = await supabase.rpc('complete_academy_lesson', { p_lesson_id: lesson }); fail(error); }
export async function submitQuiz(lesson: string, answers: number[]) { const { data, error } = await supabase.rpc('submit_academy_quiz', { p_lesson_id: lesson, p_answers: answers }); fail(error); return data; }
