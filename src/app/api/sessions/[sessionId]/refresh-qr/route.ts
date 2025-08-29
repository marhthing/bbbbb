import { NextRequest, NextResponse } from 'next/server'
import { whatsappService } from '../../../../../lib/whatsapp-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }
    
    // Stop current session and restart QR pairing
    whatsappService.cleanupSession(sessionId)
    const result = await whatsappService.startQRPairing(sessionId)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to refresh QR code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh QR code' },
      { status: 500 }
    )
  }
}