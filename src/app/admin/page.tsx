"use client"

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/utils'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const { toast } = useToast()

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/login", {
        username,
        password
      })
      return response.json()
    },
    onSuccess: () => {
      setIsLoggedIn(true)
      toast({
        title: "Success",
        description: "Logged in successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error?.message || "Login failed",
        variant: "destructive",
      })
    },
  })

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      toast({
        title: "Error",
        description: "Please enter username and password",
        variant: "destructive",
      })
      return
    }
    loginMutation.mutate()
  }

  if (isLoggedIn) {
    // Redirect to dashboard - for now just show a simple redirect
    window.location.href = '/admin/dashboard'
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-username"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}