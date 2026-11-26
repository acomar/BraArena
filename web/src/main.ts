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
  template: `<main>
    <h1>BraArena</h1><p>POC de entrevistas técnicas com IA</p>
    <section>
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
    <section>
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
    <section><h2>Entrevista por voz</h2><p>A sala do candidato e a integração OpenAI Realtime ainda não estão disponíveis. Os links gerados não devem ser enviados para entrevistas reais.</p></section>
  </main>`
})
class App {
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
        this.linkMessage='Link gerado. A sala do candidato ainda não está implementada.';
      },
      error: () => this.linkMessage='Não foi possível gerar o link.'
    });
  }
}
bootstrapApplication(App, {providers:[provideHttpClient(withFetch())]});
