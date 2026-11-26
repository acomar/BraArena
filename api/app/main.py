import asyncio
import json
import os
import secrets
from contextlib import asynccontextmanager, suppress
from datetime import date
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from . import voice
from .billing import card
from .models import Access, Consent, Guard, Interview, Review, Template
from .reports import analyze, assemble
from .store import connection, digest, migrate


async def maintenance():
    while True:
        with connection() as conn:
            conn.execute("DELETE FROM recordings WHERE expires_at<=now()")
            calls=conn.execute("SELECT id,call_id FROM interviews WHERE call_id IS NOT NULL AND status IN ('completed','interrupted')").fetchall()
        for row in calls:
            if await voice.hangup(row['call_id']):
                with connection() as conn:
                    conn.execute("UPDATE interviews SET call_id=NULL WHERE id=%s AND call_id=%s",(row['id'],row['call_id']))
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app):
    if len(os.environ.get('ADMIN_TOKEN',''))<24:
        raise RuntimeError('Configure um ADMIN_TOKEN aleatório com pelo menos 24 caracteres')
    migrate()
    with connection() as conn:
        stale=conn.execute("""UPDATE interviews SET status='completed',ended_at=now(),finish_reason='restart'
            WHERE status IN ('in_progress','connecting') RETURNING id""").fetchall()
        for row in stale:
            assemble(conn,row['id'])
        pending=conn.execute("SELECT interview_id FROM interview_reports WHERE report->>'analysisStatus'='pending'").fetchall()
    for row in pending:
        voice.spawn(analyze(row['interview_id']))
    task=asyncio.create_task(maintenance())
    yield
    for control in voice.live.values():
        control['end']='restart'
    if voice.jobs:
        await asyncio.wait(list(voice.jobs),timeout=12)
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task

app=FastAPI(title='BraArena',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

@app.exception_handler(RequestValidationError)
async def invalid(request,err):
    return JSONResponse({'detail':'Confira os campos e consentimentos.'},status_code=422)

def admin(authorization:str=Header(default='')):
    if not secrets.compare_digest(authorization.encode(),('Bearer '+os.environ['ADMIN_TOKEN']).encode()):
        raise HTTPException(401,'Token administrativo inválido.')

@app.get('/health')
def health():
    with connection() as conn:
        conn.execute('SELECT 1')
    return {'ok':True,'voiceConfigured':bool(os.getenv('OPENAI_API_KEY')),'release':os.getenv('BRAARENA_RELEASE')}

@app.get('/api/guardrails',dependencies=[Depends(admin)])
def guards():
    with connection() as conn:
        return conn.execute("SELECT * FROM guardrails ORDER BY name,version DESC").fetchall()

@app.post('/api/guardrails',dependencies=[Depends(admin)],status_code=201)
def new_guard(body:Guard):
    with connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))",(body.name,))
        return conn.execute("""INSERT INTO guardrails SELECT %s,COALESCE(MAX(version),0)+1,%s FROM guardrails WHERE name=%s
            RETURNING name,version,instruction""",(body.name,body.instruction,body.name)).fetchone()

def resolve(conn,template):
    data=template.model_dump()
    rules=[]
    for guard in template.guardrails:
        row=conn.execute("SELECT instruction FROM guardrails WHERE name=%s AND version=%s",(guard.name,guard.version)).fetchone()
        if not row:
            raise HTTPException(422,'Versão de guardrail desconhecida.')
        rules.append(row['instruction'])
    data['instructions']=rules
    return json.dumps(data)

@app.post('/api/templates',dependencies=[Depends(admin)],status_code=201)
def create_template(template:Template):
    with connection() as conn:
        return conn.execute("INSERT INTO templates(id,title,definition) VALUES(%s,%s,%s::jsonb) RETURNING id",
                            (uuid4(),template.title,resolve(conn,template))).fetchone()

@app.put('/api/templates/{ident}',dependencies=[Depends(admin)])
def update_template(ident:UUID,template:Template):
    with connection() as conn:
        row=conn.execute("UPDATE templates SET title=%s,definition=%s::jsonb WHERE id=%s RETURNING id",
                         (template.title,resolve(conn,template),ident)).fetchone()
        if not row:
            raise HTTPException(404,'Modelo inexistente.')
        return row

