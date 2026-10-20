'use strict';
// Explicit deterministic local export. --check never writes. No deployment commands.
const fs=require('node:fs'),path=require('node:path');
const files=['connection-request.html','connection-request.css','connection-request.js','connection-request-media.js','connection-request-entry.js'];
const target=path.resolve(__dirname,'../pairing-api/public/connect-assets');
for(const file of files){const source=fs.readFileSync(path.join(__dirname,file)),dest=path.join(target,file);
 if(process.argv.includes('--check')){if(!fs.existsSync(dest)||!source.equals(fs.readFileSync(dest)))throw Error('Connect asset export differs: '+file);}
 else{fs.mkdirSync(target,{recursive:true});fs.writeFileSync(dest,source);}
}
console.log('PASS deterministic connect asset '+(process.argv.includes('--check')?'verification':'local export')+' ('+files.length+' files)');
