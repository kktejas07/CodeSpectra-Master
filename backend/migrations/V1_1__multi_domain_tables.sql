-- Domains are code-owned; this table is a projection for FK integrity + admin UI
CREATE TABLE IF NOT EXISTS domain (
    key             TEXT PRIMARY KEY,
    version         TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    family          TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item (
    id              UUID PRIMARY KEY,
    domain_key      TEXT NOT NULL REFERENCES domain(key),
    version         INT  NOT NULL DEFAULT 1,
    difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
    points          NUMERIC NOT NULL,          -- 3 / 4 / 5
    skill_tags      TEXT[] NOT NULL DEFAULT '{}',
    role_tags       TEXT[] NOT NULL DEFAULT '{}',
    payload         JSONB NOT NULL,            -- plugin-owned
    author_id       UUID,
    status          TEXT NOT NULL DEFAULT 'draft',  -- draft|review|active|retired
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, version)
);
CREATE INDEX IF NOT EXISTS idx_item_skill_tags ON item USING GIN (skill_tags);
CREATE INDEX IF NOT EXISTS idx_item_payload_ops ON item USING GIN (payload jsonb_path_ops);

-- Immutable history so a score can always be replayed against the item as authored
CREATE TABLE IF NOT EXISTS item_version (
    item_id         UUID NOT NULL,
    version         INT  NOT NULL,
    payload         JSONB NOT NULL,
    points          NUMERIC NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, version)
);

CREATE TABLE IF NOT EXISTS assessment (
    id              UUID PRIMARY KEY,
    org_id          UUID NOT NULL,
    name            TEXT NOT NULL,
    blueprint       JSONB NOT NULL,
    integrity_policy JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materialized item list per assessment; regenerated on edit, frozen on publish
CREATE TABLE IF NOT EXISTS assessment_item (
    assessment_id   UUID NOT NULL REFERENCES assessment(id),
    position        INT  NOT NULL,
    item_id         UUID NOT NULL,
    item_version    INT  NOT NULL,
    points_override NUMERIC,
    PRIMARY KEY (assessment_id, position),
    FOREIGN KEY (item_id, item_version) REFERENCES item_version(item_id, version)
);

CREATE TABLE IF NOT EXISTS attempt (
    id              UUID PRIMARY KEY,
    assessment_id   UUID NOT NULL REFERENCES assessment(id),
    candidate_id    UUID NOT NULL,
    state           TEXT NOT NULL,   -- invited|checking|in_progress|submitted|graded|void
    started_at      TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    integrity_score NUMERIC,
    meta            JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS attempt_item (
    id              UUID PRIMARY KEY,
    attempt_id      UUID NOT NULL REFERENCES attempt(id),
    position        INT  NOT NULL,
    item_id         UUID NOT NULL,
    item_version    INT  NOT NULL,
    submission      JSONB,
    artifact_uris   TEXT[] NOT NULL DEFAULT '{}',
    state           TEXT NOT NULL DEFAULT 'pending',
    UNIQUE (attempt_id, position)
);

CREATE TABLE IF NOT EXISTS score_report (
    id              UUID PRIMARY KEY,
    attempt_item_id UUID NOT NULL REFERENCES attempt_item(id),
    criteria        JSONB NOT NULL,
    raw_points      NUMERIC NOT NULL,
    max_points      NUMERIC NOT NULL,
    grader_version  TEXT NOT NULL,
    item_version    INT NOT NULL,
    needs_review    BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason   TEXT,
    superseded_by   UUID REFERENCES score_report(id),  -- human override chain
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrity_signal (
    id              BIGSERIAL PRIMARY KEY,
    attempt_id      UUID NOT NULL REFERENCES attempt(id),
    kind            TEXT NOT NULL,       -- blur|paste_burst|multi_monitor|face_absent|similarity
    severity        NUMERIC NOT NULL,    -- 0..1
    at              TIMESTAMPTZ NOT NULL,
    detail          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_integrity_signal_attempt ON integrity_signal (attempt_id, at);
