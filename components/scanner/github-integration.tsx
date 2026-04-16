'use client'

import { useState } from 'react'
import { Github, GitBranch, Code2, ChevronRight, Loader } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getGitHubRepositories, initiateGitHubAuth } from '@/lib/github-service'

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string
  language: string
  stars: number
  updated_at: string
}

export function GitHubIntegration() {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [showRepos, setShowRepos] = useState(false)

  const handleConnectGitHub = async () => {
    setIsConnecting(true)
    try {
      initiateGitHubAuth()
    } catch (error) {
      console.error('[v0] GitHub connection error:', error)
      setIsConnecting(false)
    }
  }

  const handleLoadRepositories = async () => {
    setIsLoadingRepos(true)
    try {
      const repositories = await getGitHubRepositories()
      setRepos(repositories)
      setShowRepos(true)
    } catch (error) {
      console.error('[v0] Failed to load repositories:', error)
    } finally {
      setIsLoadingRepos(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* GitHub Connection Section */}
      <Card className="bg-card/50 border border-border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Github className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Connect GitHub Account</h3>
            </div>
            <p className="text-sm text-foreground/60">
              Connect your GitHub account to scan repositories directly, track code quality across commits, and enable automated analysis.
            </p>
          </div>
          <Button
            onClick={handleConnectGitHub}
            disabled={isConnecting}
            className="whitespace-nowrap"
          >
            {isConnecting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Github className="w-4 h-4 mr-2" />
                Connect GitHub
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Repository Browser */}
      {!showRepos ? (
        <Button
          onClick={handleLoadRepositories}
          disabled={isLoadingRepos}
          variant="outline"
          className="w-full"
        >
          {isLoadingRepos ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Loading repositories...
            </>
          ) : (
            <>
              <GitBranch className="w-4 h-4 mr-2" />
              Browse GitHub Repositories
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Your Repositories</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRepos(false)}
              className="text-xs"
            >
              Change
            </Button>
          </div>

          {repos.length === 0 ? (
            <Card className="bg-card/30 border border-border p-4 text-center">
              <p className="text-sm text-foreground/60">No repositories found</p>
            </Card>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {repos.map((repo) => (
                <Card
                  key={repo.id}
                  className="bg-card/30 border border-border p-3 hover:bg-card/50 hover:border-primary/50 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
                        <p className="font-medium text-sm text-foreground truncate">{repo.name}</p>
                      </div>
                      {repo.description && (
                        <p className="text-xs text-foreground/60 line-clamp-2">{repo.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-foreground/50">
                        {repo.language && <span>{repo.language}</span>}
                        {repo.stars > 0 && <span>★ {repo.stars}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-shrink-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
