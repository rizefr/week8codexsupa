create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  day_key text not null,
  log jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.body_weight_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  log jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, date desc);
create index if not exists body_weight_logs_user_date_idx on public.body_weight_logs (user_id, date asc);

alter table public.app_settings enable row level security;
alter table public.workout_logs enable row level security;
alter table public.body_weight_logs enable row level security;

drop policy if exists "Users can read own settings" on public.app_settings;
drop policy if exists "Users can insert own settings" on public.app_settings;
drop policy if exists "Users can update own settings" on public.app_settings;
drop policy if exists "Users can delete own settings" on public.app_settings;

create policy "Users can read own settings"
  on public.app_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.app_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.app_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own settings"
  on public.app_settings for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own workout logs" on public.workout_logs;
drop policy if exists "Users can insert own workout logs" on public.workout_logs;
drop policy if exists "Users can update own workout logs" on public.workout_logs;
drop policy if exists "Users can delete own workout logs" on public.workout_logs;

create policy "Users can read own workout logs"
  on public.workout_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own workout logs"
  on public.workout_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workout logs"
  on public.workout_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own workout logs"
  on public.workout_logs for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own body weights" on public.body_weight_logs;
drop policy if exists "Users can insert own body weights" on public.body_weight_logs;
drop policy if exists "Users can update own body weights" on public.body_weight_logs;
drop policy if exists "Users can delete own body weights" on public.body_weight_logs;

create policy "Users can read own body weights"
  on public.body_weight_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own body weights"
  on public.body_weight_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own body weights"
  on public.body_weight_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own body weights"
  on public.body_weight_logs for delete
  using (auth.uid() = user_id);
