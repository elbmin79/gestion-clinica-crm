// Local scheduler; production can use the authenticated cron route instead.
const origin=process.env.CRM_ORIGIN || 'http://localhost:3000';
if(!process.env.CRON_SECRET)throw new Error('Configure CRON_SECRET in .env.local first.');
const url=new URL('/api/notifications/dispatch',origin);
if(!['http:','https:'].includes(url.protocol))throw new Error('CRM_ORIGIN must be an HTTP(S) origin.');
async function tick(){
  try {
    const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(55000)});
    if(!response.ok){console.error(`Push worker: dispatch unavailable (${response.status}).`);return;}
    const {counts}=await response.json();
    if(Object.values(counts || {}).some(Boolean))console.log('Push worker:',counts);
  }catch{console.error('Push worker: cannot reach CRM dispatch endpoint.');}
}
console.log(`Push worker for ${url.origin}: ${process.argv.includes('--once')?'one delivery pass':'polling every 60 seconds'}.`);
await tick();
// Recursive timeout prevents overlapping deliveries when a request is slow.
async function poll(){await tick();setTimeout(poll,60000);}
if(!process.argv.includes('--once'))setTimeout(poll,60000);
