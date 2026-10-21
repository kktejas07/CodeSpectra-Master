'use client'

import { useState } from 'react'
import { GitBranch, Code2, ChevronRight, Loader } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  getGitHubRepositories,
  initiateGitHubAuth,
  type GitHubRepoListItem,
} from '@/lib/github-service'
import { useToast } from '@/lib/toast-context'
import { useT } from '@/lib/i18n/client'

export function GitHubIntegration() {
  const { t } = useT()
  const addToast = useToast()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [repos, setRepos] = useState<GitHubRepoListItem[]>([])
  const [showRepos, setShowRepos] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const handleConnectGitHub = () => {
    setIsConnecting(true)
    const ok = initiateGitHubAuth()
    if (!ok) {
      addToast({
        type: 'error',
        title: t('tools.githubSignInIsntAvailable'),
        message: t('tools.githubSignInIsntSetUp13c'),
        duration: 8000,
      })
      setIsConnecting(false)
    }
  }

  const handleLoadRepositories = async () => {
    setLoadError(null)
    setIsLoadingRepos(true)
    try {
      const list = await getGitHubRepositories()
      setRepos(list.repositories)
      setShowRepos(true)
      if (!list.success) {
        addToast({
          type: 'error',
          title: t('tools.githubConnectionIssue'),
          message: list.error || t('tools.couldNotLoadRepositoriesMakeSurec83'),
          duration: 6000,
        })
      } else if (list.repositories.length === 0) {
        addToast({
          type: 'info',
          title: t('tools.noRepositoriesLoaded'),
          message: t('tools.connectGithubFirstOrEnsureYour80e'),
          duration: 6000,
        })
      }
    } catch (error) {
      console.error('[CodeSpectra] Failed to load repositories:', error)
      setLoadError(t('tools.couldNotLoadRepositoriesCheckThat15e'))
    } finally {
      setIsLoadingRepos(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Github className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">{t('tools.connectGithub')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t('tools.authorizeCodespectraToListYourRepositori866')}{' '}<strong className="text-foreground">{t('tools.browseRepositories')}</strong>{' '}{t('tools.toLoadTheListUsesYour605')}</p>
          </div>
          <Button onClick={handleConnectGitHub} disabled={isConnecting} className="shrink-0 whitespace-nowrap">
            {isConnecting ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />{t('tools.redirecting')}</>
            ) : (
              <>
                <Github className="mr-2 h-4 w-4" />{t('tools.connectGithub')}</>
            )}
          </Button>
        </div>
      </Card>

      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>{t('tools.repositoryList')}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!showRepos ? (
        <Button onClick={() => void handleLoadRepositories()} disabled={isLoadingRepos} variant="outline" className="w-full">
          {isLoadingRepos ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />{t('tools.loadingRepositories')}</>
          ) : (
            <>
              <GitBranch className="mr-2 h-4 w-4" />{t('tools.browseGithubRepositories')}</>
          )}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{t('tools.yourRepositories')}</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowRepos(false)} className="text-xs">{t('tools.collapse')}</Button>
          </div>

          {repos.length === 0 ? (
            <Card className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('tools.noRepositoriesFoundConnectGithubFirst961')}</p>
            </Card>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {repos.map((repo) => (
                <Card
                  key={repo.id}
                  className="border-border/60 bg-card/30 p-3 transition-all hover:border-primary/50 hover:bg-card/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Code2 className="h-4 w-4 shrink-0 text-primary" />
                        <p className="truncate text-sm font-medium text-foreground">{repo.name}</p>
                      </div>
                      {repo.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{repo.description}</p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {repo.language ? <span>{repo.language}</span> : null}
                        {(repo.stars ?? 0) > 0 ? <span>★ {repo.stars}</span> : null}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="shrink-0">
                      <a href={repo.html_url} target="_blank" rel="noopener noreferrer" aria-label={t('tools.openNameOnGithub', { name: repo.name })}>
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </a>
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
