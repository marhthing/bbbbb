import { NextRequest, NextResponse } from 'next/server'
import { storage } from '../../../lib/storage'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, pairingMethod, phoneNumber } = body
    
    if (!id) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }
    
    if (!pairingMethod) {
      return NextResponse.json(
        { error: 'Pairing method is required' },
        { status: 400 }
      )
    }
    
    // Create session in storage
    const session = await storage.createSession({
      id,
      pairingMethod,
      phoneNumber: phoneNumber || null,
      status: 'pending'
    })
    
    return NextResponse.json({
      message: 'Session created successfully',
      session
    })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const sessions = await storage.getAllSessions()
    
    return NextResponse.json({
      sessions
    })
  } catch (error) {
    console.error('Failed to get sessions:', error)
    return NextResponse.json(
      { error: 'Failed to get sessions' },
      { status: 500 }
    )
  }
}