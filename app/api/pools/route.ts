import { NextResponse } from 'next/server';
import db from '../../lib/db';

export async function GET() {
  try {
    const stmt = db.prepare('SELECT * FROM pools ORDER BY id DESC');
    const pools = stmt.all();
    return NextResponse.json(pools);
  } catch (error) {
    console.error('Failed to fetch pools:', error);
    return NextResponse.json({ error: 'Failed to fetch pools' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, goal, startTime, endTime } = body;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO pools (id, name, goal, startTime, endTime, status)
      VALUES (?, ?, ?, ?, ?, 'Open')
    `);

    stmt.run(id, name, goal, startTime, endTime);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return NextResponse.json({ error: 'Pool ID already exists' }, { status: 400 });
    }
    console.error('Failed to create pool:', error);
    return NextResponse.json({ error: 'Failed to create pool' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (id === undefined || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }

    const stmt = db.prepare('UPDATE pools SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update pool status:', error);
    return NextResponse.json({ error: 'Failed to update pool status' }, { status: 500 });
  }
}
