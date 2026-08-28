const { get, all } = require('./backend/db.js');
console.log('--- DB CHECK ---');
const callingCount = get("SELECT COUNT(id) as count FROM leads WHERE call_status = 'calling'");
console.log('Leads com call_status = calling:', callingCount);
const pendingCount = get("SELECT COUNT(id) as count FROM leads WHERE call_status = 'pending'");
console.log('Leads com call_status = pending:', pendingCount);
