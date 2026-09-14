import { useState } from 'react'
import { Icon } from './Icon'
import { MaterialRun } from './MaterialRun'
import { groupMessages, formatTime } from '../lib/groupMessages'

export function SearchPanel({
  messages,
  onClose,
  onJump,
  onShare,
  onFeedback,
  onSearch,
}) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState([])

  const ids = new Set(results.map((m) => m.id))
  const groups = groupMessages(messages).flatMap((g) =>
    g.items
      ? g.items.some((m) => ids.has(m.id))
        ? [{ ...g, items: g.items.filter((m) => ids.has(m.id)) }]
        : []
      : ids.has(g.id)
        ? [g]
        : []
  )

  function search(e) {
    e.preventDefault()
    const tokens =
      query
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter(
          (t) =>
            t.length > 2 &&
            ![
              'what',
              'did',
              'the',
              'our',
              'about',
              'have',
              'anything',
              'save',
              'saved',
              'can',
              'with',
              'that',
              'for',
            ].includes(t)
        ) || []
    const found = tokens.length
      ? messages.filter((m) =>
          tokens.some((t) =>
            `${m.body} ${m.share?.title || ''} ${m.share?.description || ''}`
              .toLowerCase()
              .includes(t)
          )
        )
      : []
    setResults(found)
    setSubmitted(query.trim())
    setSearched(true)
    onSearch?.({ query: query.trim(), sourceIds: found.map((m) => m.id) })
  }

  return (
    <aside className="search-panel" aria-label="Search results">
      <div className="panel-heading">
        <h2>Search conversation</h2>
        <button
          className="icon-button"
          aria-label="Close search"
          type="button"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <form onSubmit={search} className="search-form">
        <Icon name="search" />
        <input
          aria-label="Search shared material"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a message or something shared"
          autoFocus
        />
        <button className="plain-button" type="submit">
          Find
        </button>
      </form>
      <div className="results">
        {!searched ? (
          <div className="search-empty">
            <Icon name="search" />
            <h3>Find it here.</h3>
            <p>Messages, links, photos, and files.</p>
            <button
              className="suggestion"
              type="button"
              onClick={() => setQuery('camera')}
            >
              Try “camera”
            </button>
          </div>
        ) : results.length ? (
          <>
            <p className="result-intro" role="status">
              {results.length} matches <span>for “{submitted}”</span>
            </p>
            <div className="result-date">Today</div>
            {groups.map((m) => (
              <article
                className={`result ${m.items ? 'material-result' : 'message-result'}`}
                key={`${submitted}-${m.id}`}
              >
                <div className="result-meta">
                  <span>{m.author_name || m.items?.[0]?.author_name}</span>
                  <time>{formatTime(m.created_at)}</time>
                </div>
                {m.items ? (
                  <MaterialRun
                    items={m.items}
                    result
                    onJump={onJump}
                    onFeedback={onFeedback}
                  />
                ) : (
                  <>
                    <button
                      className="result-message"
                      type="button"
                      onClick={() => onJump(m.id)}
                      aria-label={`Show message in conversation: ${m.body}`}
                    >
                      <span>{m.body}</span>
                      <Icon name="chevron" />
                    </button>
                    <div className="result-actions">
                      <button type="button" onClick={() => onJump(m.id)}>
                        Show in conversation ↗
                      </button>
                      <button
                        type="button"
                        onClick={() => onFeedback?.(m)}
                        aria-label={`Feedback on result: ${m.body}`}
                      >
                        ···
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </>
        ) : (
          <div className="search-empty">
            <Icon name="search" />
            <h3>No matches.</h3>
            <p>Try a different word or phrase.</p>
            <button
              className="suggestion"
              type="button"
              onClick={() => onFeedback?.(null)}
            >
              Something missing?
            </button>
          </div>
        )}
      </div>
      <div className="search-footer">
        {searched && results.length > 0 && (
          <button
            className="share-search"
            type="button"
            onClick={() => onShare(submitted, results)}
          >
            <Icon name="plus" />
            Share results in chat
          </button>
        )}
        <p className="search-note">Text matches only · Phase 1</p>
      </div>
    </aside>
  )
}
