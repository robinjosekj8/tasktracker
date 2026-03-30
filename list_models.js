require('dotenv').config();
const xmlrpc = require('xmlrpc');

const ODOO_URL  = process.env.ODOO_URL;
const ODOO_DB   = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER;
const ODOO_PASS = process.env.ODOO_PASS;

function odooCall(host, path, method, params) {
    return new Promise((resolve, reject) => {
        const isHttps = host.startsWith('https');
        const createClient = isHttps ? xmlrpc.createSecureClient : xmlrpc.createClient;
        const hostname = host.replace(/^https?:\/\//, '');
        const client = createClient({ host: hostname, port: isHttps ? 443 : 80, path });
        client.methodCall(method, params, (err, val) => {
            if (err) return reject(err);
            resolve(val);
        });
    });
}

async function listModels() {
    try {
        const uid = await odooCall(ODOO_URL, '/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
        const models = await odooCall(ODOO_URL, '/xmlrpc/2/object', 'execute_kw', [
            ODOO_DB, uid, ODOO_PASS,
            'ir.model',
            'search_read',
            [['|', '|', ['model', 'ilike', 'maintenance'], ['model', 'ilike', 'task'], ['model', 'ilike', 'project']]],
            { fields: ['model', 'name'] }
        ]);
        console.log('Available Models:', JSON.stringify(models, null, 2));
    } catch (err) {
        console.error(err);
    }
}

listModels();
