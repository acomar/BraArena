import hashlib
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID, uuid4

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

DSN = os.environ["DATABASE_URL"]
ADMIN_TOKEN = os.environ["ADMIN_TOKEN"]

def connection():
    return psycopg.connect(DSN, row_factory=dict_row)

@asynccontextmanager
async def lifespan(app: FastAPI):
    with connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS templates (
            id uuid PRIMARY KEY, title text NOT NULL,
            definition jsonb NOT NULL, created_at timestamptz DEFAULT now())""")
        conn.execute("""CREATE TABLE IF NOT EXISTS interviews (
            id uuid PRIMARY KEY, template_id uuid REFERENCES templates(id),
            candidate_name text NOT NULL, candidate_context text,
            token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'scheduled',
            created_at timestamptz DEFAULT now())""")
        conn.execute("""CREATE TABLE IF NOT EXISTS transcript_turns (
            id bigserial PRIMARY KEY, interview_id uuid REFERENCES interviews(id),
            speaker text NOT NULL CHECK(speaker IN ('candidate','assistant')),
            content text NOT NULL, created_at timestamptz DEFAULT now())""")
    yield

app = FastAPI(title="BraArena AI Interview API", lifespan=lifespan)

def admin(authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization, f"Bearer {ADMIN_TOKEN}"):
        raise HTTPException(401, "Unauthorized")

class Block(BaseModel):
    type: str = Field(pattern="^(intro|question|closing)$")
    prompt: str = Field(min_length=1)
    expectedAnswer: str | None = None
    drivers: list[str] = Field(default_factory=list)
    timeboxSeconds: int = Field(gt=0)

class Template(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    durationMinutes: int = Field(ge=5, le=180)
    blocks: list[Block] = Field(min_length=1)

class Interview(BaseModel):
    templateId: UUID
    candidateName: str = Field(min_length=1)
    candidateContext: str = Field(default="", max_length=10000)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/templates", status_code=201, dependencies=[Depends(admin)])
def create_template(template: Template):
    ident = uuid4()
    with connection() as conn:
        conn.execute("INSERT INTO templates(id,title,definition) VALUES(%s,%s,%s::jsonb)",
                     (ident, template.title, template.model_dump_json()))
    return {"id": ident}

@app.get("/api/templates", dependencies=[Depends(admin)])
def list_templates():
    with connection() as conn:
        return conn.execute("SELECT id,title,definition,created_at FROM templates ORDER BY created_at DESC").fetchall()

@app.post("/api/interviews", status_code=201, dependencies=[Depends(admin)])
def create_interview(interview: Interview):
    ident, token = uuid4(), secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        with connection() as conn:
            conn.execute("""INSERT INTO interviews(id,template_id,candidate_name,candidate_context,token_hash)
                            VALUES(%s,%s,%s,%s,%s)""",
                         (ident, interview.templateId, interview.candidateName, interview.candidateContext, token_hash))
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(404, "Template not found")
    return {"id": ident, "token": token}

@app.get("/api/interviews/{interview_id}/transcript", dependencies=[Depends(admin)])
def transcript(interview_id: UUID):
    with connection() as conn:
        return conn.execute("""SELECT speaker,content,created_at FROM transcript_turns
                               WHERE interview_id=%s ORDER BY id""", (interview_id,)).fetchall()
