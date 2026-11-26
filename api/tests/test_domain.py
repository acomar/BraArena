import unittest
from app.voice import validate_offer, stage_prompt
from app.billing import cost, LEGACY_CARD
from fastapi import HTTPException

class Rules(unittest.TestCase):
    def test_audio_only(self):
        offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
        validate_offer(offer)
        with self.assertRaises(HTTPException):
            validate_offer(offer+'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n')

    def test_prompt_contains_only_current_public_stage(self):
        definition = {'blocks':[{'prompt':'first','expectedAnswer':'private123','drivers':['rubric123']},{'prompt':'later123'}]}
        prompt = stage_prompt(definition,0)
        self.assertIn('first',prompt)
        for hidden in ('private123','rubric123','later123'):
            self.assertNotIn(hidden,prompt)

    def test_cost_preserves_missing_usage(self):
        self.assertIsNone(cost([],False)['usd'])

    def test_cached_tokens_and_components(self):
        events=[{'component':'voice','usage':{'input_tokens':100,'output_tokens':20,'input_token_details':{'text_tokens':80,'audio_tokens':20,'cached_tokens':10,'cached_tokens_details':{'text_tokens':6,'audio_tokens':4}},'output_token_details':{'text_tokens':10,'audio_tokens':10}}}]
        result=cost(events,False,LEGACY_CARD)
        self.assertEqual(result['components']['voice']['usd'],'0.001612')
        self.assertNotEqual(result['status'],'billed')
