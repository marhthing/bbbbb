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
    
    // Get session stats
    const stats = await storage.getSessionStats()
    
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Failed to get stats:', error)
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    )
  }
}