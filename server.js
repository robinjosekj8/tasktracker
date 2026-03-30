require('dotenv').config();
const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const xmlrpc = require('xmlrpc');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Config ---
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Uwi1eGvKFpB6nQHJXz3P_bsS4UcTAinoHpC1zu7mig4/export?format=xlsx';
const ODOO_URL  = process.env.ODOO_URL  || '';
const ODOO_DB   = process.env.ODOO_DB   || '';
const ODOO_USER = process.env.ODOO_USER || '';
const ODOO_PASS = process.env.ODOO_PASS || '';

// --- Cache ---
let cachedData     = null;
let lastFetchTime  = 0;
const CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// ---------- Helper: clean column keys ----------
function cleanKeys(data) {
    return data.map(row => {
        let newRow = {};
        for (let key in row) newRow[key.trim()] = row[key];
        return newRow;
    });
}

// ---------- Helper: Odoo XML-RPC promise wrapper ----------
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

// ---------- Fetch from Odoo ----------
async function fetchFromOdoo() {
    console.log('Authenticating with Odoo...');
    const uid = await odooCall(
        ODOO_URL,
        '/xmlrpc/2/common',
        'authenticate',
        [ODOO_DB, ODOO_USER, ODOO_PASS, {}]
    );

    if (!uid) throw new Error('Odoo authentication failed — invalid credentials or DB name.');
    console.log(`Odoo auth OK. UID: ${uid}. Fetching tasks with tags...`);

    const records = await odooCall(
        ODOO_URL,
        '/xmlrpc/2/object',
        'execute_kw',
        [
            ODOO_DB, uid, ODOO_PASS,
            'project.task',
            'search_read',
            [[]], // Fetch all ACTIVE tasks
            {
                fields: [
                    'name',
                    'stage_id',
                    'date_deadline',
                    'create_date',
                    'priority',
                    'project_id',
                    'tag_ids',
                    'description', // Fetched for detail view
                ],
                limit: 10000,
            }
        ]
    );

    console.log(`Fetched ${records.length} tasks from project.task.`);

    // Map Odoo Fields → Dashboard Format
    const priorityMap = { '0': 'Normal', '1': 'High' };
    
    const tagsMap = {};
    try {
        const allTags = await odooCall(ODOO_URL, '/xmlrpc/2/object', 'execute_kw', [
            ODOO_DB, uid, ODOO_PASS,
            'project.tags',
            'search_read',
            [[]],
            { fields: ['id', 'name'] }
        ]);
        allTags.forEach(t => tagsMap[t.id] = t.name);
    } catch (e) {
        console.warn('Could not fetch tag names from project.tags, continuing...');
    }

    return records.map(r => {
        const techNames = (r.tag_ids || []).map(id => tagsMap[id] || `Tag #${id}`).join(', ');
        
        return {
            'Odoo ID':          r.id,
            'Task Description': r.name || '',
            'Full Description': r.description || '', // New deep-dive field
            'Assigned Tech':    techNames || 'Unassigned',
            'Status':           r.stage_id ? r.stage_id[1] : 'Unknown',
            'Date':             r.create_date ? new Date(r.create_date).toLocaleDateString() : 'N/A',
            'planned Date':     r.date_deadline || 'N/A',
            'Priority':         priorityMap[r.priority] || 'Normal',
            'Site':             r.project_id ? r.project_id[1] : 'N/A',
            'Estimated Hours':  '',
            '_source':          'odoo',
        };
    });
}

// ---------- NEW: Fetch Task Logs (Odoo Chatter) ----------
app.get('/api/task-logs/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    if (!taskId) return res.status(400).json({ error: 'Missing task ID' });

    try {
        const uid = await odooCall(ODOO_URL, '/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
        const messages = await odooCall(ODOO_URL, '/xmlrpc/2/object', 'execute_kw', [
            ODOO_DB, uid, ODOO_PASS,
            'mail.message',
            'search_read',
            [['model', '=', 'project.task'], ['res_id', '=', taskId]],
            {
                fields: ['body', 'author_id', 'date', 'subtype_id'],
                order: 'date desc',
                limit: 10
            }
        ]);
        res.json(messages);
    } catch (err) {
        console.error('Failed to fetch Odoo logs:', err.message);
        res.status(500).json({ error: 'Failed to fetch Odoo logs' });
    }
});

// ---------- Fetch from Google Sheet ----------
async function fetchFromGoogleSheet() {
    console.log('Fetching Google Sheet...');
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    return cleanKeys(data.filter(row => Object.values(row).some(v => v !== '')));
}

// ---------- Fetch from local Excel ----------
function fetchFromLocalExcel() {
    console.log('Falling back to local Excel file...');
    const wb = XLSX.readFile('./Maintenance Team schedule log report Tracking.xlsx');
    let data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    return cleanKeys(data.filter(row => Object.values(row).some(v => v !== '')));
}

// ---------- Main API endpoint: ODOO ONLY for testing ----------
app.get('/api/tasks', async (req, res) => {
    const now = Date.now();
    if (cachedData && (now - lastFetchTime < CACHE_DURATION_MS)) {
        console.log('Returning cached Odoo data...');
        return res.json(cachedData);
    }

    if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
        return res.status(500).json({ error: 'Odoo credentials not configured in .env' });
    }

    try {
        console.log('Force fetching from Odoo...');
        cachedData = await fetchFromOdoo();
        lastFetchTime = Date.now();
        res.json(cachedData);
    } catch (err) {
        console.error('Odoo testing fetch failed:', err.message);
        res.status(500).json({ error: 'Odoo connection failed', details: err.message });
    }
});

// ---------- Odoo status endpoint ----------
app.get('/api/odoo-status', async (req, res) => {
    if (!ODOO_URL) return res.json({ connected: false, reason: 'No Odoo URL configured.' });
    try {
        console.log(`Checking Odoo connection: URL=${ODOO_URL}, DB=${ODOO_DB}, User=${ODOO_USER}`);
        const uid = await odooCall(ODOO_URL, '/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASS, {}]);
        console.log(`Connection check result: UID=${uid}`);
        res.json({ connected: !!uid, uid, config: { URL: ODOO_URL, DB: ODOO_DB, User: ODOO_USER } });
    } catch (err) {
        console.error('Odoo connection check failed:', err);
        res.json({ connected: false, reason: err.message, stack: err.stack });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Data source priority: Odoo → Google Sheet → Local Excel`);
});
