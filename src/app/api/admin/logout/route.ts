import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out successfully' })
  
  // Clear session cookie
  response.cookies.delete('admin_session')
  
  return response
}