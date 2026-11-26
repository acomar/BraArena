from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Token = Annotated[str, Field(min_length=20, max_length=256)]


class Block(BaseModel):
    type: Literal["intro", "question", "situation", "closing"]
    prompt: Text
    expectedAnswer: str | None = Field(None, max_length=4000)
    drivers: list[Text] = Field(default_factory=list, max_length=30)
    timeboxSeconds: int = Field(gt=0, le=10800)


class GuardRef(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    version: int = Field(gt=0)


class Guard(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    instruction: Text


class Template(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    durationMinutes: int = Field(ge=1, le=180)
    blocks: list[Block] = Field(min_length=1, max_length=100)
    recordingEnabled: bool = False
    guardrails: list[GuardRef] = Field(default_factory=list, max_length=30)
    budgetUsd: float = Field(default=6, gt=0, le=10000)


class Interview(BaseModel):
    templateId: UUID
    candidateName: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    candidateContext: str = Field(default="", max_length=10000)
    validityHours: int = Field(default=168, ge=1, le=2160)


class Access(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: Token


class Consent(Access):
    transcriptConsent: Literal[True]
    recordingConsent: bool = False
    sdp: str = Field(min_length=20, max_length=32000)


class Review(BaseModel):
    note: str = Field(max_length=12000)
