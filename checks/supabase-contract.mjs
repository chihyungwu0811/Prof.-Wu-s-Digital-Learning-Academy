import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const schema = await readFile(new URL('../supabase/migrations/202610130001_academy.sql', import.meta.url), 'utf8');
const client = await readFile(new URL('../lib/supabase.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

for (const table of ['profiles','subjects','grants','lessons','lesson_questions','progress','audit']) {
  assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must have RLS enabled`);
}
assert.match(schema, /default 'Pending Approval'/);
assert.match(schema, /function public\.admin_set_student_status/i);
assert.match(schema, /function public\.admin_batch_subject_access/i);
assert.match(schema, /function public\.submit_academy_quiz/i);
assert.match(schema, /function public\.get_student_quiz_questions/i);
assert.match(schema, /create policy questions_admin_all[\s\S]*?public\.is_academy_admin\(\)/i);
assert.doesNotMatch(client, /service_role/i, 'the browser bundle must never use a service-role key');
assert.match(client, /createSignedUrl/);
assert.match(config, /actions\/deploy-pages@v4/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
console.log('Passed: GitHub Pages workflow, Supabase Auth/data integration, RLS coverage, protected quiz answers, and private file access contract.');
