import 'zone.js';
import {Component,ChangeDetectorRef,inject} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Candidate} from './candidate';
import {request,errorMessage} from './http';

interface Guard {name:string;version:number;instruction?:string}
function blank(){return {title:'',script:'',durationMinutes:30,recordingEnabled:false,budgetUsd:6,guardrails:[] as Guard[]};}
type Editor = ReturnType<typeof blank>;
interface Model {
  id:string; title:string; legacyScript?:string;
  definition: Omit<Editor,'script'> & {script?:string;blocks:unknown[]};
}
@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule,Candidate],templateUrl:'./admin.html'})
class App{
  private view=inject(ChangeDetectorRef);
  room=location.pathname.startsWith('/interview/');token='';logged=false;busy=false;message='';tab='Modelos';
  tabs=['Modelos','Convites','Histórico','Guardrails','Custos']; models:Model[]=[];guards:Guard[]=[];
  rows:any[]=[];model=blank();editId='';selected='';name='';context='';validity=168;link='';guardName='';instruction='';
  source?:Model; editorError='';
  detail:any=null;detailId='';audioUrl='';spend:any=null;
  start=new Date(Date.now()-30*86400000).toISOString().slice(0,10); end=new Date().toISOString().slice(0,10);
  status:Record<string,string>={scheduled:'Agendada',in_progress:'Em andamento',connecting:'Conectando',completed:'Concluída',expired:'Expirada',interrupted:'Interrompida'};
  async run(fn:()=>Promise<void>){if(this.busy)return;this.busy=true;this.message='';try{await fn();}catch(e){this.message=errorMessage(e);}finally{this.busy=false;this.view.markForCheck();}}
  api(path:string,method='GET',body?:unknown){return request('/api/'+path,method,body,this.token);}
  async refresh(){[this.models,this.guards,this.rows]=await Promise.all([this.api('templates'),this.api('guardrails'),this.api('interviews')]);}
  login(){void this.run(async()=>{await this.refresh();this.logged=true;});}
  selectTab(t:string){this.tab=t;this.message='';if(t==='Histórico')void this.run(()=>this.refresh());if(t==='Custos')this.total();}
  newModel(){this.model=blank();this.source=undefined;this.editId='';this.message='';this.editorError='';}
  edit(m:Model,copy=false){
    this.source=m;
    const d=m.definition;
    this.model={...blank(),title:copy ? Array.from(m.title).slice(0,152).join('')+' (cópia)' : m.title,
      script:d.script ?? m.legacyScript ?? '', durationMinutes:d.durationMinutes,
      budgetUsd:d.budgetUsd??6, recordingEnabled:d.recordingEnabled??false, guardrails:structuredClone(d.guardrails??[])};
    this.editId=copy?'':m.id;this.message='';this.editorError='';
  }
  get scriptLength(){return Array.from(this.model.script).length;}
  get originalStages(){return this.source?.legacyScript===this.model.script ? this.source.definition.blocks : undefined;}
  hasGuard(g:Guard){return this.model.guardrails.some(x=>x.name===g.name && x.version===g.version);}
  toggle(g:Guard){if(this.hasGuard(g))this.model.guardrails=this.model.guardrails.filter(x=>!(x.name===g.name&&x.version===g.version));else this.model.guardrails.push({name:g.name,version:g.version});}
  save(){
    this.editorError='';
    const {script,...options}=this.model;
    if(!script.trim()){this.editorError='Escreva as instruções da entrevista.';return;}
    const blocks=this.originalStages;
    if(this.scriptLength>10000 && !blocks){this.editorError='Reduza as instruções para até 10.000 caracteres.';return;}
    if(!Number.isInteger(options.durationMinutes) || options.durationMinutes<1 || options.durationMinutes>180){
      this.editorError='A duração deve estar entre 1 e 180 minutos.';return;
    }
    if(!(options.budgetUsd>0 && options.budgetUsd<=10000)){this.editorError='Informe um orçamento entre 0,01 e 10.000 USD.';return;}
    void this.run(async()=>{
      try {
        const payload=blocks ? {...options,blocks} : {...options,script};
        const saved:Model=await this.api('templates'+(this.editId?'/'+this.editId:''),this.editId?'PUT':'POST',payload);
        const existing=this.models.some(model=>model.id===saved.id);
        this.models=existing ? this.models.map(model=>model.id===saved.id?saved:model) : [saved,...this.models];
        this.source=saved;
        this.model.title=saved.title;
        this.editId=this.selected=saved.id;
        this.message='Modelo salvo.';
      } catch(e){this.editorError=errorMessage(e);}
    });
  }
  invite(){this.link='';void this.run(async()=>{const r=await this.api('interviews','POST',{templateId:this.selected,candidateName:this.name,candidateContext:this.context,validityHours:this.validity});
    this.link=location.origin+'/interview/'+r.id+'#token='+r.token;await this.refresh();this.message='Convite gerado.';});}
  guard(){void this.run(async()=>{await this.api('guardrails','POST',{name:this.guardName,instruction:this.instruction});await this.refresh();this.message='Versão salva.';});}
  clearAudio(){if(this.audioUrl)URL.revokeObjectURL(this.audioUrl);this.audioUrl='';}
  open(id:string){void this.run(async()=>{this.clearAudio();this.detail=null;this.detail=await this.api('interviews/'+id+'/report');this.detailId=id;});}
  reloadEvaluation(retry=false){void this.run(async()=>{
    if(retry)await this.api('interviews/'+this.detailId+'/evaluation','POST');
    const detail=await this.api('interviews/'+this.detailId+'/report');
    this.detail.report=detail.report;
  });}
  review(){void this.run(async()=>{await this.api('interviews/'+this.detailId+'/review','PUT',{note:this.detail.review||''});this.message='Revisão salva.';});}
  play(){void this.run(async()=>{const r=await fetch('/api/interviews/'+this.detailId+'/recording',{headers:{Authorization:'Bearer '+this.token}});if(!r.ok)throw new Error('Gravação indisponível.');this.clearAudio();this.audioUrl=URL.createObjectURL(await r.blob());});}
  erase(){if(!confirm('Excluir permanentemente esta gravação?'))return;void this.run(async()=>{await this.api('interviews/'+this.detailId+'/recording','DELETE');this.detail.recording=false;this.clearAudio();});}
  download(){const url=URL.createObjectURL(new Blob([JSON.stringify(this.detail,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='entrevista-'+this.detailId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  total(){void this.run(async()=>{this.spend=await this.api('spend?start='+this.start+'&end='+this.end);});}
  logout(){location.reload();}
}
bootstrapApplication(App);
