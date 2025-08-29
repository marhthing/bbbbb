"use client"

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/utils'

interface Session {
  id: string
  phoneNumber: string | null
  status: string
  pairingMethod: string | null
  createdAt: string
  connectedAt: string | null
}

interface Stats {
  total: number
  active: number
  pending: number
  disconnected: number
  failed: number
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Check authentication on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/auth-check')
        if (response.ok) {
          setIsAuthenticated(true)
        } else {
          window.location.href = '/admin'
        }
      } catch {
        window.location.href = '/admin'
      }
    }
    checkAuth()
  }, [])

  // Get dashboard stats
  const { data: stats } = useQuery<Stats>({
    queryKey: ['/api/admin/stats'],
    queryFn: async () => {
      const response = await fetch('/api/admin/stats')
      if (!response.ok) throw new Error('Failed to fetch stats')
      return response.json()
    },
    enabled: isAuthenticated,
  })

  // Get all sessions with pagination
  const [currentPage, setCurrentPage] = useState(1)
  const sessionsPerPage = 15
  
  const { data: allSessions } = useQuery<Session[]>({
    queryKey: ['/api/admin/sessions'],
    queryFn: async () => {
      const response = await fetch('/api/admin/sessions')
      if (!response.ok) throw new Error('Failed to fetch sessions')
      return response.json()
    },
    enabled: isAuthenticated,
  })

  // Calculate pagination
  const totalPages = Math.ceil((allSessions?.length || 0) / sessionsPerPage)
  const startIndex = (currentPage - 1) * sessionsPerPage
  const endIndex = startIndex + sessionsPerPage
  const sessions = allSessions?.slice(startIndex, endIndex) || []

  // Delete session mutation
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/sessions/${sessionId}`)
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] })
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sessions'] })
      toast({
        title: "Success",
        description: "Session deleted successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete session",
        variant: "destructive",
      })
    },
  })

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>
  }

  const handleLogout = () => {
    fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin'
  }

  const handleDeleteSession = (sessionId: string) => {
    if (confirm('Are you sure you want to delete this session?')) {
      deleteMutation.mutate(sessionId)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600'
      case 'pending': return 'text-yellow-600'
      case 'failed': return 'text-red-600'
      case 'disconnected': return 'text-gray-600'
      default: return 'text-gray-600'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <Button onClick={handleLogout} variant="outline" data-testid="button-logout">
            Logout
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats?.total || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-active">{stats?.active || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="stat-pending">{stats?.pending || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Disconnected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600" data-testid="stat-disconnected">{stats?.disconnected || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Sessions Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>WhatsApp Sessions</CardTitle>
            {allSessions && allSessions.length > 0 && (
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1}-{Math.min(endIndex, allSessions.length)} of {allSessions.length} sessions
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Session ID</th>
                    <th className="text-left p-3 font-medium">Phone Number</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Method</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-left p-3 font-medium">Connected</th>
                    <th className="text-left p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions?.map((session) => (
                    <tr key={session.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs" data-testid={`session-id-${session.id}`}>
                        {session.id.substring(0, 8)}...
                      </td>
                      <td className="p-3" data-testid={`session-phone-${session.id}`}>
                        {session.phoneNumber || 'N/A'}
                      </td>
                      <td className="p-3">
                        <span className={`font-medium ${getStatusColor(session.status)}`} data-testid={`session-status-${session.id}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="p-3" data-testid={`session-method-${session.id}`}>
                        {session.pairingMethod || 'N/A'}
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {session.connectedAt ? new Date(session.connectedAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${session.id}`}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sessions?.length && (
                <div className="text-center py-8 text-gray-500">
                  {allSessions?.length === 0 ? 'No sessions found' : 'No sessions on this page'}
                </div>
              )}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
                <div className="text-sm text-gray-500">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}