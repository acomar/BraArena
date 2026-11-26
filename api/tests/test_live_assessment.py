import unittest

from app.billing import CARD, cost
from app.evaluation import Assessment, evaluate, rubric
from app.live_voice import config


class LiveAssessment(unittest.TestCase):
    def setUp(self):
        self.definition={'blocks':[{'type':'question','prompt':'Explore a decisão.',
                          'drivers':['Priorização'],'expectedAnswer':'referência privada'}]}
        self.turn={'speaker':'candidate','source':'openai','event_id':'turno','block_index':0,
                   'content':'Eu começaria pela fila de pedidos.'}

    def test_bossa_config_keeps_rubric_private(self):
        session=config(self.definition,CARD)
        self.assertEqual((session['model'],session['audio']['output']['voice']),('gpt-live-1.1','bossa'))
        self.assertEqual(session['delegation'],{'type':'client'})
        self.assertFalse(session['store'])
        for text in ('referência privada','Priorização'):
            self.assertNotIn(text,str(session))

    def test_duration_cost_and_included_transcription(self):
        events=[{'component':'voice','usage':{'seconds':25}},
                {'component':'voice','usage':{'seconds':60,'final':True}}]
        result=cost(events,True,CARD)
        self.assertEqual(result['components']['voice']['usd'],'0.050000')
        self.assertEqual(result['components']['transcription']['includedIn'],'voice')
        self.assertIsNone(result['billedUsd'])

    def test_score_requires_exact_candidate_evidence_from_that_case(self):
        rules=rubric(self.definition)
        for change,ref in [({},'referência inventada'),({'speaker':'assistant'},'F1'),({'block_index':1},'F1')]:
            output=Assessment.model_validate({'summary':'Resumo','opinion':'Parecer','criteria':[
                {'criterion':'1.1','score':4,'reason':'Justificativa','evidence':[ref]}]})
            item=evaluate(rules,[{**self.turn,**change}],output)['criteria'][0]
            self.assertIsNone(item['score'])
            self.assertEqual(item['evidence'],[])
        self.assertIsNone(evaluate(rules,[])['criteria'][0]['score'])
