import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
async function main(){
  const { generateCodingProblem } = await import('@/lib/services/problems')
  const { executeOnce } = await import('@/lib/piston')
  const raw = await generateCodingProblem('probe', { difficulty:'easy', topics:['kubernetes','pods'], role:'Cloud & DevOps Beginner Kubernetes engineer', language_hint:'python', industry:'Cloud & DevOps', tech_stack:'Kubernetes', level:'Beginner' })
  if(!raw){ console.log('GEN NULL (all providers failed)'); process.exit(1) }
  const sol = String(raw.solution_code ?? '').trim()
  console.log('=== solution_code present:', sol.length>0, 'len=', sol.length)
  console.log('=== first 40 lines of solution_code ===')
  console.log(sol.split('\n').slice(0,40).join('\n'))
  const tests = (raw.test_cases||[]) as any[]
  console.log('=== tests:', tests.length, 'sample:', tests.filter(t=>t.is_sample).length)
  const samples = tests.filter(t=>t.is_sample).slice(0,3)
  const norm=(x:any)=>String(x??'').replace(/\s+/g,' ').trim()
  for (const s of samples){
    const r = await executeOnce({ language:'python', source: sol, stdin: String(s.stdin??'') }).catch(e=>({run:{code:-1,stdout:String(e)}}))
    const ok = r.run.code===0 && norm(r.run.stdout)===norm(s.expected_stdout)
    console.log(`sample ${ok?'PASS':'FAIL'} exit=${r.run.code}`)
    console.log('  in:', JSON.stringify(String(s.stdin??'')).slice(0,80))
    console.log('  exp:', JSON.stringify(String(s.expected_stdout??'')).slice(0,80))
    console.log('  act:', JSON.stringify(String(r.run.stdout??'').slice(0,80)))
  }
}
main().catch(e=>{console.log('FATAL',e);process.exit(1)})
