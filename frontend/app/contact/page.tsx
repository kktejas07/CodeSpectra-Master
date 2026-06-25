'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Mail, Phone, MapPin } from 'lucide-react'

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setFormData({ name: '', email: '', subject: '', message: '' })
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
          Get in Touch
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Have a question? We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
        </p>
      </div>

      {/* Contact Section */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-20">
        <div className="grid md:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Message</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground resize-none"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Send Message
              </Button>
              {submitted && (
                <p className="text-green-600 text-sm text-center">
                  Thank you! We&apos;ll get back to you soon.
                </p>
              )}
            </form>
          </div>

          {/* Contact Info */}
          <div className="space-y-8">
            <Card className="p-6">
              <Mail className="w-6 h-6 text-primary mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Email</h3>
              <a href="mailto:support@codespectra.dev" className="text-muted-foreground hover:text-foreground">
                support@codespectra.dev
              </a>
            </Card>

            <Card className="p-6">
              <Phone className="w-6 h-6 text-primary mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Phone</h3>
              <a href="tel:+1234567890" className="text-muted-foreground hover:text-foreground">
                +1 (234) 567-890
              </a>
            </Card>

            <Card className="p-6">
              <MapPin className="w-6 h-6 text-primary mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Address</h3>
              <p className="text-muted-foreground">
                San Francisco, CA<br />
                United States
              </p>
            </Card>

            <Card className="p-6 bg-primary/5 border-primary/20">
              <h3 className="text-lg font-semibold text-foreground mb-3">Business Hours</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Monday - Friday: 9:00 AM - 6:00 PM PT</p>
                <p>Saturday - Sunday: Closed</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
