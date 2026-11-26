import asyncio
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from websockets.asyncio.client import connect

from .billing import card, cost
from .conversation import Conversation, TURN_DETECTION, stage_prompt
from .reports import analyze, assemble, save_usage
from .store import connection, digest

log = logging.getLogger(__name__)
live = {}
jobs = set()

def spawn(coro):
    task = asyncio.create_task(coro)
    jobs.add(task)
    task.add_done_callback(jobs.discard)
    return task

def validate_offer(sdp):
    lines = sdp.replace('\r\n','\n').split('\n')
    media = [s for s in lines if s.startswith('m=')]
    if (lines[0]!='v=0' or any('\r' in s or '\x00' in s for s in lines) or len(media)!=1
            or not re.fullmatch(r'm=audio [0-9]+ UDP/TLS/RTP/SAVPF [0-9 ]+',media[0])
            or any('sctp' in s.lower() or 'webrtc-datachannel' in s.lower() for s in lines)):
        raise HTTPException(422,'É necessária uma oferta WebRTC somente de áudio.')

def headers():
    return {'Authorization':'Bearer '+os.environ['OPENAI_API_KEY']}

async def hangup(call):
    if not call:
        return True
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post('https://api.openai.com/v1/realtime/calls/'+call+'/hangup',headers=headers())
            return r.is_success or r.status_code in (404,410)
    except (httpx.HTTPError,KeyError):
        return False

def note(conn,ident,label):
    conn.execute("UPDATE interviews SET notices=array_append(notices,%s) WHERE id=%s AND NOT (%s=ANY(notices))",(label,ident,label))

async def start(ident,body):
    validate_offer(body.sdp)
    session = secrets.token_urlsafe(32)
    with connection() as conn:
        row = conn.execute("SELECT * FROM interviews WHERE id=%s AND token_hash=%s AND expires_at>now() FOR UPDATE",(ident,digest(body.token))).fetchone()
        if not row:
            raise HTTPException(404,'Convite inválido ou expirado.')
        if row['status']!='scheduled':
            raise HTTPException(409,'Convite já utilizado.')
        if body.recordingConsent and not row['definition'].get('recordingEnabled'):
            raise HTTPException(422,'Gravação desabilitada.')
        if not os.getenv('OPENAI_API_KEY'):
            raise HTTPException(503,'A voz aguarda a configuração da OpenAI pelo gestor.')
        conn.execute("""UPDATE interviews SET status='connecting',session_hash=%s,consent_at=now(),
            consent_version='pt-BR-v1',recording_allowed=%s WHERE id=%s""",(digest(session),body.recordingConsent,ident))
    definition = row['definition']
    rates = definition.get('rates') or card()
    config = {'type':'realtime','model':rates['voice']['model'],'instructions':stage_prompt(definition,0),
              'audio':{'input':{'transcription':{'model':rates['transcription']['model'],'language':'pt'},
                               'turn_detection':TURN_DETECTION},
                       'output':{'voice':'marin'}}}
    call = None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            result = await client.post('https://api.openai.com/v1/realtime/calls',headers=headers(),files={
                'sdp':(None,body.sdp),'session':(None,json.dumps(config),'application/json')})
            result.raise_for_status()
        call = urlsplit(result.headers['location']).path.rsplit('/',1)[-1]
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,200}',call):
            call = None
            raise ValueError('invalid call')
        with connection() as conn:
            conn.execute("UPDATE interviews SET call_id=%s WHERE id=%s",(call,ident))
        socket = await connect('wss://api.openai.com/v1/realtime?call_id='+call,additional_headers=headers(),open_timeout=10)
    except Exception as exc:
        closed = await hangup(call)
        with connection() as conn:
            conn.execute("UPDATE interviews SET status=%s,session_hash=NULL,call_id=%s WHERE id=%s",('scheduled' if closed else 'interrupted',None if closed else call,ident))
        raise HTTPException(502,'A OpenAI não abriu a chamada. Verifique o projeto e tente novamente.') from exc
    with connection() as conn:
        deadline=conn.execute("""UPDATE interviews SET status='in_progress',started_at=now(),
            deadline=now()+%s*interval '1 minute' WHERE id=%s RETURNING deadline""",(definition['durationMinutes'],ident)).fetchone()['deadline']
    control = {'ready':False,'end':None,'state':'connecting','deadline':deadline,'last_seen':asyncio.get_running_loop().time()}
    live[ident]=control
    spawn(observe(ident,definition,call,socket,control))
    return {'sdp':result.text,'sessionToken':session,'deadline':deadline}

