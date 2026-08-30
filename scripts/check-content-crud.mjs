/**
 * Content CRUD, and the rule that protects reading history.
 *
 * Deleting a day cascades to `day_completions`, so deleting content somebody has
 * read would silently rewrite their streak. Published or read content can only be
 * archived.
 *
 * This runs the delete as an *admin* against a *member's* completion, which is the
 * case that matters and the case the pgTAP suite originally missed: the guard reads
 * `day_completions`, that table is own-row-only under RLS, and a guard without
 * SECURITY DEFINER counted zero and waved the delete through.
 *
 *   node scripts/check-content-crud.mjs
 */
const BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
let fails=0
const ok=(l,a,e)=>{const p=JSON.stringify(a)===JSON.stringify(e);if(!p)fails++;console.log(`${p?'PASS':'FAIL'}  ${l}: ${JSON.stringify(a)}${p?'':` (expected ${JSON.stringify(e)})`}`)}
const j=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}}

const t=await j(await fetch(`${BASE}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({email:'dev@abide.local',password:'abide12345'})}))
const H={apikey:ANON,authorization:`Bearer ${t.access_token}`,'content-type':'application/json',prefer:'return=representation'}
const rest=(p,i={})=>fetch(`${BASE}/rest/v1/${p}`,{...i,headers:{...H,...(i.headers??{})}})
const p=(await j(await rest('profiles?select=church_id,ministry_id')))[0]

console.log('--- phase CRUD')
const phase=(await j(await rest('phases',{method:'POST',body:JSON.stringify({church_id:p.church_id,ministry_id:p.ministry_id,code:'77',title_en:'Test phase',title_am:'የሙከራ ደረጃ'})})))[0]
ok('created', phase.code, '77')

const round=(await j(await rest('rounds',{method:'POST',body:JSON.stringify({church_id:p.church_id,ministry_id:p.ministry_id,phase_id:phase.id,round_code:'01',starts_on:'2027-01-01',status:'draft'})})))[0]
ok('round inherits the phase code without being told it', round.phase_code, '77')

await rest(`phases?id=eq.${phase.id}`,{method:'PATCH',body:JSON.stringify({code:'78'})})
const renamed=(await j(await rest(`rounds?select=phase_code&id=eq.${round.id}`)))[0]
ok('renaming the phase reaches its rounds', renamed.phase_code, '78')

console.log('\n--- delete protection')
const book=(await j(await rest('books',{method:'POST',body:JSON.stringify({church_id:p.church_id,round_id:round.id,sequence:1,source_id:'T',title_en:'Test book',title_am:'ሙከራ',status:'draft'})})))[0]
const day=(await j(await rest('devotion_days',{method:'POST',body:JSON.stringify({church_id:p.church_id,book_id:book.id,day_number:1,topic_en:'x',topic_am:'x',status:'published',scheduled_date:'2027-01-01'})})))[0]

let r = await rest(`phases?id=eq.${phase.id}`,{method:'DELETE'})
ok('a phase holding a round is refused', r.status, 409)

// Make it read, the way a member would.
const m=await j(await fetch(`${BASE}/auth/v1/signup`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({email:`reader+${Date.now()}@example.com`,password:'devpassword123'})}))
const MH={apikey:ANON,authorization:`Bearer ${m.access_token}`,'content-type':'application/json'}
await fetch(`${BASE}/rest/v1/rpc/redeem_join_code`,{method:'POST',headers:MH,body:JSON.stringify({p_code:'ABIDE-DEV',p_display_name:'Reader'})})
// Insert the completion directly as that member — the same row the app would write.
await fetch(`${BASE}/rest/v1/day_completions`,{method:'POST',headers:MH,body:JSON.stringify({user_id:m.user.id,devotion_day_id:day.id,method:'live',counted_for_streak:true})})
const readCount=(await j(await fetch(`${BASE}/rest/v1/day_completions?select=devotion_day_id`,{headers:MH}))).length
ok('the member has a completion', readCount, 1)

r = await rest(`devotion_days?id=eq.${day.id}`,{method:'DELETE'})
ok('the day they read cannot be deleted', r.status, 409)
r = await rest(`books?id=eq.${book.id}`,{method:'DELETE'})
ok('nor the book containing it', r.status, 409)

const still=(await j(await fetch(`${BASE}/rest/v1/day_completions?select=devotion_day_id`,{headers:MH}))).length
ok('their reading history is intact', still, 1)

console.log('\n--- archive is the way out')
r = await rest(`books?id=eq.${book.id}`,{method:'PATCH',body:JSON.stringify({status:'archived'})})
ok('the book archives', r.status, 200)
const visible=(await j(await fetch(`${BASE}/rest/v1/books?select=id,status&id=eq.${book.id}`,{headers:MH})))
ok('and stays readable to the member', visible[0]?.status, 'archived')

console.log('\n--- cleaning up')
// Unread drafts still delete freely.
await fetch(`${BASE}/rest/v1/day_completions?devotion_day_id=eq.${day.id}`,{method:'DELETE',headers:MH})
await rest(`books?id=eq.${book.id}`,{method:'PATCH',body:JSON.stringify({status:'draft'})})
r = await rest(`books?id=eq.${book.id}`,{method:'DELETE'})
ok('an unread draft book deletes freely', r.status, 200)
await rest(`rounds?id=eq.${round.id}`,{method:'DELETE'})
await rest(`phases?id=eq.${phase.id}`,{method:'DELETE'})

console.log(fails===0?'\nAll content CRUD checks passed.':`\n${fails} FAILED`)
process.exit(fails===0?0:1)
