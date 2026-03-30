require('dotenv').config();
const xmlrpc = require('xmlrpc');

const ODOO_URL  = process.env.ODOO_URL;
const ODOO_DB   = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER;
const ODOO_PASS = process.env.ODOO_PASS;

function odooCall(host, path, method, params) {
    return new Promise((resolve, reject) => {
        const hostname = host.replace(/^https?:\/\//, '');
        const client = xmlrpc.createSecureClient({ host: hostname, port: 443, path });
        client.methodCall(method, params, (err, val) => {
            if (err) return reject(err);
            resolve(val);
        });
    });
}

async function checkFields() {
    try {
        const uid = await odooCall(ODOO_URL, '/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
        const fields = await odooCall(ODOO_URL, '/xmlrpc/2/object', 'execute_kw', [
            ODOO_DB, uid, ODOO_PASS,
            'project.task',
            'fields_get',
            [],
            { attributes: ['string', 'type'] }
        ]);
        
        const importantFields = {};
        const targets = ['user', 'assign', 'stage', 'project', 'date', 'deadline', 'priority'];
        
        for (let f in fields) {
            if (targets.some(t => f.toLowerCase().includes(t))) {
                importantFields[f] = fields[f];
            }
        }
        
        console.log('Relevant Fields found:', JSON.stringify(importantFields, null, 2));
    } catch (err) {
        console.error(err);
    }
}

checkFields();
