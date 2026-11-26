import 'zone.js';
import {Component} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Candidate} from './candidate';
import {request,errorMessage} from './http';

interface Guard {name:string;version:number;instruction?:string}
interface Block {type:string;prompt:string;expectedAnswer:string;drivers:string[];timeboxSeconds:number}
function block():Block {return {type:'question',prompt:'',expectedAnswer:'',drivers:[],timeboxSeconds:180};}
function blank(){return {title:'',durationMinutes:30,recordingEnabled:false,budgetUsd:6,blocks:[block()],guardrails:[] as Guard[]};}
interface Model {id:string;title:string;definition:ReturnType<typeof blank>}
@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule,Candidate],templateUrl:'./admin.html'})
class App{
  room=location.pathname.startsWith('/interview/');token='';logged=false;busy=false;message='';tab='Modelos';
  tabs=['Modelos','Convites','Histórico','Guardrails','Custos']; models:Model[]=[];guards:Guard[]=[];
  rows:any[]=[];model=blank();editId='';selected='';name='';context='';validity=168;link='';guardName='';instruction='';drag=-1;
  detail:any=null;detailId='';audioUrl='';spend:any=null;
  start=new Date(Date.now()-30*86400000).toISOString().slice(0,10); end=new Date().toISOString().slice(0,10);
  status:Record<string,string>={scheduled:'Agendada',in_progress:'Em andamento',connecting:'Conectando',completed:'Concluída',expired:'Expirada',interrupted:'Interrompida'};
  async run(fn:()=>Promise<void>){if(this.busy)return;this.busy=true;this.message='';try{await fn();}catch(e){this.message=errorMessage(e);}finally{this.busy=false;}}
  api(path:string,method='GET',body?:unknown){return request('/api/'+path,method,body,this.token);}
  async refresh(){[this.models,this.guards,this.rows]=await Promise.all([this.api('templates'),this.api('guardrails'),this.api('interviews')]);}
  login(){void this.run(async()=>{await this.refresh();this.logged=true;});}
  selectTab(t:string){this.tab=t;this.message='';if(t==='Histórico')void this.run(()=>this.refresh());if(t==='Custos')this.total();}
  newModel(){this.model=blank();this.editId='';this.message='';}
  edit(m:Model,copy=false){this.model={...blank(),...structuredClone(m.definition)};this.editId=copy?'':m.id;if(copy)this.model.title+=' (cópia)';}
  add(){this.model.blocks.push(block());}
  move(from:number,to:number){if(from<0 || to<0 || to>=this.model.blocks.length)return;this.model.blocks.splice(to,0,this.model.blocks.splice(from,1)[0]);this.drag=-1;}
  hasGuard(g:Guard){return this.model.guardrails.some(x=>x.name===g.name && x.version===g.version);}
  toggle(g:Guard){if(this.hasGuard(g))this.model.guardrails=this.model.guardrails.filter(x=>!(x.name===g.name&&x.version===g.version));else this.model.guardrails.push({name:g.name,version:g.version});}
  save(){void this.run(async()=>{const r=await this.api('templates'+(this.editId?'/'+this.editId:''),this.editId?'PUT':'POST',this.model);
    this.editId=r.id;this.selected=r.id;await this.refresh();this.message='Modelo salvo.';});}
  invite(){this.link='';void this.run(async()=>{const r=await this.api('interviews','POST',{templateId:this.selected,candidateName:this.name,candidateContext:this.context,validityHours:this.validity});
    this.link=location.origin+'/interview/'+r.id+'#token='+r.token;await this.refresh();this.message='Convite gerado.';});}
  guard(){void this.run(async()=>{await this.api('guardrails','POST',{name:this.guardName,instruction:this.instruction});await this.refresh();this.message='Versão salva.';});}
  clearAudio(){if(this.audioUrl)URL.revokeObjectURL(this.audioUrl);this.audioUrl='';}
  open(id:string){void this.run(async()=>{this.clearAudio();this.detail=null;this.detail=await this.api('interviews/'+id+'/report');this.detailId=id;});}
  review(){void this.run(async()=>{await this.api('interviews/'+this.detailId+'/review','PUT',{note:this.detail.review||''});this.message='Revisão salva.';});}
  play(){void this.run(async()=>{const r=await fetch('/api/interviews/'+this.detailId+'/recording',{headers:{Authorization:'Bearer '+this.token}});if(!r.ok)throw new Error('Gravação indisponível.');this.clearAudio();this.audioUrl=URL.createObjectURL(await r.blob());});}
  erase(){if(!confirm('Excluir permanentemente esta gravação?'))return;void this.run(async()=>{await this.api('interviews/'+this.detailId+'/recording','DELETE');this.detail.recording=false;this.clearAudio();});}
  download(){const url=URL.createObjectURL(new Blob([JSON.stringify(this.detail,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='entrevista-'+this.detailId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  total(){void this.run(async()=>{this.spend=await this.api('spend?start='+this.start+'&end='+this.end);});}
  logout(){location.reload();}
}
bootstrapApplication(App);
