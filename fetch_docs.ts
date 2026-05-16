import fs from "fs";

async function go() {
    let rawData1 = await fetch('https://raw.githubusercontent.com/dhan-oss/DhanHQ-py/main/src/dhanhq/_historical_data.py');
    let text1 = await rawData1.text();
    fs.writeFileSync('historical_data.py', text1);
        
    console.log("Saved.");
}
go();
