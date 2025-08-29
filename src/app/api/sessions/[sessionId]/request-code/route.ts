import { NextRequest, NextResponse } from 'next/server'
import { whatsappService } from '../../../../../lib/whatsapp-service'
import { storage } from '../../../../../lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const body = await request.json()
    const { phoneNumber } = body
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }
    
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }
    
    // Check if session exists, if not create it
    let session = await storage.getSession(sessionId)
    if (!session) {
      session = await storage.createSession({
        id: sessionId,
        phoneNumber,
        status: 'pending',
        pairingMethod: 'code'
      })
    } else {
      // Update existing session
      session = await storage.updateSession(sessionId, {
        phoneNumber,
        status: 'pending',
        pairingMethod: 'code'
      })
    }
    
    // Request pairing code
    const result = await whatsappService.requestPairingCode(sessionId, phoneNumber)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to request pairing code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to request pairing code' },
      { status: 500 }
    )
  }
}