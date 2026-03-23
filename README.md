# Kognitos Workflow Template

A production-ready template for building workflow management applications with Next.js, Supabase, and Kognitos "English as Code" business logic.

Clone this template and customize it for any domain: **prior authorization**, **claims processing**, **invoice approval**, **contract review**, **employee onboarding**, **compliance audit**, and more.

## Architecture

Three-layer separation of concerns keeps your app thin, your business logic auditable, and your data queryable:

```
┌─────────────────────────────────────────────────┐
│               Presentation Layer                │
│          Next.js / Vercel / shadcn/ui           │
│                                                 │
│  Worklist ─ Detail ─ Dashboard ─ Rules ─ Settings│
└──────────────┬─────────────────┬────────────────┘
               │ API calls       │ SQL queries
               ▼                 ▼
┌──────────────────────┐  ┌─────────────────────────┐
│   Kognitos Platform  │  │   Supabase (PostgreSQL)  │
│   English-as-Code    │  │   Domain tables           │
│   SOPs & Runs        │  │   Metrics via SQL         │
└──────────────────────┘  └─────────────────────────┘
```

- **Presentation** (this app): Next.js + shadcn/ui on Vercel. Handles UI, routing, state, and data display. Does NOT encode business rules.
- **Business Logic** (Kognitos): English-as-Code SOPs that are API-callable. Each SOP handles one step of your workflow. Edge cases are handled inside the SOPs, not in TypeScript.
- **Data** (Supabase): PostgreSQL tables store domain entities. SQL queries compute all metrics and aggregates.

## What's Included

| Feature | Description |
|---------|-------------|
| **Worklist** | Search, multi-filter, sorting, pagination, CSV export, row-click navigation |
| **Entity Detail** | Tabbed view with overview, documents, timeline, SOP run visibility, and action sidebar |
| **Analytics Dashboard** | KPI cards, Recharts visualizations, interactive drill-down sheets |
| **Rules/SOP Browser** | View SOP definitions, execution history, per-rule metrics |
| **RBAC** | 4 config-driven roles (requester, reviewer, manager, admin) with path and action gating |
| **Notifications** | Bell icon with unread count, SLA breach alerts, full notification page |
| **Settings** | Organization info, user management, domain configuration |
| **Supabase Integration** | Schema migration, seed script, data-access layer |
| **Kognitos Mock Client** | Typed mock functions mirroring the Kognitos REST API — swap for production calls |
| **Domain Config** | Single file (`lib/domain.config.ts`) controls app name, statuses, roles, and navigation |

## Quick Start

### 1. Create Your Repository

Click **"Use this template"** on GitHub, then clone your new repo:

```bash
git clone https://github.com/YOUR_ORG/your-workflow-app.git
cd your-workflow-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

Create a [Supabase](https://supabase.com) project, then link it locally:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Push the schema to your database:

```bash
npx supabase db push
```

### 4. Seed the Database

The seed script upserts realistic test data into your Supabase tables:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key npx tsx scripts/seed.ts
```

You can find the service role key in your Supabase project settings under **API**.

### 5. Configure Environment Variables

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

If deploying to Vercel with the Supabase integration enabled, these are injected automatically.

### 6. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in with any role to explore the app.

## Customizing for Your Domain

See **[docs/CUSTOMIZING.md](docs/CUSTOMIZING.md)** for a step-by-step guide that walks you through adapting every layer of the template.

The key file to start with is **`lib/domain.config.ts`** — it controls:

- App name and branding
- Entity names (singular/plural)
- Status lifecycle and badge colors
- Roles, permissions, and default paths
- Sidebar navigation items

Most of the UI reads from this single config, so a quick edit there changes the entire app.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) | SSR, routing, server components |
| UI Components | [shadcn/ui](https://ui.shadcn.com) + Radix UI | Accessible component primitives |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) | Utility-first CSS |
| Tables | [TanStack Table](https://tanstack.com/table) | Sorting, filtering, pagination |
| Charts | [Recharts](https://recharts.org) | Dashboard visualizations |
| State | [Zustand](https://zustand.docs.pmnd.rs) | Client-side state management |
| Dates | [date-fns](https://date-fns.org) | Date formatting and math |
| Icons | [Lucide React](https://lucide.dev) | Consistent iconography |
| Database | [Supabase](https://supabase.com) (PostgreSQL + Auth) | Data storage and authentication |
| Business Logic | [Kognitos](https://kognitos.com) | English-as-Code SOP execution |

## Project Structure

```
workflow-template/
├── app/
│   ├── layout.tsx                        # Root layout (AuthProvider, fonts)
│   ├── globals.css                       # Tailwind imports, theme tokens
│   ├── (auth)/
│   │   └── login/page.tsx                # Login with role selector
│   └── (dashboard)/
│       ├── layout.tsx                    # Sidebar + Topbar + RBAC guard
│       ├── page.tsx                      # Worklist (default landing)
│       ├── [entity]/[id]/page.tsx        # Entity detail (tabbed)
│       ├── dashboard/page.tsx            # Analytics dashboard
│       ├── rules/page.tsx                # SOP/Rules browser
│       ├── rules/[id]/page.tsx           # Rule detail + run history
│       ├── notifications/page.tsx        # Notification history
│       └── settings/                     # Org settings, users, config
├── components/
│   ├── layout/                           # Sidebar, Topbar
│   ├── ui/                               # shadcn/ui primitives
│   ├── domain/                           # Status badge, priority badge, etc.
│   └── worklist/                         # Filters, table
├── lib/
│   ├── domain.config.ts                  # ★ Central domain configuration
│   ├── types.ts                          # All TypeScript types
│   ├── constants.ts                      # Labels and mappings
│   ├── utils.ts                          # cn() and helpers
│   ├── supabase.ts                       # Supabase client
│   ├── db.ts                             # Data-access layer (Supabase)
│   ├── queries.ts                        # Async analytics query functions
│   ├── auth-context.tsx                  # React Context for auth
│   ├── role-permissions.ts               # RBAC config (reads domain.config)
│   ├── api/                              # API abstraction (re-exports db.ts)
│   ├── kognitos/                         # Kognitos mock client
│   └── seed-data/                        # Seed data arrays
├── supabase/
│   └── migrations/                       # PostgreSQL schema
├── scripts/
│   └── seed.ts                           # Database seeder
└── docs/
    ├── BLUEPRINT.md                      # Full architecture documentation
    └── CUSTOMIZING.md                    # Domain customization guide
```

## Architecture Guide

See **[docs/BLUEPRINT.md](docs/BLUEPRINT.md)** for the complete architecture documentation, including:

- Philosophy and separation of concerns
- Phase-by-phase build guide
- Data flow patterns
- Component conventions
- RBAC enforcement points
- Build checklist

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npx tsx scripts/seed.ts` | Seed the Supabase database |
| `npx supabase db push` | Push schema migrations to Supabase |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (seed script only — never expose in the browser) |

## License

MIT
