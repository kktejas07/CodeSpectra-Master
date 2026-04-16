'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { X, CheckCircle2, Info, AlertCircle } from 'lucide-react'

interface Notification {
  id: string
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  message: string
  isRead: boolean
  createdAt: string
  action?: { label: string; href: string }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('unread')

  useEffect(() => {
    fetchNotifications()
  }, [filter])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/notifications?filter=${filter}`)
      const data = await res.json()
      setNotifications(data)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' })
      fetchNotifications()
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const handleDelete = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' })
      fetchNotifications()
    } catch (error) {
      console.error('Failed to delete notification:', error)
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Stay updated with your latest news</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {['all', 'unread', 'success', 'warning'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <Card className="p-6 text-center">Loading notifications...</Card>
        ) : notifications.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No notifications</Card>
        ) : (
          notifications.map((notif) => (
            <Card
              key={notif.id}
              className={`p-4 flex gap-4 ${!notif.isRead ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
            >
              <div className="flex-shrink-0 pt-1">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{notif.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">{notif.message}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(notif.createdAt).toLocaleDateString()}</span>
                  {notif.action && (
                    <a href={notif.action.href} className="text-primary hover:underline">
                      {notif.action.label}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {!notif.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkRead(notif.id)}
                  >
                    Mark read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(notif.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
