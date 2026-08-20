/**
 * The tick box on a task row.
 *
 * Presentational only — no press handling. The whole row is the tap target on the Today list
 * (a 24px box would be a miserable thing to hit), so the `Pressable` and the
 * `accessibilityRole="checkbox"` live on the row and this draws the state it is told about.
 *
 * The tick is an SVG polyline rather than a `✓` glyph: `react-native-svg` is already a
 * dependency for the charts, and a glyph's position inside its em box varies by platform font,
 * which shows up as a mark that sits visibly off-centre on one OS and not the other.
 */

import Svg, { Polyline } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

const SIZE = 28;

type Props = {
  checked: boolean;
  /** Draws the outline in the accent colour — used for "due today, not done yet". */
  highlighted?: boolean;
};

export function Checkbox({ checked, highlighted = false }: Props) {
  return (
    <View
      style={[
        styles.box,
        highlighted && !checked && styles.highlighted,
        checked && styles.boxChecked,
      ]}
    >
      {checked ? (
        <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
          <Polyline
            points="7,13.5 11,17.5 19,8.5"
            fill="none"
            stroke={colors.accentText}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlighted: { borderColor: colors.accent },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
});
