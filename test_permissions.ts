import { createLocalD1Database } from './src/db/localD1';
import { getDb } from './src/db';
import { roles, permissions, rolePermissions } from './src/db/schema';
import { seedDatabase } from './src/db/seed';

async function run() {
    const localD1 = createLocalD1Database('./test_perm.db');
    const db = getDb(localD1);
    await seedDatabase(db);
    
    const r = await db.select().from(roles).all();
    const p = await db.select().from(permissions).all();
    const rp = await db.select().from(rolePermissions).all();
    
    console.log('Roles:', r.map(x => ({id: x.id, code: x.code})));
    console.log('Permissions:', p.map(x => ({id: x.id, code: x.code})));
}
run();
