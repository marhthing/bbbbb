import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST() {
  try {
    const sessionId = uuidv4()
    
    return NextResponse.json({
      sessionId,
      message: 'Session ID generated successfully'
    })
  } catch (error) {
    console.error('Failed to generate session ID:', error)
    return NextResponse.json(
      { error: 'Failed to generate session ID' },
      { status: 500 }
    )
  }
}