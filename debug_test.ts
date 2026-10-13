import { createLocalD1Database } from './src/db/localD1';
import { getDb } from './src/db';
import { seedDatabase } from './src/db/seed';
import { rolePermissions, auditLogs } from './src/db/schema';

async function run() {
    const localD1 = createLocalD1Database('./test_debug.db');
    const db = getDb(localD1);
    await seedDatabase(db);
    
    const rp = await db.select().from(rolePermissions).all();
    console.log('RolePermissions count:', rp.length);
    
    // Test audit log
    const { hrStaff, hrDesignations, hrLeaveRequests } = require('./src/db/schema');
    const staffId = 'staff-1';
    const leaveId = 'leave-1';
    await db.insert(hrDesignations).values({id:'d1', outletId:'ro-1001', code:'C1', name:'N1', skillCategory:'SKILLED', status:'ACTIVE', createdBy:'u1', createdAt:'2026-10-12T00:00:00Z', updatedAt:'2026-10-12T00:00:00Z'}).run();
    await db.insert(hrStaff).values({id:staffId, outletId:'ro-1001', employeeCode:'E1', fullName:'N1', designationId:'d1', joiningDate:'2026-01-01', createdBy:'u1', createdAt:'2026-10-12T00:00:00Z', updatedAt:'2026-10-12T00:00:00Z'}).run();
    await db.insert(hrLeaveRequests).values({id:leaveId, outletId:'ro-1001', staffId, leaveType:'CASUAL', fromDate:'2026-11-01', toDate:'2026-11-02', reason:'R1', status:'PENDING', requestedByUserId:'u1', createdAt:'2026-10-12T00:00:00Z', updatedAt:'2026-10-12T00:00:00Z'}).run();
    await db.update(hrLeaveRequests).set({status:'APPROVED', decisionByUserId:'u2', decisionAt:'2026-10-12T00:00:00Z', updatedAt:'2026-10-12T00:00:00Z', decisionNotes:'N1'}).where(require('drizzle-orm').eq(hrLeaveRequests.id, leaveId)).run();
    
    const audit = await db.select().from(auditLogs).where(require('drizzle-orm').eq(auditLogs.entityId, leaveId)).all();
    console.log('Audit records for leave:', audit.length);
}
run();
