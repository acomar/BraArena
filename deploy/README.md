# BraArena manual first deployment

The workflow is manually triggered (workflow_dispatch) and intentionally does not deploy on push.
It uses a separate /opt/braarena directory, braarena_pgdata volume and 127.0.0.1:8081 port, so it does not replace Nexora.

Configure repository environment **braarena-production** and its secrets:
BRAARENA_SSH_KEY, BRAARENA_KNOWN_HOSTS, BRAARENA_HOST, BRAARENA_USER.
Prepare /opt/braarena/.env on the VPS (chmod 600) with POSTGRES_PASSWORD, ADMIN_TOKEN and OPENAI_API_KEY.
The SSH user must be able to run docker compose and write /opt/braarena.
Ensure a reverse proxy with HTTPS forwards to localhost:8081; never expose port 8081 directly.
GitHub packages must be pullable with GITHUB_TOKEN from this repository.

IMPORTANT: workflow is scaffolding, not a verified deployment. It has not been executed. Do not enable public access before tests, candidate access controls, consent and privacy controls are implemented.
