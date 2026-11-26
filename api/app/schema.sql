CREATE TABLE IF NOT EXISTS templates (
            id uuid PRIMARY KEY, title text NOT NULL,
            definition jsonb NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS interviews (
            id uuid PRIMARY KEY, template_id uuid REFERENCES templates(id),
            candidate_name text NOT NULL, candidate_context text,
            token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'scheduled',
            created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS transcript_turns (
            id bigserial PRIMARY KEY, interview_id uuid REFERENCES interviews(id),
            speaker text NOT NULL CHECK(speaker IN ('candidate','assistant')),
            content text NOT NULL, created_at timestamptz DEFAULT now());
ALTER TABLE transcript_turns ADD COLUMN IF NOT EXISTS event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS transcript_event_unique ON transcript_turns(interview_id,event_id);
CREATE TABLE IF NOT EXISTS realtime_usage (
            interview_id uuid NOT NULL REFERENCES interviews(id), response_id text NOT NULL,
            usage jsonb NOT NULL, source text NOT NULL DEFAULT 'browser_unverified',
            created_at timestamptz DEFAULT now(), PRIMARY KEY(interview_id,response_id));
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS ended_at timestamptz;
CREATE TABLE IF NOT EXISTS interview_reports (
            interview_id uuid PRIMARY KEY REFERENCES interviews(id),
            report jsonb NOT NULL, created_at timestamptz DEFAULT now());
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS definition jsonb;
UPDATE interviews i SET definition=t.definition FROM templates t WHERE i.template_id=t.id AND i.definition IS NULL;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE interviews SET expires_at=created_at+interval '7 days' WHERE expires_at IS NULL;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS recording_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS session_hash text;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS call_id text;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS deadline timestamptz;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS block_index integer DEFAULT 0;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS finish_reason text;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS review text;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS notices text[] DEFAULT '{}';
ALTER TABLE transcript_turns ADD COLUMN IF NOT EXISTS source text DEFAULT 'browser_unverified';
ALTER TABLE transcript_turns ADD COLUMN IF NOT EXISTS block_index integer;
ALTER TABLE realtime_usage ADD COLUMN IF NOT EXISTS component text DEFAULT 'voice';
CREATE TABLE IF NOT EXISTS guardrails (
    name text, version integer, instruction text NOT NULL, PRIMARY KEY(name,version)
);
CREATE TABLE IF NOT EXISTS recordings (
    interview_id uuid PRIMARY KEY REFERENCES interviews(id), audio bytea NOT NULL,
    expires_at timestamptz NOT NULL
);
ALTER TABLE transcript_turns ADD COLUMN IF NOT EXISTS provider_event_id text;
