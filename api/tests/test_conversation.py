import unittest
from app.conversation import Conversation, TURN_DETECTION, RESUME_WINDOW_SECONDS
from app.script import script_blocks

class NaturalTurns(unittest.TestCase):
    def setUp(self):
        blocks = script_blocks('Etapa 1 · Apresentação\nApresente-se.\nEtapa 2 · Situação\nQual sua decisão?\nEtapa 3 · Encerramento\nAgradeça.',10)
        self.now = 0.0
        self.c = Conversation({'blocks':blocks}, clock=lambda:self.now)
        self.assertEqual(len(blocks),3)
        self.assertFalse(any('timeboxSeconds' in b for b in blocks))
        self.assertEqual(TURN_DETECTION,dict(type='semantic_vad',eagerness='low',create_response=False,interrupt_response=True))
        self.assertEqual(self.c.next_response(True,600)['type'],'response.create')
        self.done()

    def event(self,kind,**data):
        return self.c.event({'type':kind,**data},200)

    def done(self,items=None,status='completed'):
        return self.event('response.done',response={'id':'r','status':status,'output':items or []})

    def answer(self,item='a',remaining=500):
        self.event('input_audio_buffer.speech_started',item_id=item)
        self.event('input_audio_buffer.committed',item_id=item)
        self.now += RESUME_WINDOW_SECONDS
        return self.c.next_response(True,remaining)

    def advance(self):
        return self.done([dict(type='function_call',status='completed',name='proxima_etapa',call_id='call')])

    def test_respects_pause_even_at_end_and_waits_for_commit(self):
        self.event('input_audio_buffer.speech_started',item_id='a')
        self.event('input_audio_buffer.speech_stopped',item_id='a')
        for remaining in [480,300,25,5]:
            self.assertIsNone(self.c.next_response(True,remaining))
        self.event('input_audio_buffer.committed',item_id='a')
        self.now += RESUME_WINDOW_SECONDS
        self.assertTrue(self.c.next_response(True,5))
        self.assertTrue(self.c.is_closing_stage())
        self.assertTrue(self.c.closing)

    def test_follow_up_then_progress_then_wait_for_farewell_playback(self):
        self.answer()
        self.done()
        self.assertEqual(self.c.index,0)
        self.answer('b')
        actions=self.advance()
        self.assertEqual(self.c.index,1)
        self.assertEqual([a['type'] for a in actions],['conversation.item.create','response.create'])
        self.assertEqual(actions[-1]['response']['tools'],[])
        self.done()
        self.answer('c')
        self.advance()
        self.assertEqual(self.c.index,2)
        self.done([dict(type='message',content=[{'type':'output_audio'}])])
        self.assertFalse(self.c.finished)
        self.event('output_audio_buffer.stopped',response_id='r')
        self.assertTrue(self.c.finished)

    def test_short_pause_between_committed_clauses_is_one_reply(self):
        self.event('input_audio_buffer.speech_started',item_id='a')
        self.event('input_audio_buffer.committed',item_id='a')
        self.now += 1.4
        self.assertIsNone(self.c.next_response(True,200))
        self.event('input_audio_buffer.speech_started',item_id='b')
        self.now += 4
        self.assertIsNone(self.c.next_response(True,200))
        self.event('input_audio_buffer.committed',item_id='b')
        self.now += RESUME_WINDOW_SECONDS
        self.assertTrue(self.c.next_response(True,200))
        self.assertIsNone(self.c.next_response(True,200))

    def test_resumed_speech_invalidates_previous_advance(self):
        self.answer()
        self.event('input_audio_buffer.speech_started',item_id='b')
        actions=self.advance()
        self.assertEqual(self.c.index,0)
        self.assertEqual([a['type'] for a in actions],['conversation.item.create'])
        self.assertIsNone(self.c.next_response(True,100))
        self.event('input_audio_buffer.committed',item_id='b')
        self.now += RESUME_WINDOW_SECONDS
        self.assertTrue(self.c.next_response(True,100))
        self.assertIsNone(self.c.next_response(True,100))

    def test_interruption_during_farewell_waits_for_next_turn(self):
        self.answer(remaining=12)
        self.done([dict(type='message',content=[{'type':'audio'}])])
        self.event('input_audio_buffer.speech_started',item_id='b')
        self.event('output_audio_buffer.stopped',response_id='r')
        self.assertFalse(self.c.finished)
