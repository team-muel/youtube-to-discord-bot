import fs from 'fs';
const lines = fs.readFileSync('server.ts', 'utf-8').split('\n');
for (let i=69;i<=80;i++){
  const line = lines[i-1];
  console.log(`${i}: ${line}`);
  console.log([...line].map(c=>c.charCodeAt(0)).join(' '));
}
