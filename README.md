# Royal Fabrics Inventory Management

A working inventory + production + sales + payments system for Royal Fabrics,
connected to a live Supabase database with login-based access (Owner / Staff roles).

## What's already done

- Database created in Supabase (8 tables)
- Login enabled, Owner account created
- This project is wired to your live database using the keys in `.env`

## Important note about `.env`

This file contains your Supabase **Project URL** and **anon public key**.
The anon key is *designed* to be exposed in a browser — it only works because
your database has Row Level Security (RLS) policies that require login for
every table. Do not add the `service_role` key here; that one must stay secret.

## Phase 3 — Run it locally to test (optional, needs a computer with Node.js)

```
npm install
npm run dev
```

This opens the app at `http://localhost:5173`. Log in with your Owner email/password.

## Phase 4 — Deploy to Vercel (get your real website link)

1. Create a free account at **vercel.com** (sign up with GitHub is easiest)
2. Create a free account at **github.com** if you don't have one
3. Create a new repository on GitHub (e.g. `royal-fabrics-inventory`) and upload
   all the files in this project folder to it (GitHub's web upload works fine —
   drag and drop the files on the repository page)
4. In Vercel, click **"Add New Project"** → **Import** your GitHub repository
5. Vercel will auto-detect this as a Vite project. Before clicking Deploy, open
   **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = (the value from your `.env` file)
   - `VITE_SUPABASE_ANON_KEY` = (the value from your `.env` file)
6. Click **Deploy**
7. After a minute, you'll get a live link like `https://royal-fabrics-inventory.vercel.app`

Share that link with your staff. Each person logs in with their own email/password
(created by you in Supabase → Authentication → Users, same way your Owner account
was made — just leave their role as `staff` in the `user_roles` table, or insert
a row for them the same way we did for Owner, with `role = 'staff'`).

## Adding more staff logins later

1. Supabase → Authentication → Users → Create new user (auto-confirm ON)
2. Copy their UID
3. SQL Editor → run:
   ```sql
   insert into user_roles (id, email, role)
   values ('their-uid-here', 'their-email@example.com', 'staff');
   ```

Staff accounts can use Yarn, Production, Fabric, and Outlets, but not
Payments, Expenses, or Reports — those stay Owner-only, enforced both in the
app's menu and at the database level.
