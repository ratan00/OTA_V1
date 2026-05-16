const fetch = require('node-fetch');

async function go() {
    try {
        let res = await import('node-fetch').then(m => m.default('https://api.github.com/repos/dhan-oss/DhanHQ-py/git/trees/main?recursive=1', {
            headers: { 'User-Agent': 'node' }
        }));
        let data = await res.json();
        console.log(data.tree.map(t => t.path).filter(p => p.includes('.py')).join('\n'));
    } catch (e) {
        console.error(e);
    }
}
go();
