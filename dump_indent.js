import fs from 'fs';
const lines = fs.readFileSync('server.ts','utf-8').split('\n');
for (let i=10;i<=20;i++){
  const line = lines[i-1];
  console.log(`${i}: '${line.replace(/ /g,'·')}'`);
}
