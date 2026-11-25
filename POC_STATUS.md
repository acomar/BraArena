# AI Interview POC status

Implemented: isolated PostgreSQL and Node API in Docker Compose; interview template creation/listing; interview link token generation; transcript retrieval endpoint; basic admin bearer authentication.

Not yet implemented: React admin UI, candidate room, realtime voice, transcript ingestion, summary/scoring, configurable guardrails, public HTTPS proxy, deployment and automated tests.

Security: keep secrets out of Git. API port is bound to loopback only. Do not expose this prototype to candidates until authentication, token expiry, HTTPS, privacy and abuse controls are implemented.
