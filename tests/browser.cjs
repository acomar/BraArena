const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--unsafely-treat-insecure-origin-as-secure='+process.env.BASE_URL]});
  try {
    const context = await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:860}});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.BASE_URL);
    await page.getByLabel('Token administrativo').fill(process.env.ADMIN_TOKEN);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    const script='Conte sobre um projeto técnico.\nAvaliação privada:\nRubrica privada de teste';
    const editor=page.getByLabel('Instruções da entrevista');
    await page.getByRole('button',{name:'Salvar modelo'}).click();
    await page.getByRole('alert').filter({hasText:'Escreva as instruções'}).waitFor();
    await editor.fill('a'.repeat(10001));
    await page.getByRole('button',{name:'Salvar modelo'}).click();
    await page.getByRole('alert').filter({hasText:'10.000'}).waitFor();
    await editor.fill(script.padEnd(10000,'x'));
    await page.getByText('Opções do modelo',{exact:true}).click();
    await page.getByLabel('Título (opcional)').fill('Validação de interface');
    await page.getByLabel('Oferecer gravação opcional').check();
    const saveButton=page.getByRole('button',{name:'Salvar modelo'});
    await page.route('**/api/templates',route=>route.fulfill({status:429,body:'Too Many Requests'}),{times:1});
    await saveButton.click();
    await page.getByRole('alert').filter({hasText:'HTTP 429'}).waitFor();
    assert.equal(await editor.inputValue(),script.padEnd(10000,'x'));
    await page.route('**/api/interviews',route=>route.fulfill({status:503,body:'Service Unavailable'}));
    await page.getByRole('button',{name:'Salvar modelo'}).click();
    await page.getByText('Modelo salvo.',{exact:true}).waitFor();
    await page.unroute('**/api/interviews');
    await page.getByRole('button',{name:'Duplicar',exact:true}).first().click();
    assert.match(await page.getByLabel('Título (opcional)').inputValue(),/cópia/);
    assert.equal(await editor.inputValue(),script.padEnd(10000,'x'));
    await page.getByRole('button',{name:'Convites',exact:true}).click();
    await page.getByLabel('Nome do candidato').fill('Teste automatizado');
    await page.getByRole('button',{name:'Gerar link'}).click();
    const link=page.locator('a[href*="/interview/"]');
    await link.waitFor();
    const url=await link.getAttribute('href');
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:844});await page.goto(url);
      await page.getByText('Validação de interface',{exact:true}).waitFor();
      assert.equal(await page.getByText('Rubrica privada de teste').count(),0);
      assert.equal(await page.getByRole('button',{name:'Iniciar entrevista'}).isDisabled(),true);
      await page.getByRole('checkbox',{name:/Aceito a transcrição/}).check();
      await page.getByRole('checkbox',{name:/Autorizo também/}).check();
      await page.getByRole('button',{name:'Testar microfone e saída'}).click();
      await page.getByRole('status').filter({hasText:/Microfone recebeu áudio|Microfone conectado/}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    }
    // A second real WebRTC peer supplies deterministic audio in place of a paid OpenAI call.
    let ready=false, uploaded=null, end=false, consent=false;
    await page.route('**/api/candidate/*/*',async route=>{
      const r=route.request(), action=new URL(r.url()).pathname.split('/').pop();
      const answer=json=>route.fulfill({json});
      if(action==='info')return answer({title:'Sala de áudio sintético',recording:true,minutes:1,voiceConfigured:true});
      if(action==='session'){
        consent=r.postDataJSON().recordingConsent;
        const sdp=await page.evaluate(async offer=>{
          const pc=new RTCPeerConnection();window.testPeer=pc;
          const audio=new AudioContext();await audio.resume();window.testAudio=audio;
          const osc=audio.createOscillator(),out=audio.createMediaStreamDestination();
          osc.connect(out);osc.start();
          await pc.setRemoteDescription({type:'offer',sdp:offer});
          pc.addTrack(out.stream.getAudioTracks()[0],out.stream);
          await pc.setLocalDescription(await pc.createAnswer());
          if(pc.iceGatheringState!=='complete')await new Promise(resolve=>{
            pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete')resolve();};
          });
          return pc.localDescription.sdp;
        },r.postDataJSON().sdp);
        return answer({sdp,sessionToken:'synthetic-session-for-e2e',deadline:new Date(Date.now()+60000).toISOString()});
      }
      if(action==='ready'){ready=true;return answer({ok:true});}
      if(action==='status')return answer({status:'in_progress',state:'speaking'});
      if(action==='finish'){end=true;return answer({ok:true});}
      if(action==='recording'){uploaded=r.postDataBuffer();return answer({ok:true});}
      throw Error('Unexpected candidate operation');
    });
    for(const allow of [false,true]){
      ready=false;uploaded=null;end=false;
      await page.goto('about:blank');await page.goto(url);await page.getByText('Sala de áudio sintético',{exact:true}).waitFor();
      await page.getByRole('checkbox',{name:/Aceito a transcrição/}).check();
      if(allow)await page.getByRole('checkbox',{name:/Autorizo também/}).check();
      await page.getByRole('button',{name:'Iniciar entrevista'}).click();
      await page.getByText('Entrevistadora falando',{exact:true}).waitFor();
      await page.waitForFunction(()=>parseFloat(document.querySelector('.mouth').style.height)>6);
      assert.equal(ready,true);assert.equal(consent,allow);
      await page.getByRole('button',{name:'Encerrar entrevista'}).click();
      await page.getByRole('status').filter({hasText:'Obrigado pela participação'}).waitFor();
      assert.equal(end,true);
      if(allow){
        assert.ok(uploaded.length>100);assert.equal(uploaded.subarray(0,4).toString('hex'),'1a45dfa3');
        assert.ok(uploaded.includes(Buffer.from('A_OPUS')));
      }else assert.equal(uploaded,null);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS Angular login, template, duplicate, invitation, consent, microphone and output test, desktop and mobile widths, real WebRTC loopback and optional WebM/Opus');
  } finally { await browser.close(); }
})().catch(err=>{console.error(err.message);process.exitCode=1;});
