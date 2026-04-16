'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, Trash2, Check, CheckCircle2, Info, AlertCircle } from 'lucide-react'
import { useToast } from '@/lib/toast-context'

interface Notification {
  id: string
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  message: string
  read: boolean
  createdAt: string
  action?: { label: string; href: string }
}

export default function NotificationsPage() {
  const toast = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUnread, setFilterUnread] = useState(false)

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setNotifications(data)
    } catch (error) {
      console.error('[v0] Failed to fetch notifications:', error)
      toast({
        type: 'error',
        title: 'Failed to load notifications',
        message: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleMarkRead = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to update')
      fetchNotifications()
    } catch (error) {
      console.error('[v0] Failed to mark as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to update')
      toast({
        type: 'success',
        title: 'All marked as read',
      })
      fetchNotifications()
    } catch (error) {
      console.error('[v0] Failed to mark all as read:', error)
    }
  }

  const handleDelete = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast({
        type: 'success',
        title: 'Notification deleted',
      })
      fetchNotifications()
    } catch (error) {
      console.error('[v0] Failed to delete notification:', error)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-600" />
      case 'error': return <AlertCircle className="w-5 h-5 text-red-600" />
      default: return <Info className="w-5 h-5 text-blue-600" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-500/20 text-green-700'
      case 'error': return 'bg-red-500/20 text-red-700'
      case 'warning': return 'bg-yellow-500/20 text-yellow-700'
      default: return 'bg-blue-500/20 text-blue-700'
    }
  }

  const filteredNotifications = filterUnread
    ? notifications.filter(n => !n.read)
    : notifications

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <Bell className="w-8 h-8" />
            Notifications
          </h1>
          <p className="text-foreground/60">Stay updated with all your activity and alerts</p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={handleMarkAllAsRead} variant="outline">
            <Check className="w-4 h-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-foreground/60 mb-1">Total Notifications</p>
          <p className="text-2xl font-bold">{notifications.length}</p>
        </Card>
        <Card className="p-4 border-blue-500/30">
          <p className="text-sm text-foreground/60 mb-1">Unread</p>
          <p className="text-2xl font-bold text-blue-600">{unreadCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-foreground/60 mb-1">Filter</p>
          <Button
            variant={filterUnread ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterUnread(!filterUnread)}
            className="w-full"
          >
            {filterUnread ? 'Unread Only' : 'Show All'}
          </Button>
        </Card>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="p-12 text-center">
            <p className="text-foreground/60">Loading notifications...</p>
          </Card>
        ) : filteredNotifications.length === 0 ? (
          <Card className="p-12 text-center text-foreground/60">
            {filterUnread ? 'No unread notifications' : 'No notifications yet. You&apos;re all caught up!'}
          </Card>
        ) : (
          filteredNotifications.map((notif) => (
            <Card
              key={notif.id}
              className={`p-5 flex items-start gap-4 transition-all ${
                !notif.read ? 'border-l-4 border-l-blue-500 bg-foreground/5' : ''
              }`}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${getTypeColor(notif.type)}`}>
                {getIcon(notif.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className={`font-semibold ${!notif.read ? 'text-foreground' : 'text-foreground/70'}`}>
                    {notif.title}
                  </h3>
                  {!notif.read && (
                    <Badge className="bg-blue-500 text-white">New</Badge>
                  )}
                </div>
                <p className="text-sm text-foreground/60 mb-3">{notif.message}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground/50">
                    {new Date(notif.createdAt).toLocaleDateString()} at {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex gap-2">
                    {!notif.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkRead(notif.id)}
                        className="text-xs"
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    )}
                    {notif.action && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.location.href = notif.action?.href || '#'}
                        className="text-xs"
                      >
                        {notif.action.label}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(notif.id)}
                      className="text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
