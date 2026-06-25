'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Github, Search, Link as LinkIcon, Check, Loader } from 'lucide-react'
import { getGitHubRepositories, linkGitHubRepository } from '@/lib/github-service'

interface Repository {
  id: number
  name: string
  full_name: string
  description: string
  url: string
  html_url: string
  language: string
  stargazers_count: number
  is_private: boolean
  is_linked?: boolean
}

interface GitHubRepositorySelectorProps {
  onRepoSelect?: (repo: Repository) => void
}

export function GitHubRepositorySelector({ onRepoSelect }: GitHubRepositorySelectorProps) {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [linkingRepo, setLinkingRepo] = useState<number | null>(null)

  useEffect(() => {
    fetchRepositories()
  }, [])

  useEffect(() => {
    const filtered = repositories.filter(repo =>
      repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredRepos(filtered)
  }, [searchTerm, repositories])

  const fetchRepositories = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getGitHubRepositories()
      if (result.success) {
        setRepositories(result.repositories || [])
        setFilteredRepos(result.repositories || [])
      } else {
        setError(result.error || 'Failed to fetch repositories')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleLinkRepository = async (repo: Repository) => {
    setLinkingRepo(repo.id)
    try {
      const result = await linkGitHubRepository(repo.id, repo.name, repo.url)
      if (result.success) {
        // Update local state
        setRepositories(prev =>
          prev.map(r => (r.id === repo.id ? { ...r, is_linked: true } : r))
        )
        setFilteredRepos(prev =>
          prev.map(r => (r.id === repo.id ? { ...r, is_linked: true } : r))
        )
        onRepoSelect?.(repo)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link repository')
    } finally {
      setLinkingRepo(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Github className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Your Repositories</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Select a repository to start analyzing its code quality
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 bg-card border-border"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Repositories List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading repositories...</p>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="text-center py-12">
          <Github className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No repositories found' : 'No repositories available'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRepos.map(repo => (
            <Card key={repo.id} className="p-4 bg-card border-border hover:border-primary/50 transition-colors">
              <div className="space-y-3">
                {/* Repo Info */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-primary hover:underline"
                      >
                        {repo.full_name}
                      </a>
                      <p className="text-sm text-muted-foreground">{repo.description}</p>
                    </div>
                    {repo.is_private && (
                      <span className="text-xs px-2 py-1 bg-secondary rounded font-medium">
                        Private
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {repo.language && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      {repo.language}
                    </span>
                  )}
                  <span>⭐ {repo.stargazers_count}</span>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => handleLinkRepository(repo)}
                  disabled={linkingRepo === repo.id || repo.is_linked}
                  className="w-full gap-2"
                  variant={repo.is_linked ? 'outline' : 'default'}
                >
                  {linkingRepo === repo.id ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Linking...
                    </>
                  ) : repo.is_linked ? (
                    <>
                      <Check className="w-4 h-4" />
                      Linked
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4" />
                      Link Repository
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Refresh Button */}
      <Button
        onClick={fetchRepositories}
        variant="outline"
        disabled={loading}
        className="w-full gap-2"
      >
        <Github className="w-4 h-4" />
        Refresh Repositories
      </Button>
    </div>
  )
}
