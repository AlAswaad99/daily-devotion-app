import { StyleSheet, Text, View } from 'react-native'
import type { Language } from '@abide/domain'
import { CtaGradient } from './Backdrop'
import { ReflectionField } from './ReflectionField'
import { lineHeightFor, translate } from '../lib/i18n'
import { fonts, theme } from '../lib/theme'

export interface SummaryQuestion {
  ordinal: number
  question_en: string
  question_am: string
}

/**
 * The end-of-book questions, one card each.
 *
 * **The count is whatever the ministry wrote.** The design draws four and hardcodes
 * four generic ones; the app has a `summary_questions` table, per book and bilingual,
 * and the seeded books have four, three and three. Taking the design's literally would
 * have thrown away an authoring feature that already exists and replaced real questions
 * about Ruth and 1 Timothy with placeholders about "this series".
 *
 * Nothing here is a completion condition. Reflections are optional everywhere else in
 * the app and this is no exception — the progress bar counts what has been answered, it
 * does not gate anything, and the day can be finished with none of them written.
 */
export function SummaryQuestions({
  questions,
  answers,
  onAnswer,
  language,
}: {
  questions: SummaryQuestion[]
  answers: Record<number, string>
  onAnswer: (ordinal: number, text: string) => Promise<void>
  language: Language
}) {
  const f = fonts(language)
  const answered = questions.filter((q) => (answers[q.ordinal] ?? '').trim().length > 0).length
  const ratio = questions.length === 0 ? 0 : answered / questions.length

  return (
    <View style={styles.wrap}>
      {/* The lede lives in the reader's own header now, directly under the title. */}
      <View style={styles.progressRow}>
        <View style={styles.track}>
          {/* Width, not scaleX: a scaled bar drags its rounded ends out of shape. */}
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]}>
            <CtaGradient style={styles.fillPaint} />
          </View>
        </View>
        <Text style={[styles.progressText, { fontFamily: f.labelStrong }]}>
          {answered}/{questions.length} {translate('answered', language)}
        </Text>
      </View>

      {questions.map((question) => {
        const value = answers[question.ordinal] ?? ''
        const done = value.trim().length > 0
        return (
          <View key={question.ordinal} style={styles.card}>
            <View style={styles.head}>
              <View style={[styles.chip, !done && styles.chipOff]}>
                {done && <CtaGradient style={styles.chipPaint} />}
                <Text
                  style={[styles.chipText, { fontFamily: f.numeric }, !done && styles.chipTextOff]}
                >
                  {question.ordinal}
                </Text>
              </View>
              <Text
                style={[
                  styles.question,
                  { fontFamily: f.body, lineHeight: lineHeightFor(language, 16.5) },
                ]}
              >
                {language === 'am' ? question.question_am : question.question_en}
              </Text>
            </View>

            <ReflectionField
              value={value}
              onSave={(text) => onAnswer(question.ordinal, text)}
              placeholder={translate('answerPlaceholder', language)}
              inputStyle={styles.field}
            />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5) },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: theme.color.track,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  fillPaint: { borderRadius: 3 },
  progressText: {
    fontSize: 11.5,
    letterSpacing: 0,
    color: theme.color.accent,
  },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(1.5) },
  chip: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipOff: { backgroundColor: theme.color.panel },
  chipPaint: { borderRadius: 10 },
  chipText: { fontSize: 12, color: theme.color.inkDeep },
  chipTextOff: { color: theme.color.kicker },
  question: { flex: 1, fontSize: 16.5, color: theme.color.ink },

  /* Inset rather than raised: it sits inside a card that is already white. */
  field: {
    minHeight: 76,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 15.5,
    backgroundColor: theme.color.field,
  },
})
