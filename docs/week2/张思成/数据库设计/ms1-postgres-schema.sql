CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE resume_parse_status AS ENUM ('uploaded', 'parsing', 'available', 'failed');
CREATE TYPE experience_source AS ENUM ('parsed', 'manual');
CREATE TYPE experience_type AS ENUM ('project', 'internship', 'work', 'education', 'other');
CREATE TYPE interview_plan_status AS ENUM ('draft', 'ready', 'archived');
CREATE TYPE interview_session_status AS ENUM ('in_progress', 'completed', 'ended_early', 'failed');
CREATE TYPE report_status AS ENUM ('pending', 'generating', 'ready', 'failed');
CREATE TYPE fixed_turn_goal AS ENUM (
  'project_overview',
  'personal_contribution',
  'tradeoff_decision',
  'validation_result'
);
CREATE TYPE transcript_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE feedback_status AS ENUM ('evidence_complete', 'needs_more_evidence');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  default_resume_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size_bytes bigint NOT NULL,
  storage_key text NOT NULL UNIQUE,
  parse_status resume_parse_status NOT NULL DEFAULT 'uploaded',
  parse_error text,
  is_default boolean NOT NULL DEFAULT false,
  parsed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resumes_pdf_only CHECK (mime_type = 'application/pdf'),
  CONSTRAINT resumes_max_10mb CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
);

ALTER TABLE users
  ADD CONSTRAINT users_default_resume_id_fkey
  FOREIGN KEY (default_resume_id) REFERENCES resumes(id) ON DELETE SET NULL;

CREATE TABLE experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  source experience_source NOT NULL DEFAULT 'parsed',
  type experience_type NOT NULL DEFAULT 'project',
  title text NOT NULL,
  organization text,
  start_date date,
  end_date date,
  sort_order integer NOT NULL DEFAULT 0,
  background text NOT NULL DEFAULT '',
  responsibility text NOT NULL DEFAULT '',
  achievements text NOT NULL DEFAULT '',
  raw_extract_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interview_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  source_experience_id uuid REFERENCES experiences(id) ON DELETE SET NULL,
  target_role text NOT NULL,
  job_description text NOT NULL DEFAULT '',
  practice_focus text NOT NULL DEFAULT '',
  extra_requirements text NOT NULL DEFAULT '',
  experience_snapshot_json jsonb NOT NULL,
  status interview_plan_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES interview_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  style text NOT NULL DEFAULT '',
  focus_areas text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES interview_plans(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL REFERENCES interviewers(id) ON DELETE CASCADE,
  status interview_session_status NOT NULL DEFAULT 'in_progress',
  current_turn_index integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  ended_early_at timestamptz,
  duration_seconds integer,
  report_status report_status NOT NULL DEFAULT 'pending',
  report_summary_json jsonb,
  report_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_sessions_turn_index_range CHECK (current_turn_index >= 0 AND current_turn_index <= 4)
);

CREATE TABLE audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  file_size_bytes bigint,
  duration_ms integer,
  transcript text,
  transcript_status transcript_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  fixed_goal fixed_turn_goal NOT NULL,
  question_text text NOT NULL,
  played_question_text text NOT NULL DEFAULT '',
  was_interrupted boolean NOT NULL DEFAULT false,
  answer_audio_asset_id uuid REFERENCES audio_assets(id) ON DELETE SET NULL,
  answer_transcript text NOT NULL DEFAULT '',
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turns_index_range CHECK (turn_index >= 1 AND turn_index <= 4),
  CONSTRAINT turns_session_index_unique UNIQUE (session_id, turn_index)
);

CREATE TABLE feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL UNIQUE REFERENCES turns(id) ON DELETE CASCADE,
  status feedback_status NOT NULL,
  evidence_quote text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  improvement_goal text NOT NULL DEFAULT '',
  example_answer text NOT NULL DEFAULT '',
  gap_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retry_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  feedback_item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  attempt_index integer NOT NULL,
  audio_asset_id uuid REFERENCES audio_assets(id) ON DELETE SET NULL,
  transcript text NOT NULL DEFAULT '',
  filled_gap_json jsonb,
  missing_gap_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retry_attempts_attempt_index_positive CHECK (attempt_index >= 1),
  CONSTRAINT retry_attempts_turn_index_unique UNIQUE (turn_id, attempt_index)
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX resumes_user_id_idx ON resumes(user_id);
CREATE INDEX resumes_user_status_idx ON resumes(user_id, parse_status);
CREATE UNIQUE INDEX resumes_one_default_per_user_idx ON resumes(user_id) WHERE is_default = true AND deleted_at IS NULL;
CREATE INDEX experiences_user_id_idx ON experiences(user_id);
CREATE INDEX experiences_resume_id_idx ON experiences(resume_id);
CREATE INDEX interview_plans_user_id_idx ON interview_plans(user_id);
CREATE INDEX interview_plans_user_updated_idx ON interview_plans(user_id, updated_at DESC);
CREATE INDEX interviewers_user_id_idx ON interviewers(user_id);
CREATE INDEX interviewers_plan_id_idx ON interviewers(plan_id);
CREATE INDEX interview_sessions_user_id_idx ON interview_sessions(user_id);
CREATE INDEX interview_sessions_plan_id_idx ON interview_sessions(plan_id);
CREATE INDEX interview_sessions_interviewer_id_idx ON interview_sessions(interviewer_id);
CREATE INDEX audio_assets_user_id_idx ON audio_assets(user_id);
CREATE INDEX turns_user_id_idx ON turns(user_id);
CREATE INDEX turns_session_id_idx ON turns(session_id);
CREATE INDEX turns_audio_asset_id_idx ON turns(answer_audio_asset_id);
CREATE INDEX feedback_items_user_id_idx ON feedback_items(user_id);
CREATE INDEX feedback_items_session_id_idx ON feedback_items(session_id);
CREATE INDEX retry_attempts_user_id_idx ON retry_attempts(user_id);
CREATE INDEX retry_attempts_turn_id_idx ON retry_attempts(turn_id);
CREATE INDEX retry_attempts_feedback_item_id_idx ON retry_attempts(feedback_item_id);
CREATE INDEX retry_attempts_audio_asset_id_idx ON retry_attempts(audio_asset_id);
