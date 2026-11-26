import json
import os
from decimal import Decimal, InvalidOperation

# USD per million tokens, by modality. Each report stores the applied card.
CARD = {
    "version":"2026-11-25", "voice":{"model":"gpt-realtime","text":4,"audio":32,"cached_text":0.4,"cached_audio":0.4,"out_text":16,"out_audio":64},
    "transcription":{"model":"gpt-4o-mini-transcribe","text":1.25,"audio":1.25,"out_text":5},
    "analysis":{"model":"gpt-4.1-mini","text":0.4,"cached_text":0.1,"out_text":1.6},
}

def card():
    return json.loads(os.environ.get("BRAARENA_RATES") or json.dumps(CARD))

def token_count(value):
    if type(value) is not int or value < 0:
        raise ValueError("missing token breakdown")
    return value

def amounts(kind, usage):
    inp, out = token_count(usage['input_tokens']), token_count(usage['output_tokens'])
    if kind == 'analysis':
        cached = token_count(usage['input_tokens_details']['cached_tokens'])
        if cached > inp:
            raise ValueError("invalid cached tokens")
        return {'text':inp-cached,'cached_text':cached,'out_text':out}
    detail = usage['input_token_details']
    audio = token_count(detail['audio_tokens'])
    text = token_count(detail['text_tokens'])
    if text + audio != inp:
        raise ValueError("missing input details")
    if kind == 'transcription':
        return {'text':text,'audio':audio,'out_text':out}
    cached = token_count(detail['cached_tokens'])
    parts = detail.get('cached_tokens_details') or ({} if cached else {'text_tokens':0,'audio_tokens':0})
    ct, ca = token_count(parts['text_tokens']), token_count(parts['audio_tokens'])
    outputs = usage['output_token_details']
    ot, oa = token_count(outputs['text_tokens']), token_count(outputs['audio_tokens'])
    if ct+ca != cached or ct>text or ca>audio or ot+oa != out:
        raise ValueError("inconsistent token breakdown")
    return {'text':text-ct,'audio':audio-ca,'cached_text':ct,'cached_audio':ca,'out_text':ot,'out_audio':oa}

def cost(events, complete, rates=None):
    rates = rates or card()
    components = {}
    total = Decimal(0)
    for kind in ('voice','transcription','analysis'):
        subtotal = Decimal(0)
        tokens = {}
        selected = [event for event in events if event['component']==kind]
        valid = True
        for event in selected:
            try:
                event_cost = Decimal(0)
                usage_counts = amounts(kind,event['usage'])
                for key, count in usage_counts.items():
                    rate = Decimal(str(rates[kind][key]))
                    if not rate.is_finite() or rate < 0:
                        raise ValueError("invalid rate")
                    event_cost += count * rate / 1000000
                subtotal += event_cost
                for key,count in usage_counts.items():
                    tokens[key] = tokens.get(key,0) + count
            except (KeyError, TypeError, ValueError, InvalidOperation):
                valid = False
        total += subtotal
        components[kind] = {'usd':format(subtotal,'.6f') if valid and selected else None,'tokens':tokens,'events':len(selected),'knownUsd':format(subtotal,'.6f') if selected else None}
    known = total>0 or any(c['usd'] is not None for c in components.values())
    complete = complete and all(c['usd'] is not None for c in components.values())
    fx = os.environ.get('BRL_PER_USD')
    return {'status':'consolidated_usage' if complete else 'incomplete_estimate',
            'usd':format(total,'.6f') if known else None,'brlIndicative':format(total*Decimal(fx),'.2f') if known and fx else None,
            'brlPerUsd':fx,'components':components,'rateCard':rates,'billedUsd':None}
    return {'status':'consolidated' if complete else 'estimated' if known else 'missing_usage',
            'usd':format(total,'.6f') if known else None,'components':components,'rates':rates,'billedUsd':None}
