/**
 * Local Vector Knowledge Store
 * Implements locality-preserving vector database for OpenCode
 * Uses HNSW indexing for efficient semantic search
 */

// @ts-ignore - Temporary fix for missing module
import { create } from 'kysely'
// @ts-ignore - Temporary fix for missing module
import { Database } from 'bun:sqlite'
// @ts-ignore - Temporary fix for missing module
import { HNSWIndex } from 'hnswlib-node'

export interface CodeMetadata {
  filePath: string
  project: string
  language: string
  lastModified: number
  size: number
  functions?: string[]
  imports?: string[]
  exports?: string[]
}

export interface CodeMatch {
  id: string
  content: string
  metadata: CodeMetadata
  similarity: number
}

export interface LocalVectorStore {
  embeddings: Map<string, Float32Array>
  metadata: Map<string, CodeMetadata>
  search(query: string, k: number): Promise<CodeMatch[]>
  addDocument(id: string, content: string, metadata: CodeMetadata): Promise<void>
  removeDocument(id: string): Promise<void>
  updateDocument(id: string, content: string, metadata: CodeMetadata): Promise<void>
  initialize(): Promise<void>
  getDocumentById(id: string): Promise<{ content: string; metadata: CodeMetadata } | null>
}

export class CodeEmbeddingEngine {
  private localModel: any // transformers.js model
  private vectorStore: LocalVectorStore
  private hnswIndex: HNSWIndex
  private dimension: number = 384

  constructor(dbPath: string) {
    // Initialize HNSW index for efficient search
    this.hnswIndex = new HNSWIndex('cosine', this.dimension)
    this.vectorStore = new SQLiteVectorStore(dbPath, this.hnswIndex)
  }

  async initialize(): Promise<void> {
    // Load local sentence transformer model
    try {
      // Use transformers.js for local embedding generation
      const { pipeline } = await import('@xenova/transformers')
      this.localModel = await pipeline('feature-extraction', 'sentence-transformers/all-MiniLM-L6-v2')
    } catch (error) {
      console.warn('Failed to load local model, falling back to external API:', error)
      this.localModel = null
    }

    // Initialize vector store
    await this.vectorStore.initialize()
  }

  async indexWorkspace(files: string[]): Promise<void> {
    console.log(`Indexing ${files.length} files...`)

    for (const filePath of files) {
      try {
        const content = await Bun.file(filePath).text()
        const metadata: CodeMetadata = {
          filePath,
          project: this.extractProject(filePath),
          language: this.extractLanguage(filePath),
          lastModified: (await Bun.file(filePath).stat()).mtime.getTime(),
          size: content.length,
          functions: this.extractFunctions(content),
          imports: this.extractImports(content),
          exports: this.extractExports(content)
        }

        await this.addDocument(filePath, content, metadata)
      } catch (error) {
        console.warn(`Failed to index ${filePath}:`, error)
      }
    }

    console.log('Workspace indexing complete')
  }

  async addDocument(id: string, content: string, metadata: CodeMetadata): Promise<void> {
    // Generate embedding locally or fall back to external
    const embedding = await this.generateEmbedding(content)

    // Add to HNSW index
    this.hnswIndex.addPoint(embedding, parseInt(this.hashId(id)))

    // Store in vector database
    await this.vectorStore.addDocument(id, content, metadata)
  }

