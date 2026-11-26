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
    await page.getByLabel('Título',{exact:true}).fill('Validação de interface');
    await page.getByLabel('Pergunta ou instrução').fill('Conte sobre um projeto técnico.');
    await page.getByLabel('Resposta esperada').fill('Rubrica privada de teste');
    await page.getByLabel('Oferecer gravação opcional').check();
    await page.getByRole('button',{name:'Salvar modelo'}).click();
    await page.getByText('Modelo salvo.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Duplicar',exact:true}).first().click();
    assert.match(await page.getByLabel('Título',{exact:true}).inputValue(),/cópia/);
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
    assert.deepEqual(errors,[]);
    console.log('PASS Angular login, template, duplicate, invitation, consent, microphone and output test, desktop and mobile widths');
  } finally { await browser.close(); }
})().catch(err=>{console.error(err.message);process.exitCode=1;});
