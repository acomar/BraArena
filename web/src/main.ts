import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient, withFetch } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  template: `<main><h1>BraArena</h1><p>POC de entrevistas com IA</p>
  <section><h2>Administrador</h2>
    <label>Token administrativo <input type="password" [(ngModel)]="token"></label>
    <h3>Novo modelo</h3>
    <input placeholder="Título da entrevista" [(ngModel)]="title">
    <textarea rows="5" style="width:100%" [(ngModel)]="prompt" placeholder="Pergunta ou situação"></textarea>
    <button (click)="save()">Criar modelo</button>
    <p>{{message}}</p>
  </section>
  <section><h2>Entrevista por voz</h2><p>Integração em desenvolvimento. Não disponível nesta versão.</p></section>
  </main>`
})
class App {
  token = ''; title = ''; prompt = ''; message = '';
  constructor(private http: HttpClient) {}
  save() {
    this.http.post('/api/templates', {
      title: this.title, durationMinutes: 30,
      blocks: [{type:'question',prompt:this.prompt,drivers:['clareza','raciocínio'],timeboxSeconds:300}]
    }, {headers:{Authorization:'Bearer '+this.token}}).subscribe({
      next: () => this.message='Modelo criado.',
      error: () => this.message='Falha ao criar modelo. Verifique API e credenciais.'
    });
  }
}
bootstrapApplication(App, {providers:[provideHttpClient(withFetch())]});
