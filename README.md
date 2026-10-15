# Prof. Wu’s Digital Learning Academy

The LMS frontend is a static Next.js export published by GitHub Pages. Supabase provides email/password authentication, the PostgreSQL database, row-level security, private lesson-file storage, quiz grading, and student approval state. No Render server or SQLite runtime is required for this architecture.

The bilingual interface supports English and Traditional Chinese. Course titles, teacher-authored materials, and quiz content remain in the language entered by the teacher. Branding is provisional.

## Features

- Student self-registration, Supabase email confirmation, and manual administrator approval before learning access.
- Password reset and verification-email resend through Supabase Auth.
- Administrator-managed subjects, student approval/suspension, and batch subject grants/revocation with optional expiration.
- Chapter-based lessons with draft/published states and ordering.
- Text lesson editor, private PDF/MP4 uploads, an interactive pipe-flow model, and isolated custom HTML modules.
- Multi-question choice quizzes graded by a Postgres function; correct answers are not exposed to the student browser.
- Saved lesson completion, latest quiz score, learning reports, CSV export, and administrative audit log.

## 1. Create the Supabase project and database

1. Create a Supabase project and wait for its database to finish provisioning.
2. Open **SQL Editor → New query**.
3. Copy the complete file `supabase/migrations/202610130001_academy.sql` into the editor and run it.
4. In **Authentication → Providers → Email**, enable email confirmations.
5. In **Authentication → URL Configuration**, set the Site URL to the final GitHub Pages URL. Add both callback URLs to Redirect URLs:
   - `https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/verify/`
   - `https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY/reset/`

For a user/organization Pages repository named `YOUR_GITHUB_NAME.github.io`, the site URL has no repository suffix. Update the redirect URLs to match that exact site URL. Supabase Auth sends a new profile into `Pending Approval`; verified users still cannot access LMS data until the administrator changes the status to `Active`.

## 2. Configure email delivery

Supabase's built-in email sender is for testing and is restricted to project-team addresses and a low send rate. Before inviting students, configure a custom SMTP sender in **Authentication → Emails → SMTP Settings**. This project is prepared for `chihyungwu@gmail.com` with Gmail SMTP:

- Host: `smtp.gmail.com`
- Port: `587`
- Username / sender: `chihyungwu@gmail.com`
- Password: a Google App Password, created after enabling 2-Step Verification

Keep the App Password in Supabase's SMTP settings only. Do not put it in the repository, GitHub Actions variables, or frontend code. Supabase documentation recommends custom SMTP for non-test use and says the built-in sender currently permits two messages per hour; that limit may change.

## 3. Promote the first administrator

1. Run the site once after configuring its Supabase URL and key, or use Supabase's **Authentication → Users → Add user** to create the owner account.
2. Confirm that account's email. If you use the signup form, open the verification email first.
3. In **SQL Editor**, run this once:

   ```sql
   update public.profiles
   set role = 'admin', status = 'Active'
   where lower(email) = lower('chihyungwu@gmail.com') and email_verified;
   ```

4. Sign in again. The first user will now see administrator tools. Regular users must not be given the `admin` role.

## 4. Put the source in GitHub

Create a GitHub repository and upload the **contents of this folder** to its root (so `package.json`, `app/`, `supabase/`, and `.github/` are at repository top level). The provided workflow is in `.github/workflows/deploy.yml` and builds/publishes the static site after pushes to `main`.

In **Repository → Settings → Secrets and variables → Actions → Variables**, create:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL from **Project Settings → API** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (or legacy `anon` key) from **Project Settings → API** |

These are browser-visible settings by design. The database's RLS policies are the security boundary. **Never** add a `service_role` or secret key to this static website, source code, or GitHub Actions variables.

Then:

1. In GitHub, open **Repository → Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push or merge the workflow to `main`; open **Actions** and wait for “Deploy LMS to GitHub Pages” to finish.
4. Open the Pages URL shown in the deployment summary.

The workflow automatically applies the correct URL prefix for a project repository. For a local preview, copy `.env.example` to `.env.local`, fill in the Supabase URL and publishable/anon key, then run `pnpm install` and `pnpm dev`.

## Data and access security

- RLS restricts student records and progress to the signed-in student; administrator writes require an active account with the `admin` role.
- Profiles are created by an Auth trigger. Students cannot edit their own role or approval status.
- Lesson files use a private Storage bucket. Students receive temporary signed URLs only for published lessons in subjects currently granted to them.
- Quiz answer keys and explanations are stored separately from lesson text. The browser receives questions and choices; Postgres validates answers and stores the score.
- Supabase email confirmation must remain enabled. Supabase's built-in email provider is not suitable for a public registration launch; configure custom SMTP first.

The previous standalone build stored data in local SQLite and files. This Supabase version starts with an empty database; its schema does not automatically import any local `.data/` records. Export and import existing accounts/content separately before replacing a live installation.

## Local checks

```sh
pnpm install
pnpm check
pnpm test
pnpm build
```

`pnpm build` creates the static site in `out/`. GitHub Actions uses this directory for Pages deployment. The GitHub Pages deployment itself and real email delivery must be verified after adding your Supabase project settings.
