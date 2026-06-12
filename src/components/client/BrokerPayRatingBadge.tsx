import type { BrokerPayRating } from '../../types/clientBroker'
import { getBrokerPayRatingLabel } from '../../utils/clientBrokers'
import { useClientTheme } from '../../theme/ThemeContext'

interface BrokerPayRatingBadgeProps {
  rating: BrokerPayRating
  showLabel?: boolean
  size?: 'sm' | 'md'
}

/** Green / yellow / red pay reliability indicator. */
export default function BrokerPayRatingBadge({
  rating,
  showLabel = true,
  size = 'md',
}: BrokerPayRatingBadgeProps) {
  const c = useClientTheme()

  const colors = {
    green: { bg: c.stat.green, dot: c.success, text: c.success },
    yellow: { bg: c.stat.amber, dot: c.warning, text: c.warning },
    red: { bg: c.stat.red, dot: c.error, text: c.error },
  }[rating]

  return (
    <span
      className={`broker-pay-rating broker-pay-rating--${rating} broker-pay-rating--${size}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
      title={getBrokerPayRatingLabel(rating)}
    >
      <span className="broker-pay-rating__dot" style={{ backgroundColor: colors.dot }} />
      {showLabel && <span>{getBrokerPayRatingLabel(rating)}</span>}
    </span>
  )
}
