import { NextResponse } from 'next/server';
import db from '../../lib/db';

export async function GET() {
  try {
    // Get all payloads with their signature count
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        COUNT(s.id) as signatures 
      FROM payloads p 
      LEFT JOIN signatures s ON p.id = s.payloadId 
      GROUP BY p.id
    `);
    
    const payloads = stmt.all();
    return NextResponse.json(payloads);
  } catch (error) {
    console.error('Failed to fetch payloads:', error);
    return NextResponse.json({ error: 'Failed to fetch payloads' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { poolId, amount, type, required, deadline } = body;

    const stmt = db.prepare(`
      INSERT INTO payloads (poolId, amount, type, required, deadline, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `);

    const info = stmt.run(poolId, amount, type, required, deadline || Math.floor(Date.now() / 1000) + 86400);
    
    return NextResponse.json({ id: info.lastInsertRowid, success: true });
  } catch (error) {
    console.error('Failed to create payload:', error);
    return NextResponse.json({ error: 'Failed to create payload' }, { status: 500 });
  }
}
