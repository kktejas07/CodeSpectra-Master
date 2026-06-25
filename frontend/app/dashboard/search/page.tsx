'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Globe, Moon, Sun, Settings } from 'lucide-react'

export default function GlobalSearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchCategory, setSearchCategory] = useState('all')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Mock search results
    const mockResults = [
      { id: '1', title: 'JavaScript Tutorial', category: 'exams', type: 'Exam' },
      { id: '2', title: 'Senior Developer Job', category: 'jobs', type: 'Job' },
      { id: '3', title: 'Web Dev Challenge', category: 'codeathons', type: 'Event' },
      { id: '4', title: 'Python for Data Science', category: 'exams', type: 'Exam' },
      { id: '5', title: 'Frontend Engineer Role', category: 'jobs', type: 'Job' },
    ].filter(r =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (searchCategory === 'all' || r.category === searchCategory)
    )
    setSearchResults(mockResults)
  }

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'exams', label: 'Exams' },
    { id: 'codeathons', label: 'Events' },
    { id: 'resumes', label: 'Resumes' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Search className="w-8 h-8 text-primary" />
          Global Search
        </h1>
        <p className="text-muted-foreground mt-2">Search across jobs, exams, events, and more</p>
      </div>

      {/* Search Bar */}
      <Card className="p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for jobs, exams, events..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-foreground"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSearchCategory(cat.id)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  searchCategory === cat.id
                    ? 'bg-primary text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <Button className="w-full" onClick={handleSearch}>
            Search
          </Button>
        </form>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Found {searchResults.length} results</p>
          {searchResults.map((result) => (
            <Card key={result.id} className="p-4 hover:bg-muted/30 cursor-pointer transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{result.title}</h3>
                  <Badge variant="outline" className="text-xs">
                    {result.type}
                  </Badge>
                </div>
                <Button variant="outline" size="sm">
                  View
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {searchQuery && searchResults.length === 0 && (
        <Card className="p-12 text-center">
          <Search className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">No results found</p>
          <p className="text-muted-foreground text-sm">Try different search terms or filters</p>
        </Card>
      )}
    </div>
  )
}