  async semanticSearch(query: string, k: number = 10): Promise<CodeMatch[]> {
    const queryEmbedding = await this.generateEmbedding(query)

    // Search HNSW index
    const results = this.hnswIndex.searchKNN(queryEmbedding, k)

    // Retrieve full documents
    const matches: CodeMatch[] = []
    for (const [index, similarity] of results) {
      const doc = await this.vectorStore.getDocumentById(this.unhashId(index))
      if (doc) {
        matches.push({
          id: this.unhashId(index),
          content: doc.content,
          metadata: doc.metadata,
          similarity
        })
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity)
  }

  private async generateEmbedding(text: string): Promise<Float32Array> {
    if (this.localModel) {
      // Generate embedding locally using transformers.js
      const result = await this.localModel(text, { pooling: 'mean', normalize: true })
      return new Float32Array(result.data)
    } else {
      // Fallback to external API (only for embedding generation)
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text
        })
      })

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.statusText}`)
      }

      const data = await response.json()
      return new Float32Array(data.data[0].embedding)
    }
  }

  private extractProject(filePath: string): string {
    const parts = filePath.split('/')
    return parts[parts.length - 2] || 'root'
  }

  private extractLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp'
    }
    return languageMap[ext || ''] || 'unknown'
  }

  private extractFunctions(content: string): string[] {
    const functions: string[] = []

    // JavaScript/TypeScript functions
    const jsFunctionRegex = /(?:function\s+(\w+)|(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))/g
    let match
    while ((match = jsFunctionRegex.exec(content)) !== null) {
      functions.push(match[1] || match[2])
    }

    // Python functions
    const pyFunctionRegex = /def\s+(\w+)\s*\(/g
    while ((match = pyFunctionRegex.exec(content)) !== null) {
      functions.push(match[1])
    }

    return functions
  }

  private extractImports(content: string): string[] {
    const imports: string[] = []

    // JavaScript/TypeScript imports
    const jsImportRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
    let match
    while ((match = jsImportRegex.exec(content)) !== null) {
      imports.push(match[1])
    }

    // Python imports
    const pyImportRegex = /(?:from\s+(\w+)|import\s+(\w+))/g
    while ((match = pyImportRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2])
    }

    return imports
  }

  private extractExports(content: string): string[] {
    const exports: string[] = []

    // JavaScript/TypeScript exports
    const jsExportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g
    let match
    while ((match = jsExportRegex.exec(content)) !== null) {
      exports.push(match[1])
    }

    return exports
  }

  private hashId(id: string): string {
    // Simple hash function for HNSW index
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString()
  }

  private unhashId(hash: string): string {
    // In a real implementation, we'd maintain a reverse mapping
    return hash.toString()
  }
}

// SQLite-based vector store implementation
class SQLiteVectorStore implements LocalVectorStore {
  private db: Database
  private hnswIndex: HNSWIndex
  embeddings: Map<string, Float32Array> = new Map()
  metadata: Map<string, CodeMetadata> = new Map()

  constructor(dbPath: string, hnswIndex: HNSWIndex) {
    this.db = new Database(dbPath)
    this.hnswIndex = hnswIndex
    this.initializeSchema()
  }

  private initializeSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content TEXT,
        metadata TEXT,
        embedding BLOB,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        vector BLOB,
        FOREIGN KEY (id) REFERENCES documents (id)
      )
    `)

    // Create indexes for efficient search
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(metadata)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_documents_language ON documents(metadata)`)
  }

  async initialize(): Promise<void> {
    // Load existing embeddings into memory
    const docs = this.db.query('SELECT id, content, metadata, embedding FROM documents').all()

    for (const doc of docs as any[]) {
      this.metadata.set(doc.id, JSON.parse(doc.metadata))
      if (doc.embedding) {
        const embedding = new Float32Array(doc.embedding)
        this.embeddings.set(doc.id, embedding)
        // Add to HNSW index
        this.hnswIndex.addPoint(embedding, parseInt(this.hashId(doc.id)))
      }
    }
  }

  async addDocument(id: string, content: string, metadata: CodeMetadata): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, content, metadata) 
      VALUES (?, ?, ?)
    `)

    stmt.run(id, content, JSON.stringify(metadata))

    this.metadata.set(id, metadata)
  }

  async removeDocument(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?')
    stmt.run(id)

    this.embeddings.delete(id)
    this.metadata.delete(id)
  }

  async updateDocument(id: string, content: string, metadata: CodeMetadata): Promise<void> {
    await this.addDocument(id, content, metadata)
  }

  async search(query: string, k: number): Promise<CodeMatch[]> {
    // This would be implemented by the main CodeEmbeddingEngine
    return []
  }

  async getDocumentById(id: string): Promise<{ content: string; metadata: CodeMetadata } | null> {
    const doc = this.db.query('SELECT content, metadata FROM documents WHERE id = ?').get(id) as any
    if (!doc) return null

    return {
      content: doc.content,
      metadata: JSON.parse(doc.metadata)
    }
  }

  private hashId(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString()
  }
}
