'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, FileIcon, FolderIcon, Code2, GitBranch, Loader } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  analyzeCode,
  getFileContent,
  getGitHubRepositories,
  getRepositoryFiles,
  type GitHubRepoListItem,
} from '@/lib/github-service'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  children?: FileNode[]
}

interface RepositoryBrowserProps {
  onSelectRepository?: (repo: GitHubRepoListItem) => void
  onSelectFile?: (file: FileNode, repo: GitHubRepoListItem) => void
  /** Called after `/api/analyze-code` succeeds for a GitHub file (includes `scanId` when persisted). */
  onGitHubScanResult?: (payload: Record<string, unknown>) => void
  /** Parent can show a spinner while a file scan runs. */
  scanBusy?: boolean
  onScanBusyChange?: (busy: boolean) => void
}

function guessLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    scala: 'scala',
    md: 'markdown',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    vue: 'javascript',
    svelte: 'javascript',
  }
  return map[ext] || 'javascript'
}

export function RepositoryBrowser({
  onSelectRepository,
  onSelectFile,
  onGitHubScanResult,
  scanBusy,
  onScanBusyChange,
}: RepositoryBrowserProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoListItem | null>(null)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [repos, setRepos] = useState<GitHubRepoListItem[]>([])
  const [loadingRepos, setLoadingRepos] = useState(true)
  const [repoError, setRepoError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingRepos(true)
      setRepoError(null)
      try {
        const list = await getGitHubRepositories(1)
        if (!cancelled) {
          setRepos(Array.isArray(list) ? list : [])
          if (list.length === 0) {
            setRepoError('No repositories returned — connect GitHub or ensure you have accessible repos.')
          }
        }
      } catch {
        if (!cancelled) setRepoError('Could not load repositories.')
      } finally {
        if (!cancelled) setLoadingRepos(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleFolder = (path: string) => {
    const newSet = new Set(expandedFolders)
    if (newSet.has(path)) {
      newSet.delete(path)
    } else {
      newSet.add(path)
    }
    setExpandedFolders(newSet)
  }

  const runGitHubFileScan = useCallback(
    async (file: FileNode, repo: GitHubRepoListItem) => {
      if (!onGitHubScanResult || !repo.owner?.login) return
      onScanBusyChange?.(true)
      try {
        const owner = repo.owner.login
        const name = repo.name
        const fc = await getFileContent(owner, name, file.path)
        if (fc?.error || typeof fc?.content !== 'string') {
          console.error('[CodeSpectra] file content:', fc?.error)
          return
        }
        const lang = guessLanguageFromPath(file.path)
        const result = await analyzeCode(fc.content, lang, file.path, undefined, {
          github_repo_owner: owner,
          github_repo_name: name,
          github_file_path: file.path,
          github_repo_url: `https://github.com/${repo.full_name}`,
          github_branch: 'HEAD',
        })
        if (result?.error) {
          console.error('[CodeSpectra] analyze from GitHub:', result.error)
          return
        }
        onGitHubScanResult({
          ...(result as Record<string, unknown>),
          scanned_code: fc.content,
        })
      } finally {
        onScanBusyChange?.(false)
      }
    },
    [onGitHubScanResult, onScanBusyChange]
  )

  const handleSelectRepository = async (repo: GitHubRepoListItem) => {
    setSelectedRepo(repo)
    onSelectRepository?.(repo)

    setIsLoadingFiles(true)
    try {
      if (!repo.owner?.login) {
        setFileTree([])
        return
      }
      const files = await getRepositoryFiles(repo.owner.login, repo.name)
      if (Array.isArray(files)) {
        setFileTree(files as FileNode[])
      } else if (files?.success === false) {
        setFileTree([])
        console.error(files.error)
      } else {
        setFileTree([])
      }
    } catch (error) {
      console.error('[CodeSpectra] Failed to load file tree:', error)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  const FileTreeItem = ({ file, depth = 0 }: { file: FileNode; depth?: number }) => {
    const isExpanded = expandedFolders.has(file.path)
    const isFolder = file.type === 'dir'

    return (
      <div key={file.path}>
        <div
          className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent"
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(file.path)
            } else if (selectedRepo) {
              onSelectFile?.(file, selectedRepo)
              void runGitHubFileScan(file, selectedRepo)
            }
          }}
        >
          {isFolder && (
            <button
              type="button"
              className="rounded p-0 hover:bg-background"
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(file.path)
              }}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
          {!isFolder && <span className="w-4" />}

          {isFolder ? (
            <FolderIcon className="h-4 w-4 text-yellow-500" />
          ) : (
            <FileIcon className="h-4 w-4 text-blue-500" />
          )}

          <span className="font-medium text-foreground">{file.name}</span>
        </div>

        {isFolder && isExpanded && file.children && (
          <div>
            {file.children.map((child) => (
              <FileTreeItem key={child.path} file={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!selectedRepo && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Code2 className="h-5 w-5" />
            Select repository
          </h3>
          <p className="text-sm text-foreground/60">
            Pick a repo, then open a file to scan it. Scans are saved when you are signed in (same history as manual
            mode).
          </p>
          {loadingRepos ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader className="h-5 w-5 animate-spin" />
              Loading repositories…
            </div>
          ) : repoError ? (
            <p className="text-sm text-destructive">{repoError}</p>
          ) : (
            <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => void handleSelectRepository(repo)}
                  className="rounded-lg border border-border bg-card/40 p-3 text-left text-sm transition hover:border-primary/50 hover:bg-accent/40"
                >
                  <p className="font-medium text-foreground">{repo.full_name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{repo.description || '—'}</p>
                  {repo.language ? (
                    <p className="mt-2 text-xs text-muted-foreground">{repo.language}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedRepo && (
        <Card className="space-y-4 border border-border bg-card/30 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-foreground">{selectedRepo.name}</h4>
              </div>
              <p className="text-xs text-foreground/60">{selectedRepo.full_name}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedRepo(null)
                setFileTree([])
                setExpandedFolders(new Set())
              }}
            >
              Change
            </Button>
          </div>

          {scanBusy ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader className="h-3.5 w-3.5 animate-spin" />
              Running scan…
            </p>
          ) : null}

          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {fileTree.length > 0 ? (
                fileTree.map((file) => <FileTreeItem key={file.path} file={file} />)
              ) : (
                <p className="py-4 text-sm text-foreground/60">No files found</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
