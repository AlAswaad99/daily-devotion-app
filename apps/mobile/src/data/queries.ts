/**
 * The library's SQL, as plain strings.
 *
 * Separated from the repository so tests can run exactly these statements against a
 * plain SQLite. An earlier inner join here silently hid a devotion whose book row
 * was missing, and nothing caught it because the SQL was unreachable outside a
 * device.
 */

/** Only books that actually have a visible day. A future book has none. */
export const BOOKS_SQL = `
  select b.id, b.sequence, b.title_en, b.title_am
  from books b
  where exists (select 1 from devotion_days d where d.book_id = b.id)
  order by b.sequence
`

export const LIBRARY_DAYS_SQL = `
select d.id, d.book_id, d.day_number, d.kind, d.topic_en, d.topic_am,
            d.purpose_en, d.purpose_am, d.scheduled_date, d.passage,
            (c.devotion_day_id is not null) as completed,
            exists (select 1 from reflections r
                     where r.devotion_day_id = d.id and trim(r.body) <> '') as reflected,
            (v.devotion_day_id is not null) as favourite
     from devotion_days d
     left join day_completions c on c.devotion_day_id = d.id
     left join favorites v on v.devotion_day_id = d.id
     where d.scheduled_date is not null
     order by d.scheduled_date desc
`
