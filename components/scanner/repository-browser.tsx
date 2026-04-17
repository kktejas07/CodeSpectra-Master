'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, FileIcon, FolderIcon, Code2, GitBranch, Loader } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LanguageBadge } from '@/components/ui/language-badge'

interface Repository {
  id: number
  name: string
  full_name: string
  description: string
  language: string
  stars: number
  updated_at: string
  owner: {
    login: string
    avatar_url: string
  }
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  children?: FileNode[]
}

interface RepositoryBrowserProps {
  onSelectRepository?: (repo: Repository) => void
  onSelectFile?: (file: FileNode) => void
}

export function RepositoryBrowser({ onSelectRepository, onSelectFile }: RepositoryBrowserProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [fileTree, setFileTree] = useState<FileNode[]>([])

  const toggleFolder = (path: string) => {
    const newSet = new Set(expandedFolders)
    if (newSet.has(path)) {
      newSet.delete(path)
    } else {
      newSet.add(path)
    }
    setExpandedFolders(newSet)
  }

  const handleSelectRepository = async (repo: Repository) => {
    setSelectedRepo(repo)
    onSelectRepository?.(repo)
    
    // Load file tree
    setIsLoadingFiles(true)
    try {
      const response = await fetch(`/api/github/repo-files?owner=${repo.owner.login}&repo=${repo.name}`)
      if (response.ok) {
        const files = await response.json()
        setFileTree(files)
      }
    } catch (error) {
      console.error('[v0] Failed to load file tree:', error)
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
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent rounded text-sm"
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(file.path)
            } else {
              onSelectFile?.(file)
            }
          }}
        >
          {isFolder && (
            <button
              className="p-0 hover:bg-background rounded"
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(file.path)
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          {!isFolder && <span className="w-4" />}

          {isFolder ? (
            <FolderIcon className="w-4 h-4 text-yellow-500" />
          ) : (
            <FileIcon className="w-4 h-4 text-blue-500" />
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
      {/* Repository Selection */}
      {!selectedRepo && (
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Code2 className="w-5 h-5" />
            Select Repository
          </h3>
          <p className="text-sm text-foreground/60">
            Choose a repository to scan. You can select individual files or scan the entire repository.
          </p>
        </div>
      )}

      {/* File Tree */}
      {selectedRepo && (
        <Card className="bg-card/30 border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" />
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

          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {fileTree.length > 0 ? (
                fileTree.map((file) => <FileTreeItem key={file.path} file={file} />)
              ) : (
                <p className="text-sm text-foreground/60 py-4">No files found</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
