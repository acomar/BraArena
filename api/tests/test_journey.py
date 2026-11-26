import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.store import connection,digest
from app.voice import record
from app.reports import assemble

class Journey(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx=TestClient(app)
        cls.client=cls.ctx.__enter__()
        cls.admin={'Authorization':'Bearer '+os.environ['ADMIN_TOKEN']}
    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None,None,None)

    def invite(self):
        body={'title':'Sessão técnica','durationMinutes':1,'recordingEnabled':True,
              'blocks':[{'type':'question','prompt':'Questão de teste','expectedAnswer':'private123','drivers':['driver123'],'timeboxSeconds':10}]}
        model=self.client.post('/api/templates',json=body,headers=self.admin).json()['id']
        link=self.client.post('/api/interviews',json={'templateId':model,'candidateName':'Teste sintético'},headers=self.admin).json()
        return model,body,link

    def test_invite_is_private_and_immutable(self):
        model,body,link=self.invite()
        body['title']='Editado'
        self.assertEqual(self.client.put('/api/templates/'+model,json=body,headers=self.admin).status_code,200)
        path='/api/candidate/'+link['id']
        r=self.client.post(path+'/info',json={'token':link['token']})
        self.assertEqual(r.json()['title'],'Sessão técnica')
        self.assertNotIn('private123',r.text)
        self.assertNotIn('driver123',r.text)
        self.assertEqual(self.client.get('/api/templates').status_code,401)
        self.assertEqual(self.client.post(path+'/events',json={}).status_code,404)
        with connection() as conn:
            conn.execute("UPDATE interviews SET expires_at=now() WHERE id=%s",(link['id'],))
        self.assertEqual(self.client.post(path+'/info',json={'token':link['token']}).status_code,404)

    def test_parallel_calls_and_recording_consent(self):
        from app import voice
        import httpx,json
        from unittest.mock import AsyncMock
        for consent in (False,True):
            _,_,link=self.invite()
            path='/api/candidate/'+link['id']
            sdp='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
            payload={'token':link['token'],'transcriptConsent':True,'recordingConsent':consent,'sdp':sdp}
            self.assertEqual(self.client.post(path+'/session',json={**payload,'transcriptConsent':False}).status_code,422)
            class Socket:
                async def recv(self):
                    import asyncio
                    await asyncio.sleep(10)
                async def send(self,event):
                    pass
                async def close(self):
                    pass
            reply=httpx.Response(201,request=httpx.Request('POST','https://example.invalid'),headers={'location':'/v1/realtime/calls/rtc_test'},text=sdp)
            with patch.dict(os.environ,OPENAI_API_KEY='synthetic'),patch.object(httpx.AsyncClient,'post',new=AsyncMock(return_value=reply)),patch.object(voice,'connect',new=AsyncMock(return_value=Socket())):
                with ThreadPoolExecutor(max_workers=2) as pool:
                    results=list(pool.map(lambda _:self.client.post(path+'/session',json=payload),range(2)))
                self.assertEqual(sorted(r.status_code for r in results),[200,409])
                token=next(r.json()['sessionToken'] for r in results if r.is_success)
                self.assertEqual(self.client.post(path+'/finish',json={'token':link['token']}).status_code,404)
                audio=self.client.put(path+'/recording',headers={'Authorization':'Bearer '+token,'Content-Type':'audio/webm'},content=bytes.fromhex('1a45dfa3')+b'fixture')
                self.assertEqual(audio.status_code,200 if consent else 403)
                self.client.post(path+'/finish',json={'token':token}).raise_for_status()
                import time
                for _ in range(35):
                    if self.client.get('/api/interviews/'+link['id']+'/report',headers=self.admin).is_success:
                        break
                    time.sleep(.1)
                data=self.client.get('/api/interviews/'+link['id']+'/report',headers=self.admin).json()
                self.assertTrue(data['report']['transcriptIncomplete'])
                self.assertEqual(data['recording'],consent)

    def test_event_order_dedup_and_isolation(self):
        links=[self.invite()[2] for _ in range(2)]
        for link in links:
            ident=UUID(link['id'])
            record(ident,0,{'type':'input_audio_buffer.committed','item_id':'turn1'})
            for _ in range(2):
                record(ident,0,{'type':'conversation.item.input_audio_transcription.completed','item_id':'turn1','transcript':link['id'],'usage':{'input_tokens':4,'output_tokens':2,'input_token_details':{'audio_tokens':4,'text_tokens':0}}})
            with connection() as conn:
                report=assemble(conn,ident)
            self.assertEqual([t['content'] for t in report['turns']],[link['id']])
            self.assertEqual(report['cost']['components']['transcription']['usd'],'0.000022')
