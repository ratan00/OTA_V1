const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/dhan-oss/DhanHQ-py/main/dhanhq/dhanhq.py', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => { 
      fs.writeFileSync('dhanhq.py', data);
      console.log('Saved to dhanhq.py');
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
