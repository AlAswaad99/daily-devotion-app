/**
 * Phase 0 placeholder. The real dashboard — bilingual editor, import UI,
 * scheduling calendar in the Ethiopian calendar, review and publish — is Phase 5.
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <p style={{ letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 12, color: 'var(--muted)' }}>
        Abide · Phase 0
      </p>
      <h1 style={{ fontSize: '2rem', margin: '.4rem 0 1rem' }}>Admin dashboard</h1>
      <p style={{ color: 'var(--muted)' }}>
        Foundations only. Content authoring, scheduling, and publishing land in Phase 5.
      </p>
      <p style={{ color: 'var(--muted)', borderLeft: '3px solid var(--line)', paddingLeft: '1rem' }}>
        This app authenticates as the admin&rsquo;s own user and never holds a
        service-role key, so the database policy keeping reflections private applies
        here too.
      </p>
    </main>
  )
}
