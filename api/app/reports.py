import json
import re
from decimal import Decimal
import httpx
import os
from .billing import cost, card
from .evaluation import Assessment, GUIDANCE, evaluate, rubric
from .store import connection

def save_usage(conn, ident, event_id, component, usage):
    conn.execute("""INSERT INTO realtime_usage(interview_id,response_id,source,component,usage)
        VALUES (%s,%s,'openai',%s,%s::jsonb) ON CONFLICT DO NOTHING""",
        (ident,event_id,component,json.dumps(usage or {})))


def transcript(conn, ident):
    rows = conn.execute("""SELECT speaker,content,event_id,provider_event_id,created_at,block_index,source,start_ms,end_ms
        FROM transcript_turns WHERE interview_id=%s ORDER BY created_at,id""",(ident,)).fetchall()
    turns = []
    for row in rows:
        last = turns[-1] if turns else None
        if (row['start_ms'] is not None and last and last['end_ms'] is not None
                and last['speaker']==row['speaker'] and last['block_index']==row['block_index']
                and row['start_ms']-last['end_ms']<=1800):
            last['content'] += row['content']
            last['end_ms'] = max(last['end_ms'],row['end_ms'])
        else:
            turns.append(row)
    return turns


def assemble(conn, ident):
    row = conn.execute("SELECT * FROM interviews WHERE id=%s FOR UPDATE",(ident,)).fetchone()
    turns = transcript(conn,ident)
    if any(t['speaker']=='candidate' and t['start_ms'] is not None and
           re.search(r'ignore.{0,24}(instruções|regras)|revele.{0,24}(gabarito|instruções)|mude.{0,20}(nota|tempo)',t['content'],re.I)
           for t in turns):
        label='Possível tentativa de alterar regras. Revisar a transcrição.'
        if label not in row['notices']:
            row['notices'].append(label)
            conn.execute("UPDATE interviews SET notices=%s WHERE id=%s",(row['notices'],ident))
    events = conn.execute("SELECT component,usage FROM realtime_usage WHERE interview_id=%s AND source='openai'",(ident,)).fetchall()
    existing = conn.execute("SELECT report FROM interview_reports WHERE interview_id=%s",(ident,)).fetchone()
    old = existing['report'] if existing else {}
    groups = []
    for index,block in enumerate(row['definition']['blocks']):
        answers = [t['event_id'] for t in turns if t['block_index']==index and t['speaker']=='candidate' and t['source']=='openai' and t['content']]
        groups.append({'prompt':block['prompt'],'drivers':block.get('drivers',[]),'candidateTurns':answers,'answered':bool(answers)})
    rates = row['definition'].get('rates') or card()
    incomplete = (any(not t['content'] or t['source']!='openai' for t in turns)
                  or not turns or row['finish_reason'] in ('observer_lost','restart','connection_timeout'))
    bill = cost(events,not incomplete,rates)
    fx = os.getenv('USD_BRL','')
    if fx and bill['usd'] is not None:
        bill['indicativeBrl'] = str(round(Decimal(bill['usd'])*Decimal(fx),2))
        bill['usdBrlRate'] = fx
        bill['usdBrlDate'] = os.getenv('USD_BRL_DATE')
    report = {'summary':old.get('summary'),'analysisStatus':old.get('analysisStatus','pending'),
              'sections':groups,'transcriptIncomplete':incomplete,'turns':turns,'notices':row['notices'],
              'finishReason':row['finish_reason'],'voiceCost':bill['components']['voice'],
              'cost':bill,'durationSeconds':int((row['ended_at']-row['started_at']).total_seconds()) if row['started_at'] and row['ended_at'] else None}
    if 'evaluation' in old:
        report['evaluation']=old['evaluation']
    conn.execute("""INSERT INTO interview_reports(interview_id,report) VALUES(%s,%s::jsonb)
        ON CONFLICT(interview_id) DO UPDATE SET report=excluded.report,created_at=now()""",(ident,json.dumps(report,default=str)))
    return report


async def analyze(ident):
    with connection() as conn:
        report = assemble(conn,ident)
        definition = conn.execute("SELECT definition FROM interviews WHERE id=%s",(ident,)).fetchone()['definition']
    turns = [t for t in report['turns'] if t['source']=='openai' and t['content']]
    criteria=rubric(definition)
    status, summary, assessment = 'insufficient_evidence', None, None
    if any(t['speaker']=='candidate' for t in turns):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post("https://api.openai.com/v1/responses",headers={'Authorization':'Bearer '+os.environ['OPENAI_API_KEY']},json={
                    'model':definition.get('rates',card())['analysis']['model'],'store':False,'max_output_tokens':min(12000,1200+220*len(criteria)),
                    'instructions':GUIDANCE,
                    'text':{'format':{'type':'json_schema','name':'avaliacao_tecnica','strict':True,
                                      'schema':Assessment.model_json_schema()}},
                    'input':json.dumps({'rubrica':definition['blocks'],'criterios':criteria,'falas':[{'id':f'F{i}','speaker':t['speaker'],'content':t['content'],'block_index':t['block_index']} for i,t in enumerate(turns,1)]},ensure_ascii=False)})
                response.raise_for_status()
                result = response.json()
            with connection() as conn:
                save_usage(conn,ident,result['id'],'analysis',result.get('usage'))
            text=''.join(c['text'] for item in result['output'] for c in item.get('content',[]) if c['type']=='output_text')
            if result.get('status')=='completed' and text:
                assessment=Assessment.model_validate_json(text)
                summary=assessment.summary
                status='ready'
            else:
                status='incomplete'
        except (httpx.HTTPError, KeyError, ValueError):
            status = 'unavailable'
    with connection() as conn:
        report = assemble(conn,ident)
        report.update(summary=summary,analysisStatus=status,evaluation=evaluate(criteria,turns,assessment))
        conn.execute("UPDATE interview_reports SET report=%s::jsonb WHERE interview_id=%s",(json.dumps(report,default=str),ident))
