import { NextRequest, NextResponse } from 'next/server'
import { storage } from '../../../../lib/storage'

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('admin_session')?.value
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    // Verify session exists
    const user = await storage.getUserById(sessionId)
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    
    return NextResponse.json({ 
      user: { id: user.id, username: user.username } 
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}