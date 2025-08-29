import { NextRequest, NextResponse } from 'next/server'
import { storage } from '../../../../../lib/storage'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // Check authentication
    const adminSessionId = request.cookies.get('admin_session')?.value
    if (!adminSessionId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const user = await storage.getUserById(adminSessionId)
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    
    const { sessionId } = await params
    
    // Delete the session
    await storage.deleteSession(sessionId)
    
    return NextResponse.json({ message: 'Session deleted successfully' })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    )
  }
}