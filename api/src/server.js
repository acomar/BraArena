import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import { z } from 'zod';

const app = express();
app.use(express.json({ limit: '128kb' }));
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const auth = (req,res,next) => {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return res.sendStatus(401);
  next();
};
const modelSchema = z.object({
  title: z.string().min(1).max(160),
  durationMinutes: z.number().int().min(5).max(180),
  blocks: z.array(z.object({
    type: z.enum(['intro','question','closing']),
    prompt: z.string().min(1),
    expectedAnswer: z.string().optional(),
    drivers: z.array(z.string()).default([]),
    timeboxSeconds: z.number().int().positive()
  })).min(1)
});
async function init(){
  await db.query(`CREATE TABLE IF NOT EXISTS templates (
    id uuid PRIMARY KEY, title text NOT NULL, definition jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS interviews (
    id uuid PRIMARY KEY, template_id uuid NOT NULL REFERENCES templates(id),
    candidate_name text NOT NULL, candidate_context text,
    token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'scheduled',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS transcript_turns (
    id bigserial PRIMARY KEY, interview_id uuid NOT NULL REFERENCES interviews(id),
    speaker text NOT NULL CHECK (speaker IN ('candidate','assistant')),
    content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
}
app.get('/health', (_req,res)=>res.json({ok:true}));
app.post('/api/templates',auth,async(req,res,next)=>{
  try {
    const data=modelSchema.parse(req.body);
    const id=crypto.randomUUID();
    await db.query('INSERT INTO templates(id,title,definition) VALUES($1,$2,$3)',[id,data.title,data]);
    res.status(201).json({id});
  } catch(e){next(e);}
});
app.get('/api/templates',auth,async(_req,res,next)=>{
  try { const {rows}=await db.query('SELECT id,title,definition,created_at FROM templates ORDER BY created_at DESC');res.json(rows); }
  catch(e){next(e);}
});
app.post('/api/interviews',auth,async(req,res,next)=>{
  try {
    const input=z.object({templateId:z.string().uuid(),candidateName:z.string().min(1),candidateContext:z.string().max(10000).optional()}).parse(req.body);
    const id=crypto.randomUUID(), token=crypto.randomBytes(32).toString('base64url');
    await db.query('INSERT INTO interviews(id,template_id,candidate_name,candidate_context,token_hash) VALUES($1,$2,$3,$4,$5)',[id,input.templateId,input.candidateName,input.candidateContext??'',crypto.createHash('sha256').update(token).digest('hex')]);
    res.status(201).json({id,token});
  } catch(e){next(e);}
});
app.get('/api/interviews/:id/transcript',auth,async(req,res,next)=>{
  try {const {rows}=await db.query('SELECT speaker,content,created_at FROM transcript_turns WHERE interview_id=$1 ORDER BY id',[req.params.id]);res.json(rows);}
  catch(e){next(e);}
});
app.use((err,_req,res,_next)=>{
  if(err instanceof z.ZodError)return res.status(400).json({error:'Invalid input',issues:err.issues});
  if(err.code==='23503')return res.status(404).json({error:'Template not found'});
  console.error(err);res.status(500).json({error:'Internal server error'});
});
await init();
app.listen(Number(process.env.PORT??3000),'0.0.0.0');