def record(ident,index,event):
    kind = event.get('type','')
    item = event.get('item_id') or event.get('item',{}).get('id')
    with connection() as conn:
        if kind=='response.done':
            response=event['response']
            save_usage(conn,ident,response['id'],'voice',response.get('usage'))
            return
        if not item:
            return
        if kind=='input_audio_buffer.committed' or 'input_audio_transcription.' in kind:
            speaker='candidate'
        elif (kind=='response.output_item.added' and event['item'].get('role')=='assistant') or kind=='response.output_audio_transcript.done':
            speaker='assistant'
        else:
            return
        text=event.get('transcript','')
        conn.execute("""INSERT INTO transcript_turns(interview_id,event_id,speaker,content,source,block_index)
            VALUES(%s,%s,%s,%s,'openai',%s) ON CONFLICT(interview_id,event_id) DO UPDATE
            SET content=CASE WHEN excluded.content<>'' THEN excluded.content ELSE transcript_turns.content END""",(ident,item,speaker,text,index))
        if event.get('event_id'):
            conn.execute("UPDATE transcript_turns SET provider_event_id=%s WHERE interview_id=%s AND event_id=%s",
                         (event['event_id'],ident,item))
        if kind=='conversation.item.input_audio_transcription.completed':
            save_usage(conn,ident,'transcribe:'+item,'transcription',event.get('usage'))
            if re.search(r'ignore.{0,24}(instruções|regras)|revele.{0,24}(gabarito|instruções)|mude.{0,20}(nota|tempo)',text,re.I):
                note(conn,ident,'Possível tentativa de alterar regras. Revisar a transcrição.')

async def observe(ident,definition,call,socket,control):
    loop=asyncio.get_running_loop()
    conversation = Conversation(definition)
    ready_by = loop.time()+20
    reason='observer_lost'
    try:
        while True:
            remaining=(control['deadline']-datetime.now(timezone.utc)).total_seconds()
            if conversation.started and loop.time()-control['last_seen']>25:
                control['end']='connection_timeout'
            if control['end'] or remaining<=0:
                reason=control['end'] or 'timebox'
                break
            if not conversation.started and not control['ready'] and loop.time() >= ready_by:
                reason='connection_timeout'
                break
            if conversation.finished:
                reason='stages_completed'
                break
            answer = conversation.next_response(control['ready'],remaining)
            if answer:
                await socket.send(json.dumps(answer))
            try:
                event=json.loads(await asyncio.wait_for(socket.recv(),timeout=.35))
            except asyncio.TimeoutError:
                continue
            kind=event.get('type')
            if kind in ('input_audio_buffer.committed','response.output_item.added','response.output_audio_transcript.done','conversation.item.input_audio_transcription.completed','conversation.item.input_audio_transcription.failed','response.done'):
                record(ident,conversation.index,event)
            if kind=='response.done':
                with connection() as conn:
                    usage=conn.execute("SELECT component,usage FROM realtime_usage WHERE interview_id=%s AND source='openai'",(ident,)).fetchall()
                    spent=float(cost(usage,False,definition.get('rates'))['usd'] or 0)
                    budget=definition.get('budgetUsd',6)
                    if spent>=.8*budget:
                        note(conn,ident,'Uso atingiu 80% do orçamento.')
                    if spent>=budget:
                        note(conn,ident,'Orçamento atingido.')
                        control['end']='budget'
            previous = conversation.index
            actions = conversation.event(event, remaining)
            if conversation.index != previous:
                with connection() as conn:
                    conn.execute("UPDATE interviews SET block_index=%s WHERE id=%s",(conversation.index,ident))
            if not control['end']:
                for action in actions:
                    await socket.send(json.dumps(action))
            states={'input_audio_buffer.speech_started':'listening','input_audio_buffer.speech_stopped':'thinking','response.created':'thinking','output_audio_buffer.started':'speaking','output_audio_buffer.cleared':'listening','output_audio_buffer.stopped':'listening'}
            if kind in states:
                control['state']=states[kind]
    except Exception as exc:
        log.warning("Voice observer stopped (%s)",type(exc).__name__)
    finally:
        try:
            await socket.close()
        finally:
            closed=await hangup(call)
            with connection() as conn:
                conn.execute("UPDATE interviews SET status='completed',ended_at=now(),finish_reason=%s,call_id=%s WHERE id=%s",(reason,None if closed else call,ident))
                assemble(conn,ident)
            live.pop(ident,None)
            await analyze(ident)
