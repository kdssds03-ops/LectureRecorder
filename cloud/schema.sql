-- ============================================================================
-- 노깡 클라우드 동기화 스키마 (Supabase / Postgres)
-- 텍스트 우선 동기화: 녹음 메타 + 전사/요약/번역/세그먼트.
-- 오디오 파일은 2단계에서 Supabase Storage 버킷('recordings')으로 확장.
-- ============================================================================

-- 녹음 노트 테이블 ----------------------------------------------------------
create table if not exists public.recordings (
  id            text primary key,                 -- 클라이언트 생성 id (Date.now())
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default '',
  title_source  text default 'default',
  lecture_type  text default 'general',
  duration      integer default 0,                -- ms
  created_at     bigint default 0,                -- 클라이언트 epoch ms
  updated_at    timestamptz not null default now(),
  folder_id     text,
  tags          text[] default '{}',
  is_favorite   boolean default false,
  transcript    text default '',
  summary       jsonb,                            -- StructuredSummary
  translation   text,
  segments      jsonb,                            -- TranscriptSegment[]
  chapters      jsonb,                            -- Chapter[]
  quiz          jsonb,                            -- QuizQuestion[]
  highlights    integer[] default '{}',
  audio_path    text,                             -- Storage 경로(2단계)
  deleted       boolean not null default false    -- 삭제 동기화용 tombstone
);

create index if not exists recordings_user_idx on public.recordings (user_id);
create index if not exists recordings_updated_idx on public.recordings (user_id, updated_at);

-- updated_at 자동 갱신 트리거 -------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_recordings_touch on public.recordings;
create trigger trg_recordings_touch
  before update on public.recordings
  for each row execute function public.touch_updated_at();

-- 폴더 테이블 ---------------------------------------------------------------
create table if not exists public.folders (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  created_at   bigint default 0,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists folders_user_idx on public.folders (user_id);

-- Row Level Security: 사용자는 자기 데이터만 접근 ----------------------------
alter table public.recordings enable row level security;
alter table public.folders    enable row level security;

drop policy if exists "own recordings" on public.recordings;
create policy "own recordings" on public.recordings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own folders" on public.folders;
create policy "own folders" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2단계 오디오 스토리지(참고) -----------------------------------------------
-- Supabase 대시보드 > Storage 에서 비공개 버킷 'recordings' 생성 후,
-- 아래 정책으로 사용자별 폴더(user_id/...) 접근만 허용:
--   (storage.foldername(name))[1] = auth.uid()::text
