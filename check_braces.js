import fs from 'fs';
const lines = fs.readFileSync('server.ts','utf-8').split('\n');
lines.forEach((l,i)=>{
  const open = (l.match(/{/g)||[]).length;
  const close = (l.match(/}/g)||[]).length;
  if(open!==close) console.log(`Line ${i+1}: opens=${open} closes=${close}`);
});
