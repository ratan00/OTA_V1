const axios = require('axios');

async function test() {
    try {
        const payload = {
            "UnderlyingScrip": 13,
            "UnderlyingSeg": "IDX_I"
        };
        const res = await axios.post("https://api.dhan.co/v2/optionchain/expirylist", payload, {
            headers: {
                "access-token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzc5MDI2NzUyLCJpYXQiOjE3Nzg5NDAzNTIsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMTA4NDAzODAwIn0.6W863o1dZuiLEOlcsiz-2ye76xdvipESFWBJlH1xcCD6Oao-jnj2x-EmbbKrlsT_uf-BecZ39dzt46O19gw3uA",
                "client-id": "1108403800",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });
        console.log("Success:", JSON.stringify(res.data));
    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}
test();
