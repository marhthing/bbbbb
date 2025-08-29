import { NextRequest, NextResponse } from 'next/server'
import { storage } from '../../../../../lib/storage'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }
    
    const session = await storage.getSession(sessionId)
    
    return NextResponse.json({
      exists: !!session,
      status: session?.status || 'not_found',
      session: session || null
    })
  } catch (error) {
    console.error('Failed to check session:', error)
    return NextResponse.json(
      { error: 'Failed to check session' },
      { status: 500 }
    )
  }
}