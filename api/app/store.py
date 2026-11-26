import hashlib
import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


@contextmanager
def connection():
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, connect_timeout=5) as conn:
        yield conn


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def migrate():
    from pathlib import Path
    with connection() as conn:
        conn.execute(Path(__file__).with_name("schema.sql").read_text())
