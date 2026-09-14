import { MaterialRun } from './MaterialRun'

/**
 * Package message (kind=package) — MaterialRun from living_packages.share_ids.
 * No ··· feedback on items.
 */
export function LivingPackage({ message }) {
  const pkg = message.package || {}
  const shares = Array.isArray(message.packageShares) ? message.packageShares : []
  const title = pkg.title || message.body || 'Package'
  const summary = pkg.summary || ''

  if (!shares.length) {
    return (
      <details className="material-run living-package">
        <summary>
          <span className="run-copy">
            <strong>{title}</strong>
            <span>{summary || 'Loading saved items…'}</span>
          </span>
        </summary>
      </details>
    )
  }

  const items = shares.map((share) => ({
    id: `pkg-share-${share.id}`,
    kind: 'attachment',
    body: '',
    share,
    created_at: message.created_at,
  }))

  return <MaterialRun items={items} title={title} summary={summary} />
}
