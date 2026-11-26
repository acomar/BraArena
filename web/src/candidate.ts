import {Component, OnDestroy, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {errorMessage, request} from './http';

@Component({
  selector:'interview-room', standalone:true, imports:[CommonModule,FormsModule],
  styleUrls:['./robot.css'],templateUrl:'./candidate.html'
})
export class Candidate implements OnInit, OnDestroy {
  title='Sala de entrevista'; message='Carregando convite…'; active=false; busy=false; done=false;
  available=false; configured=false; minutes=0; recording=false; consent=false; recordConsent=false;
  robotState='idle'; mouthHeight=5; remaining=0; level=0; testing=false;
  private path='/api/candidate/'+encodeURIComponent(location.pathname.split('/')[2]);
  private invite=new URLSearchParams(location.hash.slice(1)).get('token') || new URLSearchParams(location.search).get('token');
  private key=''; private peer?:RTCPeerConnection; private mic?:MediaStream; private ctx?:AudioContext;
  private recorder?:MediaRecorder; private chunks:Blob[]=[]; private frame=0; private tick=0; private disconnectedAt=0;
  private polling=false; private deadline=0; private stopped=false;
  labels:Record<string,string>={idle:'Aguardando início',connecting:'Conectando',listening:'Ouvindo você',speaking:'Entrevistadora falando',thinking:'Preparando resposta'};
  get clock(){return Math.floor(this.remaining/60)+':'+String(this.remaining%60).padStart(2,'0');}
  async ngOnInit(){
    try{
      const info=await request(this.path+'/info','POST',{token:this.invite});
      this.title=info.title;this.recording=!!info.recording;this.minutes=info.minutes;
      this.available=true;this.configured=info.voiceConfigured;
      this.message=this.configured?'':'A conversa por voz aguarda configuração pelo gestor.';
    }catch(e){this.message=errorMessage(e);}
  }
  async testAudio(){
    if(this.testing || this.busy || this.active) return;
    this.testing=true; let ctx:AudioContext|undefined;let stream:MediaStream|undefined;
    try {
      ctx=new AudioContext();await ctx.resume();
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.075;
      oscillator.connect(gain).connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.35);
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const analyser=ctx.createAnalyser();ctx.createMediaStreamSource(stream).connect(analyser);
      const values=new Float32Array(analyser.fftSize);this.message='Fale para testar o microfone. Verifique se ouviu o sinal.';
      let peak=0;
      for(let i=0;i<24;i++){analyser.getFloatTimeDomainData(values);this.level=Math.min(100,Math.round(Math.max(...values.map(Math.abs))*400));peak=Math.max(peak,this.level);await new Promise(r=>setTimeout(r,100));}
      this.message=peak>1?'Microfone recebeu áudio. Se ouviu o sinal, a saída também está pronta.':'Microfone conectado. Nenhum som detectado no teste.';
    }catch(e){this.message=errorMessage(e);}finally{stream?.getTracks().forEach(t=>t.stop());await ctx?.close();this.testing=false;this.level=0;}
  }
  private attach(stream:MediaStream){
    const ctx=this.ctx!;
    const player=document.querySelector<HTMLAudioElement>('#voice-output')!;
    player.srcObject=stream;void player.play().catch(()=>{this.message='Toque em Reproduzir áudio para ouvir a entrevista.';});
    const remote=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();
    analyser.fftSize=512;remote.connect(analyser);const samples=new Float32Array(512);
    const animate=()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);
      this.mouthHeight=Math.min(32,5+rms*180);this.frame=requestAnimationFrame(animate);};animate();
    if(this.recordConsent && this.recording){
      const mixed=ctx.createMediaStreamDestination();remote.connect(mixed);ctx.createMediaStreamSource(this.mic!).connect(mixed);
      this.recorder=new MediaRecorder(mixed.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:32000});
      this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
      this.recorder.start(1000);
    }
  }
  async start(){
    if(!this.consent || this.active || this.busy || this.done)return;
    this.busy=true;this.message='Abrindo microfone…';this.robotState='connecting';
    try {
      if(this.recordConsent && !(window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')))throw new Error('Este navegador não grava WebM/Opus. Desmarque a gravação para continuar.');
      this.ctx=new AudioContext();await this.ctx.resume();
      this.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      this.peer=new RTCPeerConnection();this.mic.getTracks().forEach(t=>this.peer!.addTrack(t,this.mic!));
      this.peer.ontrack=e=>this.attach(e.streams[0] || new MediaStream([e.track]));
      const offer=await this.peer.createOffer();await this.peer.setLocalDescription(offer);
      const session=await request(this.path+'/session','POST',{token:this.invite,transcriptConsent:this.consent,recordingConsent:this.recordConsent,sdp:offer.sdp});
      this.key=session.sessionToken;this.deadline=Date.parse(session.deadline);
      this.peer.onconnectionstatechange=()=>{
        const state=this.peer?.connectionState;
        if(state==='connected'){this.disconnectedAt=0;void request(this.path+'/ready','POST',{token:this.key}).catch(e=>{this.message=errorMessage(e);});}
        if(state==='disconnected' || state==='failed'){this.disconnectedAt ||= Date.now();this.message='Conexão interrompida. Aguardando reconexão…';}
      };
      await this.peer.setRemoteDescription({type:'answer',sdp:session.sdp});
      this.active=true;this.message='Entrevista em andamento.';this.tick=window.setInterval(()=>void this.update(),1000);void this.update();
    }catch(e){await this.stop();this.message=errorMessage(e);}finally{this.busy=false;}
  }
  async update(){
    if(this.polling || !this.active)return;
    this.remaining=Math.max(0,Math.ceil((this.deadline-Date.now())/1000));this.polling=true;
    try{
      const status=await request(this.path+'/status','POST',{token:this.key});
      this.robotState=status.state;
      if(status.status!=='in_progress' || !this.remaining || (this.disconnectedAt && Date.now()-this.disconnectedAt>12000))await this.stop();
    }catch{this.message='Sem comunicação com o servidor.';if(!this.remaining)await this.stop();}
    finally{this.polling=false;}
  }
  async stop(){
    if(this.stopped)return;
    this.stopped=true;this.busy=true;this.active=false;clearInterval(this.tick);
    cancelAnimationFrame(this.frame);this.robotState='idle';this.mouthHeight=5;
    const recorder=this.recorder;
    if(recorder && recorder.state!=='inactive')await new Promise<void>(resolve=>{recorder.onstop=()=>resolve();recorder.stop();});
    if(this.peer){this.peer.onconnectionstatechange=null;this.peer.close();}this.mic?.getTracks().forEach(t=>t.stop());await this.ctx?.close();
    this.ctx=undefined;this.recorder=undefined;
    try{
      if(this.key){
        this.done=true;await request(this.path+'/finish','POST',{token:this.key});
        if(this.chunks.length){
          const r=await fetch(this.path+'/recording',{method:'PUT',headers:{Authorization:'Bearer '+this.key,'Content-Type':'audio/webm'},body:new Blob(this.chunks,{type:'audio/webm'})});
          if(!r.ok)throw new Error('A entrevista encerrou, mas o envio da gravação falhou.');
        }
        this.message='Entrevista encerrada. Obrigado pela participação.';
      }
    }catch(e){this.message=errorMessage(e);}finally{this.busy=false;this.chunks=[];this.stopped=false;}
  }
  ngOnDestroy(){if(this.active)void this.stop();}
}