@app.get('/api/templates',dependencies=[Depends(admin)])
def templates():
    with connection() as conn:
        return conn.execute("SELECT id,title,definition,created_at FROM templates ORDER BY created_at DESC").fetchall()

@app.post('/api/interviews',dependencies=[Depends(admin)],status_code=201)
def invite(body:Interview):
    ident,token=uuid4(),secrets.token_urlsafe(32)
    with connection() as conn:
        row=conn.execute("""INSERT INTO interviews(id,template_id,candidate_name,candidate_context,token_hash,expires_at,definition)
            SELECT %s,t.id,%s,%s,%s,now()+%s*interval '1 hour',t.definition || %s::jsonb FROM templates t WHERE t.id=%s
            RETURNING expires_at""",(ident,body.candidateName,body.candidateContext,digest(token),body.validityHours,json.dumps({'rates':card()}),body.templateId)).fetchone()
        if not row:
            raise HTTPException(404,'Modelo inexistente.')
    return {'id':ident,'token':token,**row}

@app.post('/api/candidate/{ident}/info')
def info(ident:UUID,body:Access):
    with connection() as conn:
        row=conn.execute("""SELECT definition->>'title' AS title,definition->'recordingEnabled' AS recording,
            definition->'durationMinutes' AS minutes FROM interviews WHERE id=%s AND token_hash=%s
            AND expires_at>now() AND status='scheduled'""",(ident,digest(body.token))).fetchone()
        if not row:
            raise HTTPException(404,'Convite utilizado, expirado ou inválido.')
        return {**row,'voiceConfigured':bool(os.getenv('OPENAI_API_KEY'))}

@app.post('/api/candidate/{ident}/session')
async def session(ident:UUID,body:Consent):
    return await voice.start(ident,body)

def session_row(ident,token):
    with connection() as conn:
        row=conn.execute("""SELECT status,recording_allowed,deadline FROM interviews WHERE id=%s AND session_hash=%s
            AND (status='in_progress' AND deadline>now()-interval '5 minutes' OR ended_at>now()-interval '10 minutes')""",(ident,digest(token))).fetchone()
        if not row:
            raise HTTPException(404,'Sessão inválida.')
        return row

@app.post('/api/candidate/{ident}/ready')
async def ready(ident:UUID,body:Access):
    session_row(ident,body.token)
    if ident not in voice.live:
        raise HTTPException(409,'Chamada encerrada.')
    voice.live[ident]['ready']=True
    return {'ok':True}

@app.post('/api/candidate/{ident}/status')
async def status(ident:UUID,body:Access):
    row=session_row(ident,body.token)
    if ident in voice.live:
        voice.live[ident]['last_seen']=asyncio.get_running_loop().time()
    return {'status':row['status'],'state':voice.live.get(ident,{}).get('state','idle'),'deadline':row['deadline']}

@app.post('/api/candidate/{ident}/finish')
async def finish(ident:UUID,body:Access):
    session_row(ident,body.token)
    if ident in voice.live:
        voice.live[ident]['end']='manual'
    return {'ok':True}

@app.put('/api/candidate/{ident}/recording')
async def upload(ident:UUID,request:Request,authorization:str=Header(default='')):
    token=authorization.removeprefix('Bearer ')
    row=session_row(ident,token)
    if not row['recording_allowed']:
        raise HTTPException(403,'Sem consentimento para gravação.')
    if request.headers.get('content-type','').split(';')[0]!='audio/webm':
        raise HTTPException(415,'Formato esperado WebM.')
    buf=bytearray()
    async for chunk in request.stream():
        if len(buf)+len(chunk)>64*1024*1024:
            raise HTTPException(413,'Gravação muito grande.')
        buf.extend(chunk)
    if not buf.startswith(bytes.fromhex('1a45dfa3')):
        raise HTTPException(422,'Contêiner WebM inválido.')
    with connection() as conn:
        conn.execute("""INSERT INTO recordings VALUES(%s,%s,now()+%s*interval '1 day') ON CONFLICT DO NOTHING""",
                     (ident,bytes(buf),int(os.getenv('RECORDING_DAYS','30'))))
    return {'ok':True}

