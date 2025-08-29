import { NextRequest, NextResponse } from 'next/server'
import { storage } from '../../../../lib/storage'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const sessionId = request.cookies.get('admin_session')?.value
    if (!sessionId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const user = await storage.getUserById(sessionId)
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    
    // Get all sessions
    const sessions = await storage.getAllSessionsForAdmin()
    
    return NextResponse.json(sessions)
  } catch (error) {
    console.error('Failed to get sessions:', error)
    return NextResponse.json(
      { error: 'Failed to get sessions' },
      { status: 500 }
    )
  }
}