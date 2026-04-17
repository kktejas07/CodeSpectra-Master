'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { MessageSquare, Reply, ThumbsUp, ThumbsDown, Trash2, Send } from 'lucide-react'

interface CodeReviewComment {
  id: string
  author: {
    name: string
    avatar: string
    email: string
  }
  content: string
  timestamp: Date
  likes: number
  replies?: CodeReviewComment[]
  isResolved?: boolean
}

interface CodeReviewPanelProps {
  issueId: string
  comments?: CodeReviewComment[]
  onAddComment?: (text: string) => void
  onReply?: (commentId: string, text: string) => void
  onResolve?: (issueId: string) => void
}

export function CodeReviewPanel({
  issueId,
  comments = [],
  onAddComment,
  onReply,
  onResolve,
}: CodeReviewPanelProps) {
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const handleSubmitComment = () => {
    if (!newComment.trim()) return
    onAddComment?.(newComment)
    setNewComment('')
  }

  const handleSubmitReply = (commentId: string) => {
    if (!replyText.trim()) return
    onReply?.(commentId, replyText)
    setReplyText('')
    setReplyingTo(null)
  }

  const CommentThread = ({ comment, depth = 0 }: { comment: CodeReviewComment; depth?: number }) => (
    <div key={comment.id} style={{ marginLeft: depth > 0 ? '24px' : '0' }} className="space-y-3">
      <div className="flex gap-3">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={comment.author.avatar} alt={comment.author.name} />
          <AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm text-foreground">{comment.author.name}</p>
              <p className="text-xs text-foreground/60">{formatDistanceToNow(comment.timestamp, { addSuffix: true })}</p>
            </div>
            <button className="p-1 hover:bg-background rounded text-foreground/60 hover:text-red-600 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-foreground/80 leading-relaxed">{comment.content}</p>

          <div className="flex items-center gap-2 pt-1">
            <button className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground transition">
              <ThumbsUp className="w-3 h-3" />
              {comment.likes}
            </button>
            <button className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground transition">
              <ThumbsDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground transition"
            >
              <Reply className="w-3 h-3" />
              Reply
            </button>
          </div>

          {/* Reply Form */}
          {replyingTo === comment.id && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-foreground/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitReply(comment.id)
                  }
                }}
              />
              <button
                onClick={() => handleSubmitReply(comment.id)}
                className="p-2 hover:bg-background rounded text-foreground/60 hover:text-foreground transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-3">
          {comment.replies.map((reply) => (
            <CommentThread key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Code Review ({comments.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResolve?.(issueId)}
        >
          Mark as Resolved
        </Button>
      </div>

      {/* Comments */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <Card className="bg-card/30 border border-border p-6 text-center">
            <MessageSquare className="w-8 h-8 text-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-foreground/60">No comments yet. Be the first to review!</p>
          </Card>
        ) : (
          <Card className="bg-card/30 border border-border p-4 space-y-4">
            {comments.map((comment) => (
              <CommentThread key={comment.id} comment={comment} />
            ))}
          </Card>
        )}
      </div>

      {/* New Comment Form */}
      <Card className="bg-card/30 border border-border p-4 space-y-3">
        <label className="text-sm font-medium text-foreground">Add Comment</label>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Share your thoughts on this issue..."
          className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-foreground/40 resize-none"
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setNewComment('')}
            disabled={!newComment.trim()}
          >
            Clear
          </Button>
          <Button
            onClick={handleSubmitComment}
            disabled={!newComment.trim()}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Post Comment
          </Button>
        </div>
      </Card>
    </div>
  )
}
