"""Translate the manager's plain text into the interview engine's existing stages."""
import re

STAGES = {'Apresentação': 'intro', 'Pergunta': 'question', 'Situação': 'situation', 'Encerramento': 'closing'}
HEADER = re.compile(r'^Etapa \d+ · (Apresentação|Pergunta|Situação|Encerramento) \((\d{1,5}) s\)[ \t]*$', re.MULTILINE)
PRIVATE = re.compile(r'^[ \t]*Avaliação privada:[ \t]*', re.MULTILINE | re.IGNORECASE)


def stage(text, kind, seconds):
    if not 1 <= seconds <= 10800:
        raise ValueError('A duração de cada etapa deve estar entre 1 e 10.800 segundos.')
    parts = PRIVATE.split(text, maxsplit=1)
    prompt = parts[0].strip()
    if not prompt:
        raise ValueError('Escreva as instruções da entrevista antes da avaliação privada.')
    notes, drivers = [], []
    if len(parts) == 2:
        for line in parts[1].strip().splitlines():
            if line.startswith('Critério: '):
                drivers.append(line.removeprefix('Critério: ').strip())
            else:
                notes.append(line)
    return dict(type=kind, prompt=prompt, timeboxSeconds=seconds,
                drivers=drivers, expectedAnswer='\n'.join(notes).strip() or None)


def script_blocks(script, duration_minutes):
    script = script.replace('\r\n', '\n').strip()
    headers = list(HEADER.finditer(script))
    stages = []
    if not headers:
        return [stage(script, 'question', duration_minutes * 60)]
    # Preamble is a manager instruction attached to the first stage.
    preamble = script[:headers[0].start()].strip()
    for index, header in enumerate(headers):
        end = headers[index+1].start() if index+1 < len(headers) else len(script)
        text = script[header.end():end].strip()
        if index == 0 and preamble:
            text = preamble + '\n\n' + text
        stages.append(stage(text, STAGES[header[1]], int(header[2])))
    return stages


def legacy_script(definition):
    names = {kind:name for name,kind in STAGES.items()}
    sections = []
    for index, block in enumerate(definition['blocks'], 1):
        lines = [f"Etapa {index} · {names[block['type']]} ({block['timeboxSeconds']} s)", block['prompt']]
        if block.get('expectedAnswer') or block.get('drivers'):
            lines.append('Avaliação privada:')
            if block.get('expectedAnswer'):
                lines.append(block['expectedAnswer'])
            lines.extend('Critério: '+driver for driver in block.get('drivers', []))
        sections.append('\n'.join(lines))
    return '\n\n'.join(sections)
