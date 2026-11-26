import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient, withFetch } from '@angular/common/http';

type BlockType = 'intro' | 'question' | 'closing';
interface EditorBlock {
  type: BlockType;
  prompt: string;
  expectedAnswer: string;
  driversText: string;
  timeboxSeconds: number;
}
interface TemplateItem { id: string; title: string; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
.robot-stage{display:grid;place-items:center;gap:16px;padding:32px 12px;color:#17324d}.robot{width:clamp(150px,45vw,230px);aspect-ratio:1;border-radius:50%;position:relative;background:radial-gradient(circle at 30% 22%,#bceaff,#358bd9 42%,#163b80 85%);box-shadow:0 12px 36px #174b8640,inset 0 0 18px #ffffff55;display:grid;place-items:center;transition:box-shadow .2s}.robot[data-state=listening]{box-shadow:0 0 0 9px #36b9a32b,0 12px 36px #174b8640}.robot[data-state=speaking]{box-shadow:0 0 0 9px #358bd92b,0 12px 36px #174b8640}.face{width:72%;height:48%;border-radius:40%;background:#102747;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16%;box-shadow:inset 0 0 12px #0008}.eyes{display:flex;gap:24px}.eye{width:18px;height:24px;border-radius:50%;background:#bdfaff;box-shadow:0 0 10px #74edff;animation:blink 5s infinite}.mouth{width:32px;min-height:5px;border-radius:20px;background:#bdfaff;transition:height .08s linear}.robot[data-state=thinking] .eye{animation:blink 1.5s infinite}@keyframes blink{0%,45%,49%,100%{transform:scaleY(1)}47%{transform:scaleY(.1)}}@media(prefers-reduced-motion:reduce){.eye{animation:none!important}.mouth,.robot{transition:none}}
  `],
  template: `<main>
    <h1>BraArena</h1><p>POC de entrevistas técnicas com IA</p>
    <section *ngIf="!candidateMode">
      <h2>Administração</h2>
      <label>Token administrativo <input type="password" [(ngModel)]="token" autocomplete="off"></label>
      <h2>Configurar modelo de entrevista</h2>
      <label>Título <input [(ngModel)]="title" placeholder="Ex.: Engenheiro Java Sênior"></label>
      <label>Tempo total (minutos) <input type="number" min="5" max="180" [(ngModel)]="durationMinutes"></label>
      <p>Adicione e ordene os blocos. A entrevista de teste será criada por você, sem perguntas fixas no código.</p>
      <div *ngFor="let block of blocks; let i=index" class="editor-block">
        <h3>Bloco {{i+1}}</h3>
        <label>Tipo
          <select [(ngModel)]="block.type">
            <option value="intro">Introdução</option>
            <option value="question">Pergunta ou cenário</option>
            <option value="closing">Encerramento</option>
          </select>
        </label>
        <label>Instrução ou pergunta
          <textarea rows="3" [(ngModel)]="block.prompt"></textarea>
        </label>
        <label *ngIf="block.type==='question'">Resposta esperada (somente para avaliação)
          <textarea rows="2" [(ngModel)]="block.expectedAnswer"></textarea>
        </label>
        <label *ngIf="block.type==='question'">Critérios de avaliação, separados por vírgula
          <input [(ngModel)]="block.driversText" placeholder="Raciocínio, clareza, segurança">
        </label>
        <label>Timebox do bloco (segundos)
          <input type="number" min="1" [(ngModel)]="block.timeboxSeconds">
        </label>
        <div>
          <button (click)="move(i,-1)" [disabled]="i===0">Subir</button>
          <button (click)="move(i,1)" [disabled]="i===blocks.length-1">Descer</button>
          <button (click)="remove(i)" [disabled]="blocks.length===1">Remover</button>
        </div>
      </div>
      <button (click)="add('question')">Adicionar pergunta</button>
      <button (click)="add('intro')">Adicionar introdução</button>
      <button (click)="add('closing')">Adicionar encerramento</button>
      <button (click)="save()">Salvar modelo</button>
      <p role="status">{{message}}</p>
    </section>
    <section *ngIf="!candidateMode">
      <h2>Gerar link de entrevista</h2>
      <button (click)="loadTemplates()">Atualizar modelos</button>
      <label>Modelo
        <select [(ngModel)]="selectedTemplateId">
          <option value="">Selecione um modelo</option>
          <option *ngFor="let t of templates" [value]="t.id">{{t.title}}</option>
        </select>
      </label>
      <label>Nome do candidato <input [(ngModel)]="candidateName"></label>
      <label>Contexto do candidato (opcional) <textarea [(ngModel)]="candidateContext"></textarea></label>
      <button (click)="generateLink()">Gerar link</button>
      <p role="status">{{linkMessage}}</p>
      <p *ngIf="candidateLink"><a [href]="candidateLink">{{candidateLink}}</a></p>
      <p>O link é uma credencial de acesso. Compartilhe apenas com o candidato.</p>
    </section>
    <section *ngIf="candidateMode">
      <h2>Sala de entrevista</h2>
      <div class="robot-stage"><div class="robot" [attr.data-state]="robotState" aria-hidden="true"><div class="face"><div class="eyes"><span class="eye"></span><span class="eye"></span></div><div class="mouth" [style.height.px]="mouthHeight"></div></div></div><span role="status">{{robotLabel}}</span></div>
      <p>A conversa será processada por IA para avaliação técnica.</p>
      <label><input type="checkbox" [(ngModel)]="transcriptConsent"> Aceito a transcrição e avaliação por IA.</label>
      <p>A gravação permanente de áudio ainda não está disponível.</p>
      <button (click)="startVoice()" [disabled]="!transcriptConsent || voiceActive || connecting">Iniciar entrevista</button>
      <button (click)="stopVoice()" [disabled]="!voiceActive">Encerrar</button>
      <p role="status">{{voiceMessage}}</p><audio autoplay></audio>
    </section>
    <section *ngIf="!candidateMode"><h2>Entrevista por voz</h2><p>Abra um link individual para acessar a sala.</p></section>
  </main>`
})
class App {
  candidateMode = window.location.pathname.startsWith('/interview/');
  transcriptConsent = false;
  voiceActive = false;
  connecting = false;
  robotState = 'idle';
  mouthHeight = 5;
  private audioContext: AudioContext | null = null;
  private animationFrame = 0;
  get robotLabel() { return ({idle:'Aguardando início',connecting:'Conectando',listening:'Ouvindo você',thinking:'Preparando resposta',speaking:'Entrevistadora falando'} as Record<string,string>)[this.robotState] || 'Aguardando'; }
  private animateVoice(stream: MediaStream) {
    if (!this.audioContext) return;
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    this.audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
      this.mouthHeight = this.robotState === 'speaking' ? Math.min(32,5+rms*170) : 5;
      this.animationFrame = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.animationFrame); tick();
  }
  voiceMessage = '';
  private eventQueue: Promise<void> = Promise.resolve();
  private telemetryFailed = false;
  private sessionStarted = false;
  private candidateEndpoint(action: string) {
    return '/api/candidate/' + encodeURIComponent(window.location.pathname.split('/')[2]) + '/' + action;
  }
  private enqueueEvent(payload: object) {
    const token = new URLSearchParams(window.location.search).get('token');
    this.eventQueue = this.eventQueue.then(async () => {
      const response = await fetch(this.candidateEndpoint('events'), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,...payload})
      });
      if (!response.ok) throw new Error('Telemetry rejected');
    }).catch(() => { this.telemetryFailed = true; });
  }
  private peer: RTCPeerConnection | null = null;
  private microphone: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  token = '';
  title = '';
  durationMinutes = 30;
  blocks: EditorBlock[] = [this.newBlock('question')];
  templates: TemplateItem[] = [];
  selectedTemplateId = '';
  candidateName = '';
  candidateContext = '';
  candidateLink = '';
  message = '';
  linkMessage = '';

  constructor(private http: HttpClient) {}

  async startVoice() {
    if (!this.transcriptConsent || this.voiceActive || this.connecting) return;
    const id = window.location.pathname.split('/')[2];
    const token = new URLSearchParams(window.location.search).get('token');
    if (!id || !token) { this.voiceMessage = 'Link inválido.'; return; }
    try {
      this.connecting = true;
      this.telemetryFailed = false;
      this.eventQueue = Promise.resolve();
      this.robotState = 'connecting';
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      this.voiceMessage = 'Conectando...';
      const response = await fetch('/api/candidate/' + encodeURIComponent(id) + '/session', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,transcriptConsent:true,recordingConsent:false})
      });
      if (!response.ok) throw new Error('Não foi possível iniciar a sessão.');
      const session = await response.json();
      this.sessionStarted = true;
      this.microphone = await navigator.mediaDevices.getUserMedia({audio:true});
      this.peer = new RTCPeerConnection();
      for (const track of this.microphone.getTracks()) this.peer.addTrack(track, this.microphone);
      this.peer.ontrack = event => {
        const player = document.querySelector('audio') as HTMLAudioElement | null;
        if (player) { player.srcObject = event.streams[0]; void player.play().catch(()=>{this.voiceMessage='Não foi possível reproduzir o áudio.';}); }
        this.animateVoice(event.streams[0]);
      };
      const channel = this.peer.createDataChannel('oai-events');
      channel.onopen = () => {
        this.voiceMessage = 'Entrevista em andamento.';
        this.robotState = 'thinking';
        channel.send(JSON.stringify({type:'response.create'}));
      };
      channel.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          const type = data.type;
          if (type === 'conversation.item.input_audio_transcription.completed' && data.transcript && data.item_id) this.enqueueEvent({kind:'transcript',eventId:'candidate:'+data.item_id+':'+(data.content_index ?? 0),speaker:'candidate',content:data.transcript});
          if (type === 'response.output_audio_transcript.done' && data.transcript && data.item_id) this.enqueueEvent({kind:'transcript',eventId:'assistant:'+data.item_id+':'+(data.content_index ?? 0),speaker:'assistant',content:data.transcript});
          if (type === 'response.done' && data.response?.id && data.response?.usage) this.enqueueEvent({kind:'usage',eventId:data.response.id,usage:data.response.usage});
          if (type === 'error') this.voiceMessage = 'Erro na conversa.';
          if (type === 'input_audio_buffer.speech_started') this.robotState = 'listening';
          if (type === 'input_audio_buffer.speech_stopped' || type === 'response.created') this.robotState = 'thinking';
          if (type === 'output_audio_buffer.started') this.robotState = 'speaking';
          if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') this.robotState = 'listening';
        }
        catch { /* Ignore invalid event. */ }
      };
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method:'POST',
        headers:{Authorization:'Bearer ' + session.clientSecret,'Content-Type':'application/sdp'},
        body:offer.sdp
      });
      if (!answer.ok) throw new Error('Falha na conexão de áudio.');
      await this.peer.setRemoteDescription({type:'answer',sdp:await answer.text()});
      this.voiceActive = true;
      this.connecting = false;
      this.timer = setTimeout(() => this.stopVoice(), Math.max(1, Number(session.durationMinutes))*60000);
    } catch (error) {
      await this.stopVoice();
      this.voiceMessage = error instanceof Error ? error.message : 'Falha na conexão.';
    }
  }
  async stopVoice() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.peer?.close(); this.peer = null;
    this.microphone?.getTracks().forEach(track => track.stop()); this.microphone = null;
    this.voiceActive = false;
    this.connecting = false;
    cancelAnimationFrame(this.animationFrame);
    if (this.audioContext) void this.audioContext.close();
    this.audioContext = null;
    this.robotState = 'idle'; this.mouthHeight = 5;
    if (!this.sessionStarted) return;
    this.sessionStarted = false;
    this.connecting = true;
    this.voiceMessage = 'Salvando entrevista...';
    try {
      await this.eventQueue;
      const token = new URLSearchParams(window.location.search).get('token');
      const response = await fetch(this.candidateEndpoint('finish'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      if (!response.ok) throw new Error('Falha ao finalizar');
      this.voiceMessage = this.telemetryFailed ? 'Entrevista encerrada com dados incompletos.' : 'Entrevista encerrada. Dados preliminares enviados.';
    } catch { this.voiceMessage = 'Falha ao salvar o encerramento.'; }
    finally { this.connecting = false; }
  }


  newBlock(type: BlockType): EditorBlock {
    return {type, prompt:'', expectedAnswer:'', driversText:'', timeboxSeconds:300};
  }
  add(type: BlockType) { this.blocks.push(this.newBlock(type)); }
  remove(index: number) { this.blocks.splice(index, 1); }
  move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= this.blocks.length) return;
    [this.blocks[index], this.blocks[target]] = [this.blocks[target], this.blocks[index]];
  }
  headers() { return {Authorization: 'Bearer ' + this.token}; }
  save() {
    if (!this.title.trim() || !Number.isInteger(this.durationMinutes) ||
        this.durationMinutes < 5 || this.durationMinutes > 180 ||
        this.blocks.some(b => !b.prompt.trim() || !Number.isInteger(b.timeboxSeconds) || b.timeboxSeconds < 1)) {
      this.message = 'Preencha título, tempo e instruções válidos para todos os blocos.';
      return;
    }
    this.http.post<{id:string}>('/api/templates', {
      title: this.title.trim(),
      durationMinutes: this.durationMinutes,
      blocks: this.blocks.map(b => ({
        type: b.type, prompt: b.prompt.trim(),
        expectedAnswer: b.type === 'question' ? b.expectedAnswer : null,
        drivers: b.type === 'question' ? b.driversText.split(',').map(x => x.trim()).filter(Boolean) : [],
        timeboxSeconds: b.timeboxSeconds
      }))
    }, {headers:this.headers()}).subscribe({
      next: r => { this.message='Modelo criado.'; this.selectedTemplateId=r.id; this.loadTemplates(); },
      error: () => this.message='Não foi possível criar o modelo. Verifique API e credenciais.'
    });
  }
  loadTemplates() {
    this.http.get<TemplateItem[]>('/api/templates', {headers:this.headers()}).subscribe({
      next: rows => { this.templates=rows; },
      error: () => this.linkMessage='Não foi possível carregar modelos.'
    });
  }
  generateLink() {
    if (!this.selectedTemplateId || !this.candidateName.trim()) {
      this.linkMessage='Selecione um modelo e informe o nome do candidato.';
      return;
    }
    this.candidateLink='';
    this.http.post<{id:string;token:string}>('/api/interviews', {
      templateId:this.selectedTemplateId, candidateName:this.candidateName.trim(),
      candidateContext:this.candidateContext
    }, {headers:this.headers()}).subscribe({
      next: r => {
        this.candidateLink=window.location.origin + '/interview/' + encodeURIComponent(r.id) + '?token=' + encodeURIComponent(r.token);
        this.linkMessage='Link gerado para teste técnico. Não enviar a candidatos reais antes da validação de segurança e privacidade.';
      },
      error: () => this.linkMessage='Não foi possível gerar o link.'
    });
  }
}
bootstrapApplication(App, {providers:[provideHttpClient(withFetch())]});
