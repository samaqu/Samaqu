-- Menu "Perlu Review": eskalasi AI, pelajaran admin, draft transaksi.
-- Additive: tidak mengubah orders, wa_inbox, stok, lead sync, atau laporan.

create table if not exists public.wa_escalations (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references public.wa_inbox(id) on delete set null,
  sender text not null,
  sender_name text,
  customer_message text,
  summary text not null,
  reason text,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'answered', 'closed', 'skipped')),
  claimed_by text,
  claimed_at timestamptz,
  instruction text,
  instruction_scope text not null default 'customer'
    check (instruction_scope in ('customer', 'global')),
  draft_reply text,
  reply_text text,
  replied_at timestamptz,
  learning_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wa_escalations_open_per_inbox
  on public.wa_escalations (inbox_id)
  where status in ('open', 'claimed');
create index if not exists wa_escalations_status_created
  on public.wa_escalations (status, created_at desc);

create table if not exists public.wa_learnings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'customer'
    check (scope in ('customer', 'global')),
  sender text,
  topic text,
  instruction text not null,
  example_question text,
  source_escalation_id uuid references public.wa_escalations(id) on delete set null,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wa_learnings_lookup
  on public.wa_learnings (scope, sender, status);

create table if not exists public.order_drafts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  source_inbox_id uuid references public.wa_inbox(id) on delete set null,
  closing_id text,
  customer_name text,
  customer_whatsapp text,
  payload jsonb not null,
  proof_url text,
  ai_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  reject_reason text,
  approved_order_id uuid,
  approved_order_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_drafts_source_inbox
  on public.order_drafts (source_inbox_id)
  where source_inbox_id is not null;
create index if not exists order_drafts_status_created
  on public.order_drafts (status, created_at desc);

alter table public.wa_escalations enable row level security;
alter table public.wa_learnings enable row level security;
alter table public.order_drafts enable row level security;

grant select, insert, update on public.wa_escalations to service_role;
grant select, insert, update on public.wa_learnings to service_role;
grant select, insert, update on public.order_drafts to service_role;