@app.get('/api/interviews',dependencies=[Depends(admin)])
def interviews():
    with connection() as conn:
        return conn.execute("""SELECT i.id,i.candidate_name,CASE WHEN status='scheduled' AND expires_at<=now()
            THEN 'expired' ELSE status END AS status,i.started_at,i.ended_at,expires_at,definition->>'title' AS title,
            r.report->'cost' AS cost FROM interviews i LEFT JOIN interview_reports r ON r.interview_id=i.id ORDER BY i.created_at DESC""").fetchall()

@app.get('/api/interviews/{ident}/transcript',dependencies=[Depends(admin)])
def transcript(ident:UUID):
    with connection() as conn:
        return conn.execute("SELECT speaker,content,source,event_id,created_at,block_index FROM transcript_turns WHERE interview_id=%s ORDER BY created_at,id",(ident,)).fetchall()

@app.get('/api/interviews/{ident}/usage',dependencies=[Depends(admin)])
def usage(ident:UUID):
    with connection() as conn:
        return {'events':conn.execute("SELECT component,response_id,usage,source,created_at FROM realtime_usage WHERE interview_id=%s ORDER BY created_at",(ident,)).fetchall()}

@app.get('/api/interviews/{ident}/report',dependencies=[Depends(admin)])
def report(ident:UUID):
    with connection() as conn:
        row=conn.execute("""SELECT r.report,r.created_at,i.review, EXISTS(SELECT 1 FROM recordings a WHERE a.interview_id=i.id AND a.expires_at>now()) AS recording
            FROM interview_reports r JOIN interviews i ON i.id=r.interview_id WHERE i.id=%s""",(ident,)).fetchone()
        if not row:
            raise HTTPException(404,'Relatório indisponível.')
        return row

@app.post('/api/interviews/{ident}/report',dependencies=[Depends(admin)])
def refresh_report(ident:UUID):
    with connection() as conn:
        if not conn.execute("SELECT 1 FROM interviews WHERE id=%s AND status='completed'",(ident,)).fetchone():
            raise HTTPException(409,'A entrevista deve estar encerrada.')
        return assemble(conn,ident)

@app.put('/api/interviews/{ident}/review',dependencies=[Depends(admin)])
def review(ident:UUID,body:Review):
    with connection() as conn:
        if not conn.execute("UPDATE interviews SET review=%s WHERE id=%s AND status='completed' RETURNING id",(body.note,ident)).fetchone():
            raise HTTPException(409,'Entrevista indisponível para revisão.')
        return {'ok':True}

@app.get('/api/interviews/{ident}/recording',dependencies=[Depends(admin)])
def recording(ident:UUID):
    with connection() as conn:
        row=conn.execute("SELECT audio FROM recordings WHERE interview_id=%s AND expires_at>now()",(ident,)).fetchone()
        if not row:
            raise HTTPException(404,'Gravação indisponível.')
        return Response(bytes(row['audio']),media_type='audio/webm')

@app.delete('/api/interviews/{ident}/recording',dependencies=[Depends(admin)],status_code=204)
def delete_recording(ident:UUID):
    with connection() as conn:
        conn.execute("DELETE FROM recordings WHERE interview_id=%s",(ident,))

@app.get('/api/spend',dependencies=[Depends(admin)])
def spending(start:date,end:date):
    if start>end:
        raise HTTPException(422,'Período inválido.')
    with connection() as conn:
        return conn.execute("""SELECT coalesce(sum((r.report->'cost'->>'usd')::numeric),0) AS usd,
            count(*) AS completed,count(*) FILTER(WHERE r.report->'cost'->>'status' IS DISTINCT FROM 'consolidated') AS incomplete
            FROM interviews i LEFT JOIN interview_reports r ON r.interview_id=i.id
            WHERE i.ended_at >= %s::date AND i.ended_at < %s::date+1""",(start,end)).fetchone()
