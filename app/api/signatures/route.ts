import { NextResponse } from 'next/server';
import db from '../../lib/db';
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payloadId = searchParams.get('payloadId');
    if (!payloadId) {
      return NextResponse.json({ error: 'Missing payloadId' }, { status: 400 });
    }

    const stmt = db.prepare('SELECT signerAddress, signatureHash FROM signatures WHERE payloadId = ?');
    const signatures = stmt.all(payloadId);
    
    return NextResponse.json(signatures);
  } catch (error) {
    console.error('Failed to fetch signatures:', error);
    return NextResponse.json({ error: 'Failed to fetch signatures' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { payloadId, signerAddress, signatureHash } = body;

    const stmt = db.prepare(`
      INSERT INTO signatures (payloadId, signerAddress, signatureHash)
      VALUES (?, ?, ?)
    `);

    stmt.run(payloadId, signerAddress, signatureHash);
    
    // Check if we reached required signatures
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM signatures WHERE payloadId = ?');
    const payloadStmt = db.prepare('SELECT required FROM payloads WHERE id = ?');
    
    const count = (countStmt.get(payloadId) as any).count;
    const required = (payloadStmt.get(payloadId) as any).required;

    if (count >= required) {
       // Update payload status to READY
       db.prepare('UPDATE payloads SET status = ? WHERE id = ?').run('READY', payloadId);
    }

    return NextResponse.json({ success: true, count, required });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Already signed by this address' }, { status: 400 });
    }
    console.error('Failed to save signature:', error);
    return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 });
  }
}
